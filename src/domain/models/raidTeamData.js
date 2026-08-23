/**
 * Bundle all FFLogs-derived raid-team data after mapping to app-owned shapes.
 *
 * @param {object} params
 * @returns {object}
 */
export function createRaidTeamDataBundle({
  currentUser = null,
  team = null,
  reports = [],
  reportDetails = [],
  players = [],
  phases = [],
  fights = [],
  pulls = [],
  fetchedAt = new Date().toISOString(),
} = {}) {
  return {
    currentUser,
    team,
    reports,
    reportDetails,
    players,
    phases,
    fights,
    pulls,
    fetchedAt,
  };
}
