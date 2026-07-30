declare global {
  interface Map<K, V> {
    getOrInsert?(key: K, value: V): V;
    getOrInsertComputed?(key: K, callbackfn: (key: K) => V): V;
  }

  interface WeakMap<K extends WeakKey, V> {
    getOrInsert?(key: K, value: V): V;
    getOrInsertComputed?(key: K, callbackfn: (key: K) => V): V;
  }
}

if (typeof Map.prototype.getOrInsert !== "function") {
  Object.defineProperty(Map.prototype, "getOrInsert", {
    configurable: true,
    writable: true,
    value: function getOrInsert<K, V>(this: Map<K, V>, key: K, value: V): V {
      if (this.has(key)) return this.get(key) as V;
      this.set(key, value);
      return value;
    },
  });
}

if (typeof Map.prototype.getOrInsertComputed !== "function") {
  Object.defineProperty(Map.prototype, "getOrInsertComputed", {
    configurable: true,
    writable: true,
    value: function getOrInsertComputed<K, V>(
      this: Map<K, V>,
      key: K,
      callbackfn: (key: K) => V,
    ): V {
      if (this.has(key)) return this.get(key) as V;
      if (typeof callbackfn !== "function") {
        throw new TypeError("getOrInsertComputed: callbackfn must be a function");
      }
      const value = callbackfn(key);
      this.set(key, value);
      return value;
    },
  });
}

if (typeof WeakMap.prototype.getOrInsert !== "function") {
  Object.defineProperty(WeakMap.prototype, "getOrInsert", {
    configurable: true,
    writable: true,
    value: function getOrInsert<K extends WeakKey, V>(this: WeakMap<K, V>, key: K, value: V): V {
      if (this.has(key)) return this.get(key) as V;
      this.set(key, value);
      return value;
    },
  });
}

if (typeof WeakMap.prototype.getOrInsertComputed !== "function") {
  Object.defineProperty(WeakMap.prototype, "getOrInsertComputed", {
    configurable: true,
    writable: true,
    value: function getOrInsertComputed<K extends WeakKey, V>(
      this: WeakMap<K, V>,
      key: K,
      callbackfn: (key: K) => V,
    ): V {
      if (this.has(key)) return this.get(key) as V;
      if (typeof callbackfn !== "function") {
        throw new TypeError("getOrInsertComputed: callbackfn must be a function");
      }
      const value = callbackfn(key);
      this.set(key, value);
      return value;
    },
  });
}
