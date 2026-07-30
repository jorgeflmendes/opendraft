import { describe, it, expect, beforeEach } from "vitest";
import { MemoryKVStore } from "./memory-kv-store";

describe("MemoryKVStore", () => {
  let store: MemoryKVStore<string>;
  beforeEach(() => {
    store = new MemoryKVStore<string>();
  });

  it("get() returns undefined for a missing key", async () => {
    expect(await store.get("nope")).toBeUndefined();
  });

  it("set() writes and get() reads", async () => {
    await store.set("a", "hello");
    expect(await store.get("a")).toBe("hello");
  });

  it("set() overwrites existing values", async () => {
    await store.set("a", "v1");
    await store.set("a", "v2");
    expect(await store.get("a")).toBe("v2");
  });

  it("delete() removes a key", async () => {
    await store.set("a", "x");
    await store.delete("a");
    expect(await store.get("a")).toBeUndefined();
  });

  it("delete() of a missing key is a no-op", async () => {
    await expect(store.delete("ghost")).resolves.toBeUndefined();
  });

  it("entries() returns every pair in insertion order", async () => {
    await store.set("a", "1");
    await store.set("b", "2");
    await store.set("c", "3");
    expect(await store.entries()).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ]);
  });

  it("entries() can restrict results to a key prefix", async () => {
    await store.set("project:one", "1");
    await store.set("file:one:main.tex", "2");
    await store.set("project:two", "3");

    expect(await store.entries("project:")).toEqual([
      ["project:one", "1"],
      ["project:two", "3"],
    ]);
  });

  it("clear() wipes everything", async () => {
    await store.set("a", "1");
    await store.set("b", "2");
    await store.clear();
    expect(await store.entries()).toEqual([]);
  });
});
