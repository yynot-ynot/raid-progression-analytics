import assert from "node:assert/strict";
import test from "node:test";
import { TokenStore } from "../../src/fflogs/auth/tokenStore.js";
import { createMemoryStorage } from "./testHelpers.js";

test("TokenStore saves and reads access token", () => {
  const storage = createMemoryStorage();
  const store = new TokenStore({ storage, now: () => 1_000 });

  store.saveTokenResponse({ access_token: "abc", expires_in: 10 });

  assert.equal(store.getAccessToken(), "abc");
  assert.equal(store.isAuthenticated(), true);
});

test("TokenStore reads token from session storage", () => {
  const storage = createMemoryStorage({
    "custom-key": JSON.stringify({ access_token: "persisted", expires_at: 99_000 }),
  });
  const store = new TokenStore({ storage, storageKey: "custom-key", now: () => 1_000 });

  assert.equal(store.getAccessToken(), "persisted");
});

test("TokenStore clears expired token", () => {
  const storage = createMemoryStorage();
  const store = new TokenStore({ storage, now: () => 10_000 });
  store.saveTokenResponse({ access_token: "abc", expires_in: 1 });

  const laterStore = new TokenStore({ storage, now: () => 12_000 });
  assert.equal(laterStore.getAccessToken(), null);
  assert.equal(laterStore.isAuthenticated(), false);
});

test("TokenStore clears invalid stored JSON", () => {
  const storage = createMemoryStorage({ key: "{nope" });
  const store = new TokenStore({ storage, storageKey: "key" });

  assert.equal(store.getAccessToken(), null);
  assert.equal(storage.getItem("key"), null);
});

test("TokenStore rejects token response without access_token", () => {
  const store = new TokenStore({ storage: createMemoryStorage() });

  assert.throws(() => store.saveTokenResponse({ expires_in: 1 }), /access_token/);
});
