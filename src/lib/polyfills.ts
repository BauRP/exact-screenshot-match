// Runtime polyfills for older Android WebView engines (Android 9 / Chrome 69).
// Loaded eagerly before app code so third-party libs relying on ES2020+
// methods don't crash the app on legacy devices.

const rootObject: any =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof self !== "undefined"
      ? self
      : typeof window !== "undefined"
        ? window
        : Function("return this")();

if (typeof rootObject.globalThis === "undefined") {
  Object.defineProperty(rootObject, "globalThis", {
    configurable: true,
    writable: true,
    value: rootObject,
  });
}

if (typeof rootObject.queueMicrotask !== "function") {
  rootObject.queueMicrotask = function queueMicrotaskPolyfill(cb: () => void) {
    Promise.resolve()
      .then(cb)
      .catch((err) => setTimeout(() => { throw err; }, 0));
  };
}

if (typeof String.prototype.replaceAll !== "function") {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(String.prototype, "replaceAll", {
    configurable: true,
    writable: true,
    value: function replaceAll(
      this: string,
      search: string | RegExp,
      replacement: any,
    ): string {
      if (search instanceof RegExp) {
        if (!search.flags.includes("g")) {
          throw new TypeError(
            "String.prototype.replaceAll called with a non-global RegExp",
          );
        }
        return this.replace(search, replacement);
      }
      const str = String(search);
      const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return this.replace(new RegExp(escaped, "g"), replacement);
    },
  });
}

if (typeof (Array.prototype as any).at !== "function") {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, "at", {
    configurable: true,
    writable: true,
    value: function at(this: any[], n: number) {
      const len = this.length;
      const i = Math.trunc(n) || 0;
      const idx = i < 0 ? len + i : i;
      if (idx < 0 || idx >= len) return undefined;
      return this[idx];
    },
  });
}

if (typeof (String.prototype as any).at !== "function") {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(String.prototype, "at", {
    configurable: true,
    writable: true,
    value: function at(this: string, n: number) {
      const len = this.length;
      const i = Math.trunc(n) || 0;
      const idx = i < 0 ? len + i : i;
      if (idx < 0 || idx >= len) return undefined;
      return this[idx];
    },
  });
}

if (typeof (Object as any).hasOwn !== "function") {
  (Object as any).hasOwn = function hasOwn(obj: object, prop: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  };
}

if (typeof (Object as any).fromEntries !== "function") {
  (Object as any).fromEntries = function fromEntries(entries: Iterable<[PropertyKey, any]>) {
    const out: Record<PropertyKey, any> = {};
    for (const [key, value] of entries) out[key] = value;
    return out;
  };
}

if (typeof (Promise as any).allSettled !== "function") {
  (Promise as any).allSettled = function allSettled(promises: Iterable<unknown>) {
    return Promise.all(
      Array.from(promises).map((promise) =>
        Promise.resolve(promise).then(
          (value) => ({ status: "fulfilled", value }),
          (reason) => ({ status: "rejected", reason }),
        ),
      ),
    );
  };
}

try {
  const c = rootObject.crypto;
  if (c && typeof c.randomUUID !== "function") {
    c.randomUUID = function randomUUID() {
      const bytes = new Uint8Array(16);
      if (typeof c.getRandomValues === "function") {
        c.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i += 1) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    };
  }
} catch {}

export {};
