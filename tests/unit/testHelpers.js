/**
 * Create a minimal in-memory Storage-compatible object for tests.
 *
 * @param {Record<string, string>} initial
 * @returns {Storage}
 */
export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    dump() {
      return Object.fromEntries(data.entries());
    },
  };
}

/**
 * Create a fetch Response-like object that returns JSON.
 *
 * @param {{ok?: boolean, status?: number, payload?: object}} options
 * @returns {object}
 */
export function createJsonResponse({ ok = true, status = 200, payload = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

/**
 * Create a fetch mock that records calls and returns queued responses.
 *
 * @param {Array<object|Function>} responses
 * @returns {Function & {calls: object[]}}
 */
export function createFetchMock(responses = []) {
  const calls = [];
  const queue = [...responses];

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (queue.length === 0) {
      throw new Error("No mocked fetch response available");
    }

    const next = queue.shift();
    if (typeof next === "function") {
      return next(url, options);
    }
    return next;
  };

  fetchImpl.calls = calls;
  return fetchImpl;
}

/** Deterministic Crypto-like object for reproducible PKCE tests. */
export const deterministicCrypto = {
  getRandomValues(array) {
    for (let index = 0; index < array.length; index += 1) {
      array[index] = index;
    }
    return array;
  },
  randomUUID() {
    return "00000000-0000-4000-8000-000000000000";
  },
  subtle: globalThis.crypto.subtle,
};
