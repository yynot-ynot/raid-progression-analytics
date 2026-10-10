import { USER_BY_ID_QUERY, USER_GUILDS_BY_ID_QUERY } from "../api/queries/userLookup.js";

/**
 * Load the public identity behind a pasted personal-report URL.
 * Guild membership is requested separately and may be unavailable for a
 * profile. Callers must not retain a stale Static action in that case.
 *
 * @param {{userId: number, queryFflogs: Function}} params
 * @returns {Promise<{id: number|string, name: string, guilds: object[]} | null>}
 */
export async function loadUserById({ userId, queryFflogs }) {
  const data = await queryFflogs({
    query: USER_BY_ID_QUERY,
    variables: { userId },
  });
  const user = data?.userData?.user;
  if (!user) return null;

  let guilds = [];
  try {
    const guildData = await queryFflogs({
      query: USER_GUILDS_BY_ID_QUERY,
      variables: { userId },
    });
    guilds = guildData?.userData?.user?.guilds || [];
  } catch {
    // The name is public, but FFLogs can deny a profile's guild membership.
    // Keep its personal source usable and omit only the unavailable Static.
  }

  return {
    id: user.id,
    name: user.name,
    guilds,
  };
}
