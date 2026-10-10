const FFLOGS_HOST_RE = /(^|\.)fflogs\.com$/i;

/**
 * Parse a user-provided FFLogs source URL into report-list API scope.
 *
 * Users know static/group report containers through FFLogs URLs, while the API
 * calls the same backing object a guild. This parser preserves user-facing
 * `sourceType: "static"` terminology for guild-backed report scopes.
 *
 * Supported examples:
 * - https://www.fflogs.com/guild/reports-list/112977
 * - https://www.fflogs.com/guild/id/112977
 * - https://www.fflogs.com/user/reports-list/467755
 * - https://www.fflogs.com/reports/MaJcdnYA3VkZxz6L
 *
 * @param {string} sourceUrl
 * @returns {object}
 */
export function parseFflogsSourceUrl(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("FFLogs source must be a valid URL");
  }

  if (!FFLOGS_HOST_RE.test(url.hostname)) {
    throw new Error("FFLogs source URL must be on fflogs.com");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const [root, view, idPart] = parts;
  const id = parsePositiveInt(idPart);

  if (root === "guild" && (view === "reports-list" || view === "id") && id != null) {
    return {
      sourceType: "static",
      guildId: id,
      guildUrl: url.toString(),
      userId: null,
      userUrl: null,
    };
  }

  if (root === "user" && view === "reports-list" && id != null) {
    return {
      sourceType: "user",
      guildId: null,
      guildUrl: null,
      userId: id,
      userUrl: url.toString(),
    };
  }

  if (root === "reports" && isReportCode(view)) {
    return {
      sourceType: "report",
      reportCode: view,
      guildId: null,
      guildUrl: null,
      userId: null,
      userUrl: null,
    };
  }

  throw new Error("Unsupported FFLogs source URL");
}

/**
 * Merge a parsed source URL with optional report discovery filters.
 *
 * @param {object} sourceScope
 * @param {object} filters
 * @returns {object}
 */
export function buildReportSourceConfig(sourceScope, filters = {}) {
  return {
    guildId: sourceScope.guildId ?? null,
    guildUrl: sourceScope.guildUrl ?? null,
    userId: sourceScope.userId ?? null,
    userUrl: sourceScope.userUrl ?? null,
    sourceType: sourceScope.sourceType,
    reportCode: sourceScope.reportCode ?? null,
    guildTagId: filters.guildTagId ?? null,
    zoneId: filters.zoneId ?? null,
    gameZoneId: filters.gameZoneId ?? null,
    encounterId: filters.encounterId ?? null,
    difficulty: filters.difficulty ?? null,
    killType: filters.killType ?? "Encounters",
    startTime: filters.startTime ?? null,
    endTime: filters.endTime ?? null,
  };
}

/**
 * Return a date range ending now for common preset selections.
 *
 * @param {"past-6-months"|"past-year"} preset
 * @param {number} nowMs
 * @returns {{startTime: number, endTime: number}}
 */
export function buildDateRangePreset(preset, nowMs = Date.now()) {
  const days = preset === "past-6-months" ? 183 : preset === "past-year" ? 365 : null;
  if (!days) {
    throw new Error(`Unsupported date range preset: ${preset}`);
  }

  return {
    startTime: nowMs - days * 24 * 60 * 60 * 1000,
    endTime: nowMs,
  };
}

/**
 * Parse a strictly positive integer from a URL path component.
 *
 * @param {string|undefined} value
 * @returns {number|null}
 */
function parsePositiveInt(value) {
  if (!/^[1-9]\d*$/.test(value || "")) return null;
  return Number(value);
}

/** FFLogs report codes are URL-safe alphanumeric identifiers. */
function isReportCode(value) {
  return /^[a-z0-9]{6,}$/i.test(value || "");
}
