#!/bin/bash
# memory-search.sh — Search across Energy's memory system with relevance scoring
# Usage: ./scripts/memory-search.sh "query" [--limit N] [--verbose]
#
# Searches: LEARNINGS.md, daily/*.md, topics/*.md, vault/*.md, rules/*.md
# Scoring: term frequency x recency x source weight
# Returns: top N results (default 5) with file path + surrounding context

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MEMORY_DIR="$PROJECT_DIR/memory"
BRAIN_DIR="$PROJECT_DIR/brain"
VAULT_DIR="$PROJECT_DIR/vault"
RULES_DIR="$PROJECT_DIR/.claude/rules"

# Parse arguments
QUERY=""
LIMIT=5
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: memory-search.sh \"query\" [--limit N] [--verbose]"
      echo ""
      echo "Searches across penny's memory system:"
      echo "  - brain/*.md (the payments expertise brain — primary index)"
      echo "  - memory/LEARNINGS.md (learnings & patterns)"
      echo "  - memory/daily/*.md (session logs)"
      echo "  - memory/topics/*.md (permanent topic files)"
      echo "  - vault/*.md (Obsidian notes)"
      echo "  - .claude/rules/*.md (hard rules)"
      echo ""
      echo "Options:"
      echo "  --limit N    Return top N results (default: 5)"
      echo "  --verbose    Show scoring details"
      exit 0
      ;;
    *)
      QUERY="$1"
      shift
      ;;
  esac
done

if [ -z "$QUERY" ]; then
  echo "Error: No query provided"
  echo "Usage: memory-search.sh \"query\" [--limit N] [--verbose]"
  exit 1
fi

# Split query into individual terms for scoring
IFS=' ' read -ra TERMS <<< "$QUERY"

# Temp file for results
RESULTS_FILE=$(mktemp)
trap "rm -f $RESULTS_FILE" EXIT

# Source weight map (higher = more authoritative)
weight_for_source() {
  local file="$1"
  case "$file" in
    */brain/*)           echo 6 ;;  # penny override: the expertise brain IS the queryable index
    */.claude/rules/*)   echo 5 ;;  # Rules are highest priority
    */memory/LEARNINGS*) echo 4 ;;  # Learnings are core knowledge
    */memory/topics/*)   echo 4 ;;  # Topic files are curated
    */memory/daily/*)    echo 3 ;;  # Daily logs are session-scoped
    */vault/*)           echo 2 ;;  # Vault is navigation layer
    *)                   echo 1 ;;
  esac
}

# Recency weight: files modified recently score higher
recency_weight() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo 1
    return
  fi
  local age_days
  # macOS stat
  if stat -f %m "$file" >/dev/null 2>&1; then
    local mod_epoch
    mod_epoch=$(stat -f %m "$file")
    local now_epoch
    now_epoch=$(date +%s)
    age_days=$(( (now_epoch - mod_epoch) / 86400 ))
  else
    # Linux fallback
    age_days=$(( ($(date +%s) - $(stat -c %Y "$file")) / 86400 ))
  fi

  if [ "$age_days" -le 1 ]; then
    echo 10
  elif [ "$age_days" -le 3 ]; then
    echo 8
  elif [ "$age_days" -le 7 ]; then
    echo 6
  elif [ "$age_days" -le 14 ]; then
    echo 4
  elif [ "$age_days" -le 30 ]; then
    echo 2
  else
    echo 1
  fi
}

# Score a file: count matching term occurrences (BM25-like term frequency)
score_file() {
  local file="$1"
  local total_hits=0

  for term in "${TERMS[@]}"; do
    # Case-insensitive match count
    local hits
    hits=$(grep -ci "$term" "$file" 2>/dev/null | tr -d '[:space:]' || true)
    hits=${hits:-0}
    [ -z "$hits" ] && hits=0
    total_hits=$((total_hits + hits))
  done

  echo "$total_hits"
}

# Extract context around the best match in a file
extract_context() {
  local file="$1"
  local context_lines=2

  # Find the line with the most query terms
  local best_line=0
  local best_score=0

  # Does the query itself ask about the eval pyramid / wiring? If not, demote those index/footer
  # lines so an on-point scenario body wins the snippet (a user asking "double charge on retries"
  # should see the S-02/P-02 war story, not the "How these wire into the eval pyramid" boilerplate).
  local query_is_meta=false
  if echo "$QUERY" | grep -qiE 'eval pyramid|dsip|L1|L2|L3|how these wire'; then
    query_is_meta=true
  fi

  # Candidate lines = any line matching ANY query term (not just the first). This lets a scenario
  # body that contains "double"/"charging"/"retries" win the snippet even when the leading word is a
  # stopword ("how"/"do"/"on") that only appears in index prose. Build one alternation pattern.
  local term_pattern=""
  for term in "${TERMS[@]}"; do
    # Escape regex metacharacters so a term like "200 OK" or "req.text()" is matched literally.
    local esc
    esc=$(printf '%s' "$term" | sed 's/[][\\.*^$(){}+?|]/\\&/g')
    [ -z "$esc" ] && continue
    if [ -z "$term_pattern" ]; then term_pattern="$esc"; else term_pattern="$term_pattern|$esc"; fi
  done
  [ -z "$term_pattern" ] && term_pattern="${TERMS[0]}"

  while IFS= read -r line_data; do
    local line_num="${line_data%%:*}"
    local line_content="${line_data#*:}"
    local line_score=0

    for term in "${TERMS[@]}"; do
      if echo "$line_content" | grep -qi "$term" 2>/dev/null; then
        line_score=$((line_score + 1))
      fi
    done

    # Demote index/footer boilerplate (the eval-pyramid wiring section + its "**L1 (… ):**" index
    # rows, which densely reference scenario IDs and term-match strongly without being the answer).
    # Skip the demotion if the user is actually asking about the pyramid.
    if [ "$query_is_meta" = false ] &&
       echo "$line_content" | grep -qiE 'how these wire into the eval pyramid|\*\*L[123] \(|wire into the eval'; then
      line_score=0
    fi

    if [ "$line_score" -gt "$best_score" ]; then
      best_score=$line_score
      best_line=$line_num
    fi
  done < <(grep -niE "$term_pattern" "$file" 2>/dev/null | head -40)

  if [ "$best_line" -gt 0 ]; then
    local start=$((best_line - context_lines))
    [ "$start" -lt 1 ] && start=1
    local end=$((best_line + context_lines))
    sed -n "${start},${end}p" "$file" 2>/dev/null
  fi
}

# Build file list to search
FILES=()

# Brain artifacts — penny's expertise index (the override: index brain/, not code history).
# The six brain artifacts are the primary corpus; queries like "idempotency one transaction"
# resolve to O-02 / S-02 / P-02 here.
for f in "$BRAIN_DIR"/*.md; do
  [ -f "$f" ] && FILES+=("$f")
done

# LEARNINGS.md
[ -f "$MEMORY_DIR/LEARNINGS.md" ] && FILES+=("$MEMORY_DIR/LEARNINGS.md")

# Daily logs
for f in "$MEMORY_DIR"/daily/*.md; do
  [ -f "$f" ] && FILES+=("$f")
done

# Topic files
for f in "$MEMORY_DIR"/topics/*.md; do
  [ -f "$f" ] && FILES+=("$f")
done

# Vault notes
for f in "$VAULT_DIR"/*.md; do
  [ -f "$f" ] && FILES+=("$f")
done

# Rules
for f in "$RULES_DIR"/*.md; do
  [ -f "$f" ] && FILES+=("$f")
done

# Archive (lower priority but still searchable)
for f in "$MEMORY_DIR"/archive/*.md; do
  [ -f "$f" ] && FILES+=("$f")
done

# Score each file
for file in "${FILES[@]}"; do
  tf_score=$(score_file "$file")
  [ "$tf_score" -eq 0 ] && continue

  src_weight=$(weight_for_source "$file")
  rec_weight=$(recency_weight "$file")

  # Combined score: tf * source_weight * recency_weight
  combined=$((tf_score * src_weight * rec_weight))

  # Relative path for display
  rel_path="${file#$PROJECT_DIR/}"

  echo "$combined|$rel_path|$tf_score|$src_weight|$rec_weight" >> "$RESULTS_FILE"
done

# Sort by score descending and take top N
if [ ! -s "$RESULTS_FILE" ]; then
  echo "No results found for: $QUERY"
  exit 0
fi

echo "=== Memory Search: \"$QUERY\" ==="
echo ""

RANK=0
sort -t'|' -k1 -nr "$RESULTS_FILE" | head -"$LIMIT" | while IFS='|' read -r score path tf sw rw; do
  RANK=$((RANK + 1))
  echo "[$RANK] $path (score: $score)"

  if [ "$VERBOSE" = true ]; then
    echo "    term_freq=$tf  source_wt=$sw  recency_wt=$rw"
  fi

  # Show context
  full_path="$PROJECT_DIR/$path"
  context=$(extract_context "$full_path")
  if [ -n "$context" ]; then
    echo "    ---"
    echo "$context" | sed 's/^/    /'
    echo "    ---"
  fi
  echo ""
done

TOTAL=$(wc -l < "$RESULTS_FILE" | tr -d ' ')
echo "Found $TOTAL matching files. Showing top $LIMIT."
