import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDateRangePreset,
  buildReportSourceConfig,
  parseFflogsSourceUrl,
} from "../../src/fflogs/static-data/sourceScope.js";
import { buildReportListVariables } from "../../src/fflogs/static-data/raidTeamLoader.js";

test("parseFflogsSourceUrl parses static reports-list URL", () => {
  assert.deepEqual(
    parseFflogsSourceUrl("https://www.fflogs.com/guild/reports-list/112977"),
    {
      sourceType: "static",
      guildId: 112977,
      guildUrl: "https://www.fflogs.com/guild/reports-list/112977",
      userId: null,
      userUrl: null,
    },
  );
});

test("parseFflogsSourceUrl parses static id URL", () => {
  const parsed = parseFflogsSourceUrl("https://www.fflogs.com/guild/id/112977");

  assert.equal(parsed.sourceType, "static");
  assert.equal(parsed.guildId, 112977);
});

test("parseFflogsSourceUrl parses personal reports-list URL", () => {
  assert.deepEqual(
    parseFflogsSourceUrl("https://www.fflogs.com/user/reports-list/467755"),
    {
      sourceType: "user",
      guildId: null,
      guildUrl: null,
      userId: 467755,
      userUrl: "https://www.fflogs.com/user/reports-list/467755",
    },
  );
});

test("parseFflogsSourceUrl rejects unsupported or non-FFLogs URLs", () => {
  assert.throws(() => parseFflogsSourceUrl("https://example.com/guild/id/112977"), /fflogs\.com/);
  assert.throws(() => parseFflogsSourceUrl("https://www.fflogs.com/reports/abc"), /Unsupported/);
  assert.throws(() => parseFflogsSourceUrl("not a url"), /valid URL/);
});

test("buildReportSourceConfig merges source and report filters", () => {
  const source = parseFflogsSourceUrl("https://www.fflogs.com/guild/id/112977");
  const config = buildReportSourceConfig(source, {
    zoneId: 76,
    encounterId: 1085,
    startTime: 1,
    endTime: 2,
  });

  assert.equal(config.sourceType, "static");
  assert.equal(config.guildId, 112977);
  assert.equal(config.zoneId, 76);
  assert.equal(config.encounterId, 1085);
  assert.equal(config.killType, "Encounters");
});

test("buildDateRangePreset builds millisecond FFLogs report ranges", () => {
  const now = Date.UTC(2026, 7, 17);

  assert.deepEqual(buildDateRangePreset("past-6-months", now), {
    startTime: now - 183 * 24 * 60 * 60 * 1000,
    endTime: now,
  });
  assert.deepEqual(buildDateRangePreset("past-year", now), {
    startTime: now - 365 * 24 * 60 * 60 * 1000,
    endTime: now,
  });
  assert.throws(() => buildDateRangePreset("forever", now), /Unsupported/);
});

test("buildReportListVariables uses personal userID without guild filters", () => {
  const variables = buildReportListVariables({
    sourceType: "user",
    guildId: 112977,
    guildTagId: 9001,
    userId: 467755,
    zoneId: 76,
  });

  assert.equal(variables.userId, 467755);
  assert.equal(variables.zoneId, 76);
  assert.equal("guildId" in variables, false);
  assert.equal("guildTagId" in variables, false);
});
