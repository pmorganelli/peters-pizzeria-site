// Node 26 exposes optional process-level localStorage/sessionStorage accessors.
// Without CLI backing files they resolve to undefined and shadow jsdom's
// origin-scoped implementations. Supply a small standards-shaped store in DOM
// workers so component tests behave the same across supported and newer Node.
if (typeof globalThis.window !== 'undefined') {
  const browserWindow = globalThis.window;
  class MemoryStorage {
    constructor() { this.data = new Map(); }
    get length() { return this.data.size; }
    clear() { this.data.clear(); }
    getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
    key(index) { return [...this.data.keys()][index] ?? null; }
    removeItem(key) { this.data.delete(String(key)); }
    setItem(key, value) { this.data.set(String(key), String(value)); }
  }

  Object.defineProperty(globalThis, 'Storage', { configurable: true, value: MemoryStorage });
  Object.defineProperty(browserWindow, 'Storage', { configurable: true, value: MemoryStorage });
  for (const name of ['localStorage', 'sessionStorage']) {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, name, { configurable: true, value: storage });
    Object.defineProperty(browserWindow, name, { configurable: true, value: storage });
  }
}
