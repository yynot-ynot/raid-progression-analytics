import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_USER_QUERY } from "../../src/fflogs/api/queries/currentUser.js";
import {
  GUILD_BY_ID_QUERY,
  GUILD_BY_NAME_QUERY,
  GUILDS_BY_SERVER_QUERY,
} from "../../src/fflogs/api/queries/guildLookup.js";
import { RAID_TEAM_REPORTS_QUERY } from "../../src/fflogs/api/queries/reportList.js";
import { REPORT_FIGHTS_QUERY } from "../../src/fflogs/api/queries/reportFights.js";

test("current user query includes required user fields", () => {
  assert.match(CURRENT_USER_QUERY, /userData/);
  assert.match(CURRENT_USER_QUERY, /currentUser/);
  assert.match(CURRENT_USER_QUERY, /id/);
  assert.match(CURRENT_USER_QUERY, /name/);
  assert.match(CURRENT_USER_QUERY, /guilds/);
  assert.match(CURRENT_USER_QUERY, /type/);
});

test("guild queries include FF-specific static and tag fields", () => {
  for (const query of [GUILD_BY_ID_QUERY, GUILD_BY_NAME_QUERY]) {
    assert.match(query, /guildData/);
    assert.match(query, /tags/);
    assert.match(query, /statics/);
    assert.match(query, /parentGuild/);
    assert.doesNotMatch(query, /teams/);
  }

  assert.match(GUILDS_BY_SERVER_QUERY, /guilds/);
});

test("report list query includes pagination, precedence variable, and report metadata", () => {
  assert.match(RAID_TEAM_REPORTS_QUERY, /guildTagID: \$guildTagId/);
  assert.match(RAID_TEAM_REPORTS_QUERY, /has_more_pages/);
  assert.match(RAID_TEAM_REPORTS_QUERY, /visibility/);
  assert.match(RAID_TEAM_REPORTS_QUERY, /revision/);
  assert.match(RAID_TEAM_REPORTS_QUERY, /archiveStatus/);
  assert.match(RAID_TEAM_REPORTS_QUERY, /isArchived/);
  assert.match(RAID_TEAM_REPORTS_QUERY, /isAccessible/);
  assert.match(RAID_TEAM_REPORTS_QUERY, /archiveDate/);
  assert.match(RAID_TEAM_REPORTS_QUERY, /guildTag/);
});

test("report fights query includes fights, masterData, and phases", () => {
  assert.match(REPORT_FIGHTS_QUERY, /report\(code: \$code, allowUnlisted: \$allowUnlisted\)/);
  assert.match(REPORT_FIGHTS_QUERY, /fights/);
  assert.match(REPORT_FIGHTS_QUERY, /phaseTransitions/);
  assert.match(REPORT_FIGHTS_QUERY, /masterData/);
  assert.match(REPORT_FIGHTS_QUERY, /actors\(type: "Player"\)/);
  assert.match(REPORT_FIGHTS_QUERY, /phases/);
  assert.match(REPORT_FIGHTS_QUERY, /archiveStatus/);
  assert.match(REPORT_FIGHTS_QUERY, /isArchived/);
  assert.match(REPORT_FIGHTS_QUERY, /isAccessible/);
  assert.match(REPORT_FIGHTS_QUERY, /archiveDate/);
  assert.match(REPORT_FIGHTS_QUERY, /owner/);
});
