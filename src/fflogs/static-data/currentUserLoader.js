import { CURRENT_USER_QUERY } from "../api/queries/currentUser.js";
import { mapCurrentUser } from "./fflogsMappers.js";

/**
 * Load and map the FFLogs user associated with the active OAuth token.
 *
 * @param {{queryFflogs: Function}} params
 * @returns {Promise<object|null>}
 */
export async function loadCurrentUser({ queryFflogs }) {
  const data = await queryFflogs({ query: CURRENT_USER_QUERY });
  return mapCurrentUser(data);
}
