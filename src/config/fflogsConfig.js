/**
 * Browser-safe FFLogs OAuth and GraphQL configuration.
 *
 * This app is registered as a Public Client, so only the client ID is present.
 * A client secret must never be added to this browser-delivered config.
 */
export const FFLOGS_CONFIG = Object.freeze({
  clientId: "019ffdd5-de85-70bb-a95d-b14ea6adb08c",
  authorizeUrl: "https://www.fflogs.com/oauth/authorize",
  tokenUrl: "https://www.fflogs.com/oauth/token",
  userGraphqlUrl: "https://www.fflogs.com/api/v2/user",
  redirectUri: null,
  clientType: "public",
  flow: "pkce",
  scopes: ["view-user-profile"],
});

/**
 * Derive the OAuth redirect URI from the current browser location.
 *
 * FFLogs requires the redirect URI used during token exchange to match the URI
 * sent during authorization, so this helper deliberately excludes query/hash.
 *
 * @param {{origin?: string, pathname?: string}} locationLike
 * @returns {string}
 */
export function deriveRedirectUri(locationLike = globalThis.location) {
  if (!locationLike?.origin || !locationLike?.pathname) {
    throw new Error("Cannot derive redirect URI without location origin and pathname");
  }

  return `${locationLike.origin}${locationLike.pathname}`;
}

/**
 * Return the configured redirect URI, falling back to the current page path.
 *
 * @param {{redirectUri?: string|null}} config
 * @param {{origin?: string, pathname?: string}} locationLike
 * @returns {string}
 */
export function getRedirectUri(config = FFLOGS_CONFIG, locationLike = globalThis.location) {
  return config.redirectUri || deriveRedirectUri(locationLike);
}
