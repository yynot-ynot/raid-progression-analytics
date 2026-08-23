import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthorizeUrl,
  completeLogin,
  exchangeCodeForToken,
  OAUTH_STATE_KEY,
  PKCE_VERIFIER_KEY,
  prepareLogin,
} from "../../src/fflogs/auth/fflogsAuth.js";
import { parseOAuthCallback } from "../../src/fflogs/auth/oauthCallback.js";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
} from "../../src/fflogs/auth/pkce.js";
import { TokenStore } from "../../src/fflogs/auth/tokenStore.js";
import {
  createFetchMock,
  createJsonResponse,
  createMemoryStorage,
  deterministicCrypto,
} from "./testHelpers.js";

test("generateCodeVerifier creates RFC-valid verifier length and character set", () => {
  const verifier = generateCodeVerifier(64, deterministicCrypto);

  assert.equal(verifier.length, 64);
  assert.match(verifier, /^[A-Za-z0-9._~-]+$/);
});

test("generateCodeVerifier rejects invalid lengths", () => {
  assert.throws(() => generateCodeVerifier(42, deterministicCrypto), /between 43 and 128/);
  assert.throws(() => generateCodeVerifier(129, deterministicCrypto), /between 43 and 128/);
});

test("generateCodeChallenge produces known S256 base64url value", async () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = await generateCodeChallenge(verifier);

  assert.equal(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("generateOAuthState uses randomUUID when available", () => {
  assert.equal(generateOAuthState(deterministicCrypto), "00000000-0000-4000-8000-000000000000");
});

test("buildAuthorizeUrl includes all required FFLogs OAuth params", () => {
  const authorizeUrl = buildAuthorizeUrl({
    authorizeUrl: "https://www.fflogs.com/oauth/authorize",
    clientId: "client-id",
    redirectUri: "http://localhost:8080/",
    codeChallenge: "challenge",
    state: "state",
  });

  const url = new URL(authorizeUrl);
  assert.equal(url.origin + url.pathname, "https://www.fflogs.com/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:8080/");
  assert.equal(url.searchParams.get("code_challenge"), "challenge");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "state");
});

test("prepareLogin stores verifier and state in session storage", async () => {
  const storage = createMemoryStorage();
  const prepared = await prepareLogin({
    storage,
    cryptoLike: deterministicCrypto,
    verifier: "a".repeat(64),
    state: "state-value",
    locationLike: { origin: "http://localhost:8080", pathname: "/" },
  });

  assert.equal(storage.getItem(PKCE_VERIFIER_KEY), "a".repeat(64));
  assert.equal(storage.getItem(OAUTH_STATE_KEY), "state-value");
  assert.match(prepared.authorizeUrl, /code_challenge_method=S256/);
});

test("parseOAuthCallback reads success and error params", () => {
  assert.deepEqual(parseOAuthCallback("?code=abc&state=xyz"), {
    code: "abc",
    state: "xyz",
    error: null,
    errorDescription: null,
  });

  assert.deepEqual(parseOAuthCallback("?error=access_denied&error_description=nope"), {
    code: null,
    state: null,
    error: "access_denied",
    errorDescription: "nope",
  });
});

test("exchangeCodeForToken posts PKCE token request without client secret", async () => {
  const fetchImpl = createFetchMock([
    createJsonResponse({ payload: { access_token: "token", expires_in: 3600 } }),
  ]);

  const token = await exchangeCodeForToken({
    code: "code",
    verifier: "verifier",
    redirectUri: "http://localhost:8080/",
    fetchImpl,
  });

  assert.equal(token.access_token, "token");
  assert.equal(fetchImpl.calls[0].url, "https://www.fflogs.com/oauth/token");
  assert.equal(fetchImpl.calls[0].options.method, "POST");

  const body = fetchImpl.calls[0].options.body;
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "code");
  assert.equal(body.get("code_verifier"), "verifier");
  assert.equal(body.has("client_secret"), false);
});

test("exchangeCodeForToken throws when access_token is missing", async () => {
  const fetchImpl = createFetchMock([createJsonResponse({ payload: { error: "bad" } })]);

  await assert.rejects(
    () =>
      exchangeCodeForToken({
        code: "code",
        verifier: "verifier",
        redirectUri: "http://localhost:8080/",
        fetchImpl,
      }),
    /access_token/,
  );
});

test("completeLogin blocks state mismatch before token exchange", async () => {
  const storage = createMemoryStorage({
    [PKCE_VERIFIER_KEY]: "verifier",
    [OAUTH_STATE_KEY]: "expected",
  });
  const fetchImpl = createFetchMock([]);

  await assert.rejects(
    () =>
      completeLogin({
        callbackUrl: "http://localhost:8080/?code=code&state=wrong",
        storage,
        fetchImpl,
        locationLike: { origin: "http://localhost:8080", pathname: "/" },
      }),
    /state mismatch/,
  );

  assert.equal(fetchImpl.calls.length, 0);
});

test("completeLogin exchanges code, stores token, and clears one-time OAuth storage", async () => {
  const storage = createMemoryStorage({
    [PKCE_VERIFIER_KEY]: "verifier",
    [OAUTH_STATE_KEY]: "expected",
  });
  const tokenStore = new TokenStore({ storage, now: () => 1_000 });
  const fetchImpl = createFetchMock([
    createJsonResponse({ payload: { access_token: "token", expires_in: 60 } }),
  ]);
  const replaced = [];
  const locationLike = {
    origin: "http://localhost:8080",
    pathname: "/",
    search: "?code=code&state=expected",
    history: {
      replaceState(...args) {
        replaced.push(args);
      },
    },
  };

  await completeLogin({ storage, tokenStore, fetchImpl, locationLike });

  assert.equal(tokenStore.getAccessToken(), "token");
  assert.equal(storage.getItem(PKCE_VERIFIER_KEY), null);
  assert.equal(storage.getItem(OAUTH_STATE_KEY), null);
  assert.deepEqual(replaced[0], [{}, "", "/"]);
});
