import { RAID_TEAM_CONFIG } from "../../config/raidTeamConfig.js";
import { queryFflogs as defaultQueryFflogs } from "../api/fflogsClient.js";
import {
  GUILD_BY_ID_QUERY,
  GUILD_BY_NAME_QUERY,
  GUILDS_BY_SERVER_QUERY,
} from "../api/queries/guildLookup.js";
import { RAID_TEAM_REPORTS_QUERY } from "../api/queries/reportList.js";
import { REPORT_FIGHTS_QUERY } from "../api/queries/reportFights.js";
import { mapGuild, mapReportDetail, mapReportPagination } from "./fflogsMappers.js";
import { createRaidTeamDataBundle } from "../../domain/models/raidTeamData.js";

/**
 * Load one FFLogs guild/static by ID and map it into team identity.
 *
 * @param {{guildId: number, guildUrl?: string|null, queryFflogs?: Function}} params
 * @returns {Promise<object|null>}
 */
export async function loadGuildById({ guildId, guildUrl = null, queryFflogs = defaultQueryFflogs }) {
  const data = await queryFflogs({
    query: GUILD_BY_ID_QUERY,
    variables: { guildId },
  });

  return mapGuild(data?.guildData?.guild, { guildUrl });
}

/**
 * Load one FFLogs guild/static by name, server slug, and server region.
 *
 * @param {object} params
 * @returns {Promise<object|null>}
 */
export async function loadGuildByName({
  guildName,
  serverSlug,
  serverRegion,
  queryFflogs = defaultQueryFflogs,
}) {
  const data = await queryFflogs({
    query: GUILD_BY_NAME_QUERY,
    variables: { guildName, serverSlug, serverRegion },
  });

  return mapGuild(data?.guildData?.guild);
}

/**
 * Discover guilds available on a server.
 *
 * @param {object} params
 * @returns {Promise<object|null>}
 */
export async function loadGuildsByServer({
  serverSlug,
  serverRegion,
  page = 1,
  limit = 100,
  queryFflogs = defaultQueryFflogs,
}) {
  const data = await queryFflogs({
    query: GUILDS_BY_SERVER_QUERY,
    variables: { serverSlug, serverRegion, page, limit },
  });

  return data?.guildData?.guilds || null;
}

/**
 * Build report-list variables while honoring FFLogs guildTagID precedence.
 *
 * @param {object} config
 * @param {{page?: number, limit?: number}} options
 * @returns {object}
 */
export function buildReportListVariables(config = RAID_TEAM_CONFIG, { page = 1, limit = 100 } = {}) {
  const hasUserScope = config.userId != null;
  const variables = {
    guildId: hasUserScope || config.guildTagId ? null : config.guildId ?? null,
    guildTagId: hasUserScope ? null : config.guildTagId ?? null,
    guildName: hasUserScope || config.guildTagId ? null : config.guildName ?? null,
    guildServerSlug: hasUserScope || config.guildTagId ? null : config.guildServerSlug ?? null,
    guildServerRegion: hasUserScope || config.guildTagId ? null : config.guildServerRegion ?? null,
    userId: config.userId ?? null,
    zoneId: config.zoneId ?? null,
    gameZoneId: config.gameZoneId ?? null,
    startTime: config.startTime ?? null,
    endTime: config.endTime ?? null,
    page,
    limit,
  };

  return Object.fromEntries(Object.entries(variables).filter(([, value]) => value != null));
}

/**
 * Load and map one page of reports for the configured guild/tag/window.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function loadReportPage({
  config = RAID_TEAM_CONFIG,
  page = 1,
  limit = 100,
  queryFflogs = defaultQueryFflogs,
}) {
  const data = await queryFflogs({
    query: RAID_TEAM_REPORTS_QUERY,
    variables: buildReportListVariables(config, { page, limit }),
  });

  return mapReportPagination(data?.reportData?.reports);
}

/**
 * Load every available FFLogs report page.
 *
 * @param {object} params
 * @param {(progress: {page: number, totalPages: number|null, reports: object[], pagesFetched: number, reportsFetched: number}) => void|Promise<void>} [params.onPage]
 * @returns {Promise<{reports: object[], pagination: object|null, pagesFetched: number}>}
 */
export async function loadAllReports({
  config = RAID_TEAM_CONFIG,
  limit = 100,
  queryFflogs = defaultQueryFflogs,
  onPage = null,
} = {}) {
  const firstPageResult = await loadReportPage({ config, page: 1, limit, queryFflogs });
  const pageResults = new Map([[1, firstPageResult]]);
  let reportsFetched = 0;
  const totalPages = Number.isFinite(Number(firstPageResult.lastPage))
    ? Math.max(1, Number(firstPageResult.lastPage))
    : null;

  if (totalPages != null) {
    // FFLogs pages are assumed newest-first. Hold page 1 while a bounded
    // window fetches from the oldest page backward, then release contiguous
    // pages in chronological order to downstream detail workers.
    const pending = new Map();
    let nextPageToRequest = totalPages;
    let nextPageToRelease = totalPages;
    let releasedPages = 0;
    const startPage = (page) => {
      pending.set(
        page,
        loadReportPage({ config, page, limit, queryFflogs }).then((result) => ({ page, result })),
      );
    };

    while (nextPageToRequest >= 2 && pending.size < 3) startPage(nextPageToRequest--);
    while (pending.size) {
      const { page, result } = await Promise.race(pending.values());
      pending.delete(page);
      pageResults.set(page, result);
      while (nextPageToRequest >= 2 && pending.size < 3) startPage(nextPageToRequest--);
      while (nextPageToRelease >= 2 && pageResults.has(nextPageToRelease)) {
        const released = pageResults.get(nextPageToRelease);
        reportsFetched += released.reports.length;
        releasedPages += 1;
        await onPage?.({
          page: nextPageToRelease,
          totalPages,
          reports: released.reports,
          pagesFetched: releasedPages,
          reportsFetched,
        });
        nextPageToRelease -= 1;
      }
    }
    // Page one supplied pagination metadata and is newest, so release it last.
    reportsFetched += firstPageResult.reports.length;
    releasedPages += 1;
    await onPage?.({
      page: 1,
      totalPages,
      reports: firstPageResult.reports,
      pagesFetched: releasedPages,
      reportsFetched,
    });
  } else {
    // Retain a sequential fallback when FFLogs does not expose last_page.
    let page = 1;
    let result = firstPageResult;
    reportsFetched = result.reports.length;
    await onPage?.({
      page,
      totalPages: null,
      reports: result.reports,
      pagesFetched: 1,
      reportsFetched,
    });
    while (result.hasMorePages) {
      page += 1;
      result = await loadReportPage({ config, page, limit, queryFflogs });
      pageResults.set(page, result);
      reportsFetched += result.reports.length;
      await onPage?.({
        page,
        totalPages: null,
        reports: result.reports,
        pagesFetched: pageResults.size,
        reportsFetched,
      });
    }
  }

  const reports = [...pageResults.entries()]
    .sort(([leftPage], [rightPage]) => leftPage - rightPage)
    .flatMap(([, result]) => result.reports);
  const lastPageResult = pageResults.get(totalPages ?? pageResults.size) || firstPageResult;

  return {
    reports,
    pagination: lastPageResult,
    pagesFetched: pageResults.size,
  };
}

/**
 * Load one report's fights, player actors, phases, and normalized pull rows.
 *
 * @param {object} params
 * @returns {Promise<object|null>}
 */
export async function loadReportFights({
  code,
  allowUnlisted = false,
  config = RAID_TEAM_CONFIG,
  queryFflogs = defaultQueryFflogs,
}) {
  const data = await queryFflogs({
    query: REPORT_FIGHTS_QUERY,
    variables: {
      code,
      allowUnlisted,
      encounterId: config.encounterId ?? null,
      difficulty: config.difficulty ?? null,
      killType: config.killType ?? "Encounters",
    },
  });

  return mapReportDetail(data?.reportData?.report);
}

/**
 * Sort report summaries from earliest to latest so first-clear detection matches
 * progression chronology instead of whatever order FFLogs returns.
 *
 * @param {object[]} reports
 * @returns {object[]}
 */
export function sortReportsByStartTime(reports = []) {
  return [...reports].sort((a, b) => {
    const aStart = Number(a?.startTime ?? Number.POSITIVE_INFINITY);
    const bStart = Number(b?.startTime ?? Number.POSITIVE_INFINITY);
    if (aStart !== bStart) return aStart - bStart;
    return String(a?.code || "").localeCompare(String(b?.code || ""));
  });
}

/**
 * Find the first completed pull inside one mapped report detail.
 *
 * FFLogs exposes clears through the fight-level `kill` flag. We intentionally
 * do not use boss HP as the source of truth because live FFLogs responses can
 * show tiny non-zero percentages on completed kills.
 *
 * @param {object[]} pulls
 * @returns {object|null}
 */
export function findFirstClearPull(pulls = []) {
  return [...pulls]
    .filter((pull) => pull?.kill === true)
    .sort((a, b) => {
      const aStart = Number(a?.pullStartTimestamp ?? Number.POSITIVE_INFINITY);
      const bStart = Number(b?.pullStartTimestamp ?? Number.POSITIVE_INFINITY);
      if (aStart !== bStart) return aStart - bStart;
      return Number(a?.fightId ?? 0) - Number(b?.fightId ?? 0);
    })[0] || null;
}

/**
 * Keep rows up to and including the first clear in a mapped report detail.
 *
 * @param {object|null} detail
 * @returns {{detail: object|null, firstClearPull: object|null}}
 */
export function trimReportDetailAfterFirstClear(detail) {
  const firstClearPull = findFirstClearPull(detail?.pulls || []);
  if (!detail || !firstClearPull) return { detail, firstClearPull: null };

  const clearStart = Number(firstClearPull.pullStartTimestamp ?? Number.POSITIVE_INFINITY);
  const clearFightId = Number(firstClearPull.fightId);
  const pulls = (detail.pulls || []).filter((pull) => {
    const pullStart = Number(pull?.pullStartTimestamp ?? Number.POSITIVE_INFINITY);
    if (pullStart < clearStart) return true;
    return pullStart === clearStart && Number(pull?.fightId) === clearFightId;
  });
  const fightIds = new Set(pulls.map((pull) => Number(pull.fightId)));

  return {
    detail: {
      ...detail,
      fights: (detail.fights || []).filter((fight) => fightIds.has(Number(fight.id))),
      pulls,
    },
    firstClearPull,
  };
}

/**
 * Load all selected report details concurrently, then keep chronological data
 * only through the first clear. Parallel fetching makes the selected-Ultimate
 * UI responsive; the first-clear rule remains an output-data boundary.
 *
 * @param {object} params
 * @param {(progress: {current: number, total: number, report: object}) => void} [params.onReportProgress]
 * @returns {Promise<{reports: object[], reportDetails: object[], firstClearPull: object|null}>}
 */
export async function loadReportDetailsUntilFirstClear({
  reports = [],
  loadReportDetail,
  shouldKeepDetail = (detail) => Boolean(detail),
  onReportProgress = null,
} = {}) {
  const loadedReports = [];
  const reportDetails = [];
  let firstClearPull = null;
  const sortedReports = sortReportsByStartTime(reports);

  let completedRequests = 0;
  for (const report of sortedReports) {
    const detail = await loadReportDetail(report);
    completedRequests += 1;
    onReportProgress?.({ current: completedRequests, total: sortedReports.length, report });
    if (!shouldKeepDetail(detail)) continue;

    const trimmed = trimReportDetailAfterFirstClear(detail);

    if (shouldKeepDetail(trimmed.detail)) {
      loadedReports.push(report);
      reportDetails.push(trimmed.detail);
    }
    if (trimmed.firstClearPull) {
      firstClearPull = trimmed.firstClearPull;
      break;
    }
  }

  return { reports: loadedReports, reportDetails, firstClearPull };
}

/**
 * Run the full FFLogs raid-team loading flow and return app-owned data.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function loadRaidTeamData({
  config = RAID_TEAM_CONFIG,
  queryFflogs = defaultQueryFflogs,
  currentUser = null,
  reportLimit = 100,
} = {}) {
  let team = null;
  if (config.guildId != null) {
    team = await loadGuildById({ guildId: config.guildId, guildUrl: config.guildUrl, queryFflogs });
  } else if (config.guildName && config.guildServerSlug && config.guildServerRegion) {
    team = await loadGuildByName({
          guildName: config.guildName,
          serverSlug: config.guildServerSlug,
          serverRegion: config.guildServerRegion,
          queryFflogs,
        });
  } else if (config.userId != null) {
    team = {
      source: "fflogs",
      sourceType: "user",
      userId: config.userId,
      userUrl: config.userUrl ?? null,
    };
  }

  const { reports } = await loadAllReports({
    config,
    limit: reportLimit,
    queryFflogs,
  });

  const loaded = await loadReportDetailsUntilFirstClear({
    reports,
    loadReportDetail: (report) =>
      loadReportFights({
        code: report.code,
        allowUnlisted: false,
        config,
        queryFflogs,
      }),
  });

  return mergeRaidTeamData({
    currentUser,
    team,
    reports: loaded.reports,
    reportDetails: loaded.reportDetails,
  });
}

/**
 * Merge mapped report details into one de-duplicated raid-team data bundle.
 *
 * @param {object} params
 * @returns {object}
 */
export function mergeRaidTeamData({ currentUser = null, team, reports, reportDetails }) {
  const playersById = new Map();
  const phasesByKey = new Map();
  const fights = [];
  const pulls = [];

  for (const detail of reportDetails) {
    for (const player of detail.players || []) playersById.set(player.id, player);
    for (const phase of detail.phases || []) phasesByKey.set(`${phase.encounterId}:${phase.id}`, phase);
    fights.push(...(detail.fights || []));
    pulls.push(...(detail.pulls || []));
  }

  return createRaidTeamDataBundle({
    currentUser,
    team,
    reports,
    reportDetails,
    players: [...playersById.values()],
    phases: [...phasesByKey.values()],
    fights,
    pulls,
  });
}
