/** Session key used to carry a shared selection across the FFLogs OAuth redirect. */
export const PENDING_SHARE_SELECTION_KEY = "raid_progression_analytics.pending_share_selection";

/**
 * Parse the durable, shareable portion of the application URL.
 * OAuth callback values intentionally do not appear in this object.
 *
 * @param {string} search
 * @returns {{source: string, zone: string|null, encounter: number|null}|null}
 */
export function parseShareSelection(search = "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const source = params.get("source")?.trim();
  if (!source) return null;

  const zone = params.get("zone")?.trim() || null;
  const encounterValue = params.get("encounter");
  const encounter = Number(encounterValue);

  return {
    source,
    zone,
    encounter: Number.isSafeInteger(encounter) && encounter > 0 ? encounter : null,
  };
}

/**
 * Normalize a selection before serializing or persisting it.
 * A zone and encounter have no meaning without a source, and an encounter has
 * no meaning without a zone.
 *
 * @param {object|null|undefined} selection
 * @returns {{source: string, zone: string|null, encounter: number|null}|null}
 */
export function normalizeShareSelection(selection) {
  const source = String(selection?.source || "").trim();
  if (!source) return null;

  const zone = String(selection?.zone || "").trim() || null;
  const encounter = Number(selection?.encounter);
  return {
    source,
    zone,
    encounter: zone && Number.isSafeInteger(encounter) && encounter > 0 ? encounter : null,
  };
}

/**
 * Return a relative share URL containing only durable selection state.
 *
 * @param {{pathname?: string, hash?: string}} locationLike
 * @param {object|null|undefined} selection
 * @returns {string}
 */
export function buildShareRelativeUrl(locationLike = {}, selection) {
  const normalized = normalizeShareSelection(selection);
  const params = new URLSearchParams();
  if (normalized) {
    params.set("source", normalized.source);
    if (normalized.zone) params.set("zone", normalized.zone);
    if (normalized.encounter) params.set("encounter", String(normalized.encounter));
  }
  const query = params.toString();
  return `${locationLike.pathname || "/"}${query ? `?${query}` : ""}${locationLike.hash || ""}`;
}

/** Persist a shared selection until the OAuth callback has completed. */
export function savePendingShareSelection(storage, selection) {
  const normalized = normalizeShareSelection(selection);
  if (normalized) storage?.setItem?.(PENDING_SHARE_SELECTION_KEY, JSON.stringify(normalized));
  else storage?.removeItem?.(PENDING_SHARE_SELECTION_KEY);
  return normalized;
}

/** Read and consume the selection preserved before the OAuth redirect. */
export function consumePendingShareSelection(storage) {
  const raw = storage?.getItem?.(PENDING_SHARE_SELECTION_KEY);
  storage?.removeItem?.(PENDING_SHARE_SELECTION_KEY);
  if (!raw) return null;
  try {
    return normalizeShareSelection(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Whether the current location is an FFLogs OAuth callback rather than a share URL. */
export function hasOAuthCallback(search = "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.has("code") || params.has("error");
}

/**
 * Resolve the source choice for an authenticated visit. Pending session state
 * is consumed only after an OAuth callback, so an unrelated later page visit
 * cannot accidentally revive an old shared selection.
 */
export function resolveAuthenticatedShareSelection({ search = "", storage, oauthCallback = hasOAuthCallback(search) } = {}) {
  if (oauthCallback) return consumePendingShareSelection(storage) || parseShareSelection(search);
  return parseShareSelection(search);
}
