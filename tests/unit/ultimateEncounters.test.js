import assert from "node:assert/strict";
import test from "node:test";
import {
  filterFightsForUltimate,
  findUltimateByEncounterId,
  findUltimateByZoneName,
  isSharedUltimateZoneName,
  ULTIMATE_ENCOUNTERS,
} from "../../src/config/ultimateEncounters.js";

test("ULTIMATE_ENCOUNTERS contains the supported FFLogs Ultimate registry", () => {
  assert.deepEqual(
    ULTIMATE_ENCOUNTERS.map((ultimate) => [
      ultimate.slug,
      ultimate.displayName,
      ultimate.encounterId,
    ]),
    [
      ["ucob", "The Unending Coil of Bahamut", 1073],
      ["uwu", "The Weapon's Refrain", 1074],
      ["tea", "The Epic of Alexander", 1075],
      ["dsr", "Dragonsong's Reprise", 1076],
      ["top", "The Omega Protocol", 1077],
      ["fru", "Futures Rewritten", 1079],
      ["dm", "Dancing Mad", 1085],
    ],
  );
});

test("findUltimateByEncounterId resolves supported encounters", () => {
  assert.equal(findUltimateByEncounterId(1085).displayName, "Dancing Mad");
  assert.equal(findUltimateByEncounterId("1079").displayName, "Futures Rewritten");
  assert.equal(findUltimateByEncounterId(9999), null);
});

test("zone-name classification ignores zone IDs and identifies shared legacy buckets", () => {
  assert.equal(findUltimateByZoneName("The Omega Protocol").slug, "top");
  assert.equal(findUltimateByZoneName("the omega protocol").slug, "top");
  assert.equal(findUltimateByZoneName("Ultimates (Legacy)"), null);
  assert.equal(findUltimateByZoneName("A newly named zone"), null);
  assert.equal(isSharedUltimateZoneName("Ultimates (Legacy)"), true);
  assert.equal(isSharedUltimateZoneName("The Omega Protocol"), false);
});

test("filterFightsForUltimate requires exact encounter ID", () => {
  const fights = [
    { id: 1, encounterId: 1073 },
    { id: 2, encounterId: 1074 },
    { id: 3, encounterId: 1085 },
  ];

  assert.deepEqual(filterFightsForUltimate(fights, 1074), [{ id: 2, encounterId: 1074 }]);
  assert.deepEqual(filterFightsForUltimate(fights, 9999), []);
});
