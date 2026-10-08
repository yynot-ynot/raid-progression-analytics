/**
 * Build the report-source choices available to an authenticated FFLogs user.
 *
 * FFLogs calls both Free Companies and statics "guilds". This app only offers
 * memberships with type `1` as automatic Static sources, then appends the
 * user's personal report list as the fallback source.
 *
 * @param {{id?: number|string, name?: string, guilds?: object[]}|null} currentUser
 * @returns {{id: string, kind: "static"|"personal", label: string, url: string, sourceId: number|string}[]}
 */
export function buildAvailableReportSources(currentUser) {
  if (!currentUser?.id) return [];

  const staticSources = (currentUser.guilds || [])
    .filter((guild) => String(guild?.type) === "1" && guild?.id != null)
    .map((guild) => ({
      id: `static:${guild.id}`,
      kind: "static",
      label: guild.name ? `Static: ${guild.name}` : `Static ${guild.id}`,
      url: `https://www.fflogs.com/guild/reports-list/${guild.id}`,
      sourceId: guild.id,
    }));

  return [
    ...staticSources,
    {
      id: `personal:${currentUser.id}`,
      kind: "personal",
      label: currentUser.name ? `Personal logs: ${currentUser.name}` : "Personal logs",
      url: `https://www.fflogs.com/user/reports-list/${currentUser.id}`,
      sourceId: currentUser.id,
    },
  ];
}

/**
 * Return the direct source actions for the compact page control.
 *
 * The page presents one Static action at most, using the first Static returned
 * by FFLogs, plus personal logs. This keeps the normal path to two buttons
 * while preserving personal logs when profile membership has no Static.
 *
 * @param {{id?: number|string, name?: string, guilds?: object[]}|null} currentUser
 * @returns {{id: string, kind: "static"|"personal", label: string, url: string, sourceId: number|string}[]}
 */
export function buildPrimaryReportSourceActions(currentUser) {
  const sources = buildAvailableReportSources(currentUser);
  const staticSource = sources.find((source) => source.kind === "static");
  const personalSource = sources.find((source) => source.kind === "personal");
  return [staticSource, personalSource].filter(Boolean);
}
