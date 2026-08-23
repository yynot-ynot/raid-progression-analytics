import { createPhaseSummary } from "../../domain/models/phase.js";
import { createNormalizedPullRow } from "../../domain/models/raidPull.js";
import { createRaidReportSummary } from "../../domain/models/raidReport.js";
import { createRaidTeamIdentity } from "../../domain/models/raidTeam.js";

/**
 * Map the current-user query payload into a compact app-owned user object.
 *
 * @param {object} payload
 * @returns {{id: number|string, name: string}|null}
 */
export function mapCurrentUser(payload) {
  const currentUser = payload?.userData?.currentUser;
  if (!currentUser) return null;

  return {
    id: currentUser.id,
    name: currentUser.name,
  };
}

/**
 * Map a FFLogs Guild payload into the app-owned raid-team identity.
 *
 * @param {object|null} guild
 * @param {{guildUrl?: string|null}} options
 * @returns {object|null}
 */
export function mapGuild(guild, { guildUrl = null } = {}) {
  if (!guild) return null;

  return createRaidTeamIdentity({
    guildId: guild.id,
    guildName: guild.name,
    guildType: guild.type,
    guildUrl,
    server: guild.server
      ? {
          id: guild.server.id,
          name: guild.server.name,
          slug: guild.server.slug,
        }
      : null,
    region: guild.server?.region
      ? {
          id: guild.server.region.id,
          name: guild.server.region.name,
          compactName: guild.server.region.compactName,
        }
      : null,
    tags: (guild.tags || []).map((tag) => ({
      id: tag.id,
      name: tag.name,
    })),
    statics: (guild.statics || []).map((staticGuild) => ({
      id: staticGuild.id,
      name: staticGuild.name,
      type: staticGuild.type,
    })),
    parentGuild: guild.parentGuild
      ? {
          id: guild.parentGuild.id,
          name: guild.parentGuild.name,
        }
      : null,
  });
}

/**
 * Map a raw FFLogs report summary into the app-owned report summary.
 *
 * @param {object|null} report
 * @returns {object|null}
 */
export function mapReportSummary(report) {
  if (!report) return null;
  return createRaidReportSummary(report);
}

/**
 * Map one FFLogs ReportPagination payload into reports plus pagination metadata.
 *
 * @param {object|null} pagination
 * @returns {{reports: object[], total: number, perPage: number|null, currentPage: number, lastPage: number, hasMorePages: boolean}}
 */
export function mapReportPagination(pagination) {
  return {
    reports: (pagination?.data || []).map(mapReportSummary).filter(Boolean),
    total: pagination?.total ?? 0,
    perPage: pagination?.per_page ?? null,
    currentPage: pagination?.current_page ?? 1,
    lastPage: pagination?.last_page ?? 1,
    hasMorePages: Boolean(pagination?.has_more_pages),
  };
}

/**
 * Map ReportMasterData player actors into unique app-owned player summaries.
 *
 * @param {object[]} actors
 * @returns {object[]}
 */
export function mapPlayerActors(actors = []) {
  const playersById = new Map();

  for (const actor of actors || []) {
    if (!actor?.id) continue;
    playersById.set(actor.id, {
      id: actor.id,
      name: actor.name,
      server: actor.server ?? null,
      type: actor.type ?? null,
      job: actor.subType ?? null,
      jobs: actor.subType ? [actor.subType] : [],
    });
  }

  return [...playersById.values()];
}

/**
 * Flatten Report.phases encounter groups into phase summaries.
 *
 * @param {object[]} encounterPhases
 * @returns {object[]}
 */
export function mapPhases(encounterPhases = []) {
  const phases = [];

  for (const encounter of encounterPhases || []) {
    for (const phase of encounter.phases || []) {
      phases.push(
        createPhaseSummary({
          encounterId: encounter.encounterID,
          id: phase.id,
          name: phase.name,
          isIntermission: phase.isIntermission,
        }),
      );
    }
  }

  return phases;
}

/**
 * Build a phase lookup keyed by encounter and phase ID with a phase-ID fallback.
 *
 * @param {object[]} phases
 * @returns {{get: (encounterId: number|string|null, phaseId: number|string|null) => object|null}}
 */
export function createPhaseLookup(phases = []) {
  const byEncounterAndId = new Map();
  const byId = new Map();

  for (const phase of phases) {
    if (phase?.id == null) continue;
    byId.set(String(phase.id), phase);
    if (phase.encounterId != null) {
      byEncounterAndId.set(`${phase.encounterId}:${phase.id}`, phase);
    }
  }

  return {
    get(encounterId, phaseId) {
      if (phaseId == null) return null;
      return byEncounterAndId.get(`${encounterId}:${phaseId}`) || byId.get(String(phaseId)) || null;
    },
  };
}

/**
 * Map one FFLogs ReportFight into a compact fight summary.
 *
 * @param {object|null} fight
 * @param {object} context
 * @returns {object|null}
 */
export function mapFightSummary(fight, { reportCode, reportTitle, reportStartTime } = {}) {
  if (!fight) return null;

  return {
    reportCode,
    reportTitle,
    reportStartTime,
    id: fight.id,
    name: fight.name ?? null,
    encounterId: fight.encounterID ?? null,
    originalEncounterId: fight.originalEncounterID ?? null,
    difficulty: fight.difficulty ?? null,
    kill: Boolean(fight.kill),
    startTime: fight.startTime,
    endTime: fight.endTime,
    combatTime: fight.combatTime ?? null,
    bossPercentage: fight.bossPercentage ?? null,
    fightPercentage: fight.fightPercentage ?? null,
    lastPhase: fight.lastPhase ?? null,
    lastPhaseAsAbsoluteIndex: fight.lastPhaseAsAbsoluteIndex ?? null,
    lastPhaseIsIntermission: Boolean(fight.lastPhaseIsIntermission),
    phaseTransitions: fight.phaseTransitions || [],
    friendlyPlayers: fight.friendlyPlayers || [],
    standardComposition: fight.standardComposition || null,
  };
}

/**
 * Map one full Report payload into report, players, phases, fights, and pulls.
 *
 * @param {object|null} report
 * @returns {object|null}
 */
export function mapReportDetail(report) {
  if (!report) return null;

  const reportSummary = mapReportSummary(report);
  const players = mapPlayerActors(report.masterData?.actors || []);
  const phases = mapPhases(report.phases || []);
  const fights = (report.fights || [])
    .map((fight) =>
      mapFightSummary(fight, {
        reportCode: report.code,
        reportTitle: report.title,
        reportStartTime: report.startTime,
      }),
    )
    .filter(Boolean);

  return {
    report: reportSummary,
    players,
    phases,
    fights,
    pulls: normalizePullRows({ report, fights, phases }),
  };
}

/**
 * Convert report-relative FFLogs fights into normalized pull rows.
 *
 * @param {{report: object, fights?: object[], phases?: object[], timezone?: string}} params
 * @returns {object[]}
 */
export function normalizePullRows({ report, fights = [], phases = [], timezone = "America/Los_Angeles" }) {
  const phaseLookup = createPhaseLookup(phases);

  return fights
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((fight, index) => {
      const endingPhaseId = getEndingPhaseId(fight);
      const endingPhase = phaseLookup.get(fight.encounterId, endingPhaseId);
      const absoluteStart = Number(report.startTime) + Number(fight.startTime);
      const absoluteEnd = Number(report.startTime) + Number(fight.endTime);

      return createNormalizedPullRow({
        reportCode: report.code,
        reportTitle: report.title,
        raidDate: formatRaidDate(absoluteStart, timezone),
        pullNumber: index + 1,
        fightId: fight.id,
        encounterId: fight.encounterId,
        pullStartTimestamp: absoluteStart,
        pullStartDisplayTime: formatPullStartTime(absoluteStart, timezone),
        pullDurationMs: absoluteEnd - absoluteStart,
        bossHpPercentage: fight.bossPercentage ?? fight.fightPercentage ?? null,
        kill: fight.kill,
        endingPhaseId,
        endingPhaseName: endingPhase?.name || (endingPhaseId != null ? `P${endingPhaseId}` : null),
        phaseTransitions: fight.phaseTransitions,
        participatingPlayerIds: fight.friendlyPlayers,
      });
    });
}

/**
 * Determine the best available ending phase ID for one fight.
 *
 * @param {object} fight
 * @returns {number|string|null}
 */
export function getEndingPhaseId(fight) {
  if (fight?.lastPhase != null) return fight.lastPhase;

  if (Array.isArray(fight?.phaseTransitions) && fight.phaseTransitions.length > 0) {
    return fight.phaseTransitions[fight.phaseTransitions.length - 1].id;
  }

  if (fight?.lastPhaseAsAbsoluteIndex != null) return fight.lastPhaseAsAbsoluteIndex;

  return null;
}

/**
 * Format a timestamp as the current CSV-compatible raid date.
 *
 * @param {number} timestampMs
 * @param {string} timezone
 * @returns {string}
 */
export function formatRaidDate(timestampMs, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestampMs));

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}/${month}/${day}`;
}

/**
 * Format a timestamp as `HH:MM` in the raid timezone.
 *
 * @param {number} timestampMs
 * @param {string} timezone
 * @returns {string}
 */
export function formatPullStartTime(timestampMs, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestampMs));

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}
