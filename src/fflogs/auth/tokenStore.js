const DEFAULT_STORAGE_KEY = "raid_progression_analytics.fflogs.token";

/**
 * Session-oriented token store for FFLogs OAuth responses.
 *
 * Tokens are mirrored in memory and sessionStorage so page refreshes during a
 * workflow can keep working, while still avoiding durable localStorage.
 */
export class TokenStore {
  /**
   * @param {{storage?: Storage, storageKey?: string, now?: () => number}} options
   */
  constructor({
    storage = globalThis.sessionStorage,
    storageKey = DEFAULT_STORAGE_KEY,
    now = () => Date.now(),
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.now = now;
    this.memoryToken = null;
  }

  /**
   * Persist a token response and derive `expires_at` when `expires_in` exists.
   *
   * @param {{access_token: string, expires_in?: number}} tokenResponse
   * @returns {object}
   */
  saveTokenResponse(tokenResponse) {
    if (!tokenResponse?.access_token) {
      throw new Error("Cannot store FFLogs token response without access_token");
    }

    const stored = {
      ...tokenResponse,
      expires_at: tokenResponse.expires_in
        ? this.now() + Number(tokenResponse.expires_in) * 1000
        : null,
    };

    this.memoryToken = stored;
    this.storage?.setItem?.(this.storageKey, JSON.stringify(stored));
    return stored;
  }

  /**
   * Read the active non-expired token response, if one exists.
   *
   * @returns {object|null}
   */
  getTokenResponse() {
    const token = this.memoryToken || this.readFromStorage();
    if (!token) return null;

    if (this.isExpired(token)) {
      this.clearToken();
      return null;
    }

    return token;
  }

  /**
   * Return only the bearer token string used by API calls.
   *
   * @returns {string|null}
   */
  getAccessToken() {
    return this.getTokenResponse()?.access_token || null;
  }

  /**
   * Whether a usable access token is currently available.
   *
   * @returns {boolean}
   */
  isAuthenticated() {
    return Boolean(this.getAccessToken());
  }

  /**
   * Clear token data from memory and session storage.
   */
  clearToken() {
    this.memoryToken = null;
    this.storage?.removeItem?.(this.storageKey);
  }

  /**
   * Determine whether a token has passed its computed expiry timestamp.
   *
   * @param {object|null} token
   * @returns {boolean}
   */
  isExpired(token = this.memoryToken) {
    return Boolean(token?.expires_at && this.now() >= token.expires_at);
  }

  /**
   * Load and parse token data from storage, deleting invalid JSON.
   *
   * @returns {object|null}
   */
  readFromStorage() {
    const raw = this.storage?.getItem?.(this.storageKey);
    if (!raw) return null;

    try {
      this.memoryToken = JSON.parse(raw);
      return this.memoryToken;
    } catch {
      this.storage?.removeItem?.(this.storageKey);
      return null;
    }
  }
}

/**
 * Convenience factory for dependency injection in app code and tests.
 *
 * @param {ConstructorParameters<typeof TokenStore>[0]} options
 * @returns {TokenStore}
 */
export function createTokenStore(options) {
  return new TokenStore(options);
}
