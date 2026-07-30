import type { KVStore } from "./kv-store";

export class MemoryKVStore<V = unknown> implements KVStore<V> {
  private readonly data = new Map<string, V>();

  async get(key: string): Promise<V | undefined> {
    return this.data.get(key);
  }

  async set(key: string, value: V): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async entries(prefix?: string): Promise<Array<[string, V]>> {
    const entries = Array.from(this.data.entries());
    return prefix ? entries.filter(([key]) => key.startsWith(prefix)) : entries;
  }

  async batch(
    puts: ReadonlyArray<readonly [string, V]>,
    deletes: readonly string[],
  ): Promise<void> {
    const next = new Map(this.data);
    for (const key of deletes) next.delete(key);
    for (const [key, value] of puts) next.set(key, value);
    this.data.clear();
    for (const [key, value] of next) this.data.set(key, value);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}
