import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("uses the message from Error instances", () => {
    expect(errorMessage(new Error("storage failed"))).toBe("storage failed");
  });

  it("normalises non-Error rejection values", () => {
    expect(errorMessage("offline")).toBe("offline");
    expect(errorMessage(null)).toBe("null");
  });
});
