import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShareRelativeUrl,
  consumePendingShareSelection,
  hasOAuthCallback,
  normalizeShareSelection,
  parseShareSelection,
  resolveAuthenticatedShareSelection,
  savePendingShareSelection,
} from "../../src/navigation/shareSelection.js";
import { createMemoryStorage } from "./testHelpers.js";

test("a fresh URL has no share selection", () => {
  assert.equal(parseShareSelection(""), null);
  assert.equal(parseShareSelection("?zone=53:Ultimates&encounter=1079"), null);
});

test("a share URL parses source, zone, and encounter", () => {
  assert.deepEqual(
    parseShareSelection("?source=https%3A%2F%2Fwww.fflogs.com%2Fguild%2Freports-list%2F112977&zone=53%3AThe+Omega+Protocol&encounter=1079"),
    {
      source: "https://www.fflogs.com/guild/reports-list/112977",
      zone: "53:The Omega Protocol",
      encounter: 1079,
    },
  );
});

test("invalid descendants are ignored without discarding a valid source", () => {
  assert.deepEqual(parseShareSelection("?source=https%3A%2F%2Fwww.fflogs.com%2Fuser%2Freports-list%2F42&zone=&encounter=nope"), {
    source: "https://www.fflogs.com/user/reports-list/42",
    zone: null,
    encounter: null,
  });
  assert.deepEqual(normalizeShareSelection({ source: "https://example.test", encounter: 1079 }), {
    source: "https://example.test",
    zone: null,
    encounter: null,
  });
});

test("serializing a source change clears dependent selection", () => {
  assert.equal(
    buildShareRelativeUrl({ pathname: "/", hash: "" }, { source: "https://www.fflogs.com/user/reports-list/42" }),
    "/?source=https%3A%2F%2Fwww.fflogs.com%2Fuser%2Freports-list%2F42",
  );
});

test("serializing a zone selection clears a stale encounter", () => {
  assert.equal(
    buildShareRelativeUrl({ pathname: "/", hash: "" }, {
      source: "https://www.fflogs.com/user/reports-list/42",
      zone: "53:The Omega Protocol",
    }),
    "/?source=https%3A%2F%2Fwww.fflogs.com%2Fuser%2Freports-list%2F42&zone=53%3AThe+Omega+Protocol",
  );
});

test("serializing an encounter keeps its source and zone", () => {
  assert.equal(
    buildShareRelativeUrl({ pathname: "/", hash: "#charts" }, {
      source: "https://www.fflogs.com/user/reports-list/42",
      zone: "53:The Omega Protocol",
      encounter: 1079,
    }),
    "/?source=https%3A%2F%2Fwww.fflogs.com%2Fuser%2Freports-list%2F42&zone=53%3AThe+Omega+Protocol&encounter=1079#charts",
  );
});

test("a shared choice survives an OAuth redirect through session storage", () => {
  const storage = createMemoryStorage();
  const selection = {
    source: "https://www.fflogs.com/guild/reports-list/112977",
    zone: "53:The Omega Protocol",
    encounter: 1079,
  };

  savePendingShareSelection(storage, selection);
  assert.deepEqual(consumePendingShareSelection(storage), selection);
  assert.equal(consumePendingShareSelection(storage), null);
});

test("startup distinguishes a fresh visit, a direct shared visit, and an OAuth callback", () => {
  const selection = {
    source: "https://www.fflogs.com/guild/reports-list/112977",
    zone: "53:The Omega Protocol",
    encounter: 1079,
  };
  const storage = createMemoryStorage();

  assert.equal(resolveAuthenticatedShareSelection({ search: "", storage }), null);
  assert.deepEqual(
    resolveAuthenticatedShareSelection({
      search: "?source=https%3A%2F%2Fwww.fflogs.com%2Fguild%2Freports-list%2F112977&zone=53%3AThe+Omega+Protocol&encounter=1079",
      storage,
    }),
    selection,
  );

  savePendingShareSelection(storage, selection);
  assert.equal(hasOAuthCallback("?code=one-time-code&state=csrf-value"), true);
  assert.deepEqual(
    resolveAuthenticatedShareSelection({ search: "?code=one-time-code&state=csrf-value", storage }),
    selection,
  );
});

test("invalid pending state is safely discarded", () => {
  const storage = createMemoryStorage({ "raid_progression_analytics.pending_share_selection": "not json" });
  assert.equal(consumePendingShareSelection(storage), null);
  assert.equal(storage.getItem("raid_progression_analytics.pending_share_selection"), null);
});
