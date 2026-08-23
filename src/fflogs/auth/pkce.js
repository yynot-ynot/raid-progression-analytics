const PKCE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * Generate an RFC 7636-compatible PKCE code verifier.
 *
 * @param {number} length
 * @param {Crypto} cryptoLike
 * @returns {string}
 */
export function generateCodeVerifier(length = 128, cryptoLike = globalThis.crypto) {
  if (length < 43 || length > 128) {
    throw new RangeError("PKCE verifier length must be between 43 and 128 characters");
  }

  if (!cryptoLike?.getRandomValues) {
    throw new Error("crypto.getRandomValues is required to generate a PKCE verifier");
  }

  const randomValues = new Uint8Array(length);
  cryptoLike.getRandomValues(randomValues);

  let verifier = "";
  for (const value of randomValues) {
    verifier += PKCE_CHARSET[value % PKCE_CHARSET.length];
  }

  return verifier;
}

/**
 * Convert bytes to unpadded base64url, as required for PKCE challenges.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base64UrlEncode(bytes) {
  const binary = String.fromCharCode(...bytes);

  if (typeof btoa === "function") {
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  return Buffer.from(binary, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a SHA-256 based PKCE code challenge for a verifier.
 *
 * @param {string} verifier
 * @param {Crypto} cryptoLike
 * @returns {Promise<string>}
 */
export async function generateCodeChallenge(verifier, cryptoLike = globalThis.crypto) {
  if (!cryptoLike?.subtle?.digest) {
    throw new Error("crypto.subtle.digest is required to generate a PKCE challenge");
  }

  const data = new TextEncoder().encode(verifier);
  const digest = await cryptoLike.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate an OAuth state value used to protect the callback from CSRF.
 *
 * @param {Crypto} cryptoLike
 * @returns {string}
 */
export function generateOAuthState(cryptoLike = globalThis.crypto) {
  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID();
  }

  return generateCodeVerifier(64, cryptoLike);
}
