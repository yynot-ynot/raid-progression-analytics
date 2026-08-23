/**
 * Initial concrete FFLogs scope for live capture testing and report discovery.
 *
 * The guild ID comes from https://www.fflogs.com/guild/id/112977. Tag, zone,
 * encounter, and date filters can be tightened after live discovery confirms
 * the real report metadata shape.
 */
export const RAID_TEAM_CONFIG = Object.freeze({
  sourceType: "static",
  guildId: 112977,
  guildUrl: "https://www.fflogs.com/guild/id/112977",
  userId: null,
  userUrl: null,
  guildTagId: null,
  zoneId: null,
  gameZoneId: null,
  encounterId: null,
  difficulty: null,
  killType: "Encounters",
});
