/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { unavailableCompileService } from "./unavailable-compile-service";

describe("unavailableCompileService", () => {
  it("returns error status", async () => {
    const res = await unavailableCompileService.compile({
      project: { files: {}, folders: {} },
    } as any);
    expect(res.status).toBe("error");
    expect(res.engine).toBe("Browser TeX engine unavailable");
  });
});
