import assert from "node:assert/strict";
import test from "node:test";
import {
  filterFightsForUltimate,
  findUltimateByEncounterId,
  findUltimatesByZoneId,
  groupReportsByAvailableUltimates,
  ULTIMATE_ENCOUNTERS,
} from "../../src/config/ultimateEncounters.js";

test("ULTIMATE_ENCOUNTERS contains the supported FFLogs Ultimate registry", () => {
  assert.deepEqual(
    ULTIMATE_ENCOUNTERS.map((ultimate) => [
      ultimate.slug,
      ultimate.displayName,
      ultimate.zoneId,
      ultimate.encounterId,
    ]),
    [
      ["ucob", "The Unending Coil of Bahamut", 59, 1073],
      ["uwu", "The Weapon's Refrain", 59, 1074],
      ["tea", "The Epic of Alexander", 59, 1075],
      ["dsr", "Dragonsong's Reprise", 59, 1076],
      ["top", "The Omega Protocol", 59, 1077],
      ["fru", "Futures Rewritten", 65, 1079],
      ["dm", "Dancing Mad", 76, 1085],
    ],
  );
});

test("findUltimateByEncounterId resolves supported encounters", () => {
  assert.equal(findUltimateByEncounterId(1085).displayName, "Dancing Mad");
  assert.equal(findUltimateByEncounterId("1079").displayName, "Futures Rewritten");
  assert.equal(findUltimateByEncounterId(9999), null);
});

test("findUltimatesByZoneId returns all legacy Ultimate candidates for zone 59", () => {
  const legacyUltimates = findUltimatesByZoneId(59);

  assert.deepEqual(
    legacyUltimates.map((ultimate) => ultimate.slug),
    ["ucob", "uwu", "tea", "dsr", "top"],
  );
});

test("groupReportsByAvailableUltimates groups report summaries by supported zones", () => {
  const reports = [
    { code: "legacy", zone: { id: 59, name: "Ultimate Raids" } },
    { code: "fru", zone: { id: 65, name: "Futures Rewritten" } },
    { code: "ignored", zone: { id: 999, name: "Other" } },
  ];
  const groups = groupReportsByAvailableUltimates(reports);

  assert.deepEqual(
    groups.map((group) => group.ultimate.slug),
    ["ucob", "uwu", "tea", "dsr", "top", "fru"],
  );
  assert.deepEqual(groups.at(-1).reports.map((report) => report.code), ["fru"]);
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
