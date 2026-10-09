import assert from "node:assert/strict";
import test from "node:test";
import { findLegacyZoneExpansion } from "../../src/config/legacyZoneMetadata.js";

// The observed IDs decorate Legacy navigation only. This locks the verified
// labels without letting them become an encounter-identity lookup.
test("legacy zone metadata resolves verified expansion provenance", () => {
  assert.equal(findLegacyZoneExpansion(30), "Shadowbringers");
  assert.equal(findLegacyZoneExpansion("43"), "Endwalker");
  assert.equal(findLegacyZoneExpansion(59), "Dawntrail");
});

test("unknown legacy-zone IDs are not guessed", () => {
  assert.equal(findLegacyZoneExpansion(999), null);
  assert.equal(findLegacyZoneExpansion(null), null);
});
