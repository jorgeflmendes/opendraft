export interface KVStore<V = unknown> {
  /** Fetch a value; resolves with undefined when the key is absent. */
  get(key: string): Promise<V | undefined>;

  /** Write or overwrite. Resolves once the write is durable. */
  set(key: string, value: V): Promise<void>;

  /** Delete a key. No-op if absent. */
  delete(key: string): Promise<void>;

  /** Return every entry, in insertion order. */
  entries(prefix?: string): Promise<Array<[string, V]>>;

  /** Apply all writes and deletions atomically. */
  batch(puts: ReadonlyArray<readonly [string, V]>, deletes: readonly string[]): Promise<void>;

  /** Wipe every entry. */
  clear(): Promise<void>;
}
