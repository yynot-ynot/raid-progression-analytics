import { FFLOGS_CONFIG, getRedirectUri } from "../../config/fflogsConfig.js";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
} from "./pkce.js";
import { TokenStore } from "./tokenStore.js";

/** Session key for the one-time PKCE verifier used during OAuth callback. */
export const PKCE_VERIFIER_KEY = "raid_progression_analytics.fflogs.pkce_verifier";

/** Session key for the OAuth state value used to validate the callback. */
export const OAUTH_STATE_KEY = "raid_progression_analytics.fflogs.oauth_state";

/**
 * Build the FFLogs authorization URL for the PKCE code flow.
 *
 * @param {object} params
 * @returns {string}
 */
export function buildAuthorizeUrl({
  authorizeUrl = FFLOGS_CONFIG.authorizeUrl,
  clientId = FFLOGS_CONFIG.clientId,
  redirectUri,
  codeChallenge,
  state,
}) {
  const url = new URL(authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Prepare a login redirect by generating PKCE/state values and storing them.
 *
 * @param {object} options
 * @returns {Promise<{verifier: string, state: string, redirectUri: string, authorizeUrl: string}>}
 */
export async function prepareLogin({
  config = FFLOGS_CONFIG,
  locationLike = globalThis.location,
  storage = globalThis.sessionStorage,
  cryptoLike = globalThis.crypto,
  verifier = generateCodeVerifier(128, cryptoLike),
  state = generateOAuthState(cryptoLike),
} = {}) {
  const redirectUri = getRedirectUri(config, locationLike);
  const codeChallenge = await generateCodeChallenge(verifier, cryptoLike);

  storage?.setItem?.(PKCE_VERIFIER_KEY, verifier);
  storage?.setItem?.(OAUTH_STATE_KEY, state);

  return {
    verifier,
    state,
    redirectUri,
    authorizeUrl: buildAuthorizeUrl({
      authorizeUrl: config.authorizeUrl,
      clientId: config.clientId,
      redirectUri,
      codeChallenge,
      state,
    }),
  };
}

/**
 * Start FFLogs login by assigning the prepared authorization URL to location.
 *
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function startLogin(options = {}) {
  const prepared = await prepareLogin(options);
  const locationLike = options.locationLike || globalThis.location;

  if (!locationLike) {
    throw new Error("Cannot start FFLogs login without a browser location");
  }

  locationLike.href = prepared.authorizeUrl;
  return prepared;
}

/**
 * Exchange an authorization code for an FFLogs token using PKCE.
 *
 * This request intentionally sends no client secret because the app is a
 * browser-based Public Client.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function exchangeCodeForToken({
  code,
  verifier,
  redirectUri,
  config = FFLOGS_CONFIG,
  fetchImpl = globalThis.fetch,
}) {
  if (!code) throw new Error("Cannot exchange FFLogs OAuth code: missing code");
  if (!verifier) throw new Error("Cannot exchange FFLogs OAuth code: missing PKCE verifier");
  if (!fetchImpl) throw new Error("fetch is required to exchange FFLogs OAuth code");

  const response = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`FFLogs token exchange failed with HTTP ${response.status}`);
  }
  if (!payload?.access_token) {
    throw new Error("FFLogs token exchange response did not include access_token");
  }

  return payload;
}

/**
 * Complete the OAuth callback: validate state, exchange code, store token, and
 * clean one-time callback artifacts.
 *
 * @param {object} options
 * @returns {Promise<object|null>}
 */
export async function completeLogin({
  callbackUrl,
  config = FFLOGS_CONFIG,
  locationLike = globalThis.location,
  storage = globalThis.sessionStorage,
  fetchImpl = globalThis.fetch,
  tokenStore = new TokenStore({ storage }),
} = {}) {
  const url = new URL(callbackUrl || `${locationLike.origin}${locationLike.pathname}${locationLike.search}`);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    throw new Error(`FFLogs OAuth returned error: ${oauthError}`);
  }
  if (!code) return null;

  const expectedState = storage?.getItem?.(OAUTH_STATE_KEY);
  if (!expectedState || returnedState !== expectedState) {
    throw new Error("FFLogs OAuth state mismatch");
  }

  const verifier = storage?.getItem?.(PKCE_VERIFIER_KEY);
  const redirectUri = getRedirectUri(config, locationLike);
  const tokenResponse = await exchangeCodeForToken({
    code,
    verifier,
    redirectUri,
    config,
    fetchImpl,
  });

  tokenStore.saveTokenResponse(tokenResponse);
  storage?.removeItem?.(PKCE_VERIFIER_KEY);
  storage?.removeItem?.(OAUTH_STATE_KEY);

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  if (locationLike?.history?.replaceState) {
    locationLike.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return tokenResponse;
}
