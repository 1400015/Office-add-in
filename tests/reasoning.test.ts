import { describe, expect, it } from "vitest";
import {
  getReasoningStrategy,
  REASONING_LEVELS,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from "../src/config/reasoningProfiles";

describe("reasoning config", () => {
  it("exposes all five levels in order", () => {
    expect(REASONING_LEVELS).toEqual([
      "off",
      "low",
      "medium",
      "high",
      "maximum",
    ]);
  });

  it("off has no prompt suffix", () => {
    expect(getReasoningStrategy("off").systemPromptSuffix).toBe("");
  });

  it("every non-off level produces a non-empty suffix", () => {
    for (const level of REASONING_LEVELS) {
      if (level === "off") continue;
      expect(getReasoningStrategy(level).systemPromptSuffix.length).toBeGreaterThan(10);
    }
  });

  it("defaults match the PRD", () => {
    expect(DEFAULT_TEMPERATURE).toBe(0.2);
    expect(DEFAULT_MAX_TOKENS).toBe(8192);
  });

  it("caches strategies (same reference)", () => {
    expect(getReasoningStrategy("medium")).toBe(getReasoningStrategy("medium"));
  });
});
