// The L3 LLM judge asks only the model named in PENNY_JUDGE_MODEL: the Messages API needs a model name, and penny
// never picks one. The SDK is mocked, so this test never reaches the network.
import { afterEach, describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({
  create: vi.fn(async () => ({ content: [{ type: "text", text: "PASS" }] })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { judgeLlm } from "../eval/judge.js";

afterEach(() => {
  vi.unstubAllEnvs();
  create.mockClear();
});

describe("the L3 LLM judge", () => {
  it("refuses, and calls nothing, with a key but no PENNY_JUDGE_MODEL", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("PENNY_JUDGE_MODEL", "");
    await expect(judgeLlm("GT-10", "candidate")).rejects.toThrow(/PENNY_JUDGE_MODEL/);
    expect(create).not.toHaveBeenCalled();
  });

  it("asks the model named in PENNY_JUDGE_MODEL", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("PENNY_JUDGE_MODEL", "judge-model-from-env");
    await judgeLlm("GT-10", "candidate");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "judge-model-from-env" }));
  });
});
