/**
 * Parse OAuth callback search params without performing side effects.
 *
 * @param {string} search
 * @returns {{code: string|null, state: string|null, error: string|null, errorDescription: string|null}}
 */
export function parseOAuthCallback(search) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    code: params.get("code"),
    state: params.get("state"),
    error: params.get("error"),
    errorDescription: params.get("error_description"),
  };
}
