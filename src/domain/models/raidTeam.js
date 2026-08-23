/**
 * Create the app-owned identity shape for a raid team/guild/static.
 *
 * @param {object} params
 * @returns {object}
 */
export function createRaidTeamIdentity({
  source = "fflogs",
  guildId = null,
  guildName = null,
  guildType = null,
  guildUrl = null,
  server = null,
  region = null,
  tags = [],
  statics = [],
  parentGuild = null,
} = {}) {
  return {
    source,
    guildId,
    guildName,
    guildType,
    guildUrl,
    server,
    region,
    tags,
    statics,
    parentGuild,
  };
}
