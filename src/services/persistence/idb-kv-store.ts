import { openDB, type IDBPDatabase } from "idb";
import type { KVStore } from "./kv-store";
import { errorMessage } from "@/lib/errors";

// Single named DB with one object store. Schema upgrades will live
// in this file as numbered version bumps so the migration path is
// inspectable in one place.

const DB_NAME = "opendraft";
const DB_VERSION = 1;
const STORE = "kv";

interface OpenOptions {
  /** Override for tests or namespaced stores. */
  dbName?: string;
}

/**
 * IndexedDB-backed KVStore. One database (`opendraft`) with one
 * object store (`kv`). Values are stored as-is - IndexedDB
 * structured-clones them, so the caller gets a deep copy on every
 * read. That's what we want: callers can mutate without affecting
 * persisted state.
 */
export class IDBKVStore<V = unknown> implements KVStore<V> {
  private readonly opening: Promise<IDBPDatabase>;

  constructor(options: OpenOptions = {}) {
    const dbName = options.dbName ?? DB_NAME;
    this.opening = openDB(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }

  async get(key: string): Promise<V | undefined> {
    const db = await this.opening;
    return (await db.get(STORE, key)) as V | undefined;
  }

  async set(key: string, value: V): Promise<void> {
    const db = await this.opening;
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    await tx.done.catch((e) => {
      throw new Error(`IndexedDB write failed: ${errorMessage(e)}`);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.opening;
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    await tx.done.catch((e) => {
      throw new Error(`IndexedDB delete failed: ${errorMessage(e)}`);
    });
  }

  async batch(
    puts: ReadonlyArray<readonly [string, V]>,
    deletes: readonly string[],
  ): Promise<void> {
    try {
      for (const [, value] of puts) structuredClone(value);
    } catch (error) {
      throw new Error(`IndexedDB batch failed: ${errorMessage(error)}`);
    }
    const db = await this.opening;
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    // Register the rejection handler before issuing requests: a synchronous
    // DataCloneError can abort the transaction during request construction.
    const done = tx.done;
    void done.catch(() => undefined);
    try {
      const requests = [
        ...deletes.map((key) => store.delete(key)),
        ...puts.map(([key, value]) => store.put(value, key)),
      ];
      await Promise.all(requests);
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // A failed request may already have aborted the transaction.
      }
      await done.catch(() => undefined);
      throw new Error(`IndexedDB batch failed: ${errorMessage(error)}`);
    }
  }

  async entries(prefix?: string): Promise<Array<[string, V]>> {
    const db = await this.opening;
    const tx = db.transaction(STORE, "readonly");

    // Prevent unhandled promise rejection if the transaction aborts
    // due to an error during cursor iteration.
    tx.done.catch(() => {});

    const store = tx.objectStore(STORE);
    const out: Array<[string, V]> = [];
    const range = prefix ? IDBKeyRange.bound(prefix, `${prefix}\uffff`) : undefined;
    let cursor = await store.openCursor(range);
    while (cursor) {
      out.push([String(cursor.key), cursor.value as V]);
      cursor = await cursor.continue();
    }
    await tx.done;
    return out;
  }

  async clear(): Promise<void> {
    const db = await this.opening;
    await db.clear(STORE);
  }
}
