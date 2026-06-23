import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

if (!localStorageDescriptor || localStorageDescriptor.get) {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return data.size;
      },
      clear() {
        data.clear();
      },
      getItem(key: string) {
        return data.has(key) ? data.get(key)! : null;
      },
      key(index: number) {
        return Array.from(data.keys())[index] ?? null;
      },
      removeItem(key: string) {
        data.delete(key);
      },
      setItem(key: string, value: string) {
        data.set(key, String(value));
      },
    } satisfies Storage,
  });
}
