// Mock localStorage for Zustand persist middleware in node environment.
// Zustand's persist middleware checks `window.localStorage`, so we must
// polyfill both `globalThis.localStorage` and `window.localStorage`.
const store = new Map<string, string>();
const mockStorage: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
  get length() {
    return store.size;
  },
  key: (index: number) => [...store.keys()][index] ?? null,
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true });
}

// Create a minimal `window` object so Zustand can find `window.localStorage`
if (typeof window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: mockStorage },
    writable: true,
  });
} else if (!window.localStorage) {
  Object.defineProperty(window, 'localStorage', { value: mockStorage, writable: true });
}
