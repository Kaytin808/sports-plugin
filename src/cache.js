class TimedCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.items = new Map();
  }

  get(key) {
    const item = this.items.get(key);
    if (!item) return undefined;
    if (Date.now() - item.savedAt > this.ttlMs) {
      this.items.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key, value) {
    this.items.set(key, { savedAt: Date.now(), value });
    return value;
  }
}

module.exports = { TimedCache };
