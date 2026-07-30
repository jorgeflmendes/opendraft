import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IDBKVStore } from "./idb-kv-store";

function uniqueDatabaseName(): string {
  return `opendraft-test-${crypto.randomUUID()}`;
}

describe("IDBKVStore transactions", () => {
  it("commits puts and deletes as one batch", async () => {
    const store = new IDBKVStore<number>({ dbName: uniqueDatabaseName() });
    await store.set("remove", 1);

    await store.batch(
      [
        ["first", 2],
        ["second", 3],
      ],
      ["remove"],
    );

    expect(await store.entries()).toEqual([
      ["first", 2],
      ["second", 3],
    ]);
  });

  it("rejects an invalid batch before any write becomes visible", async () => {
    const store = new IDBKVStore<unknown>({ dbName: uniqueDatabaseName() });
    await store.set("existing", "safe");

    await expect(
      store.batch(
        [
          ["would-have-been-written", "unsafe partial state"],
          ["not-cloneable", () => undefined],
        ],
        [],
      ),
    ).rejects.toThrow(/batch failed/i);

    expect(await store.get("existing")).toBe("safe");
    expect(await store.get("would-have-been-written")).toBeUndefined();
  });
});
