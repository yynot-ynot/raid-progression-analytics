import { FFLOGS_CONFIG } from "../../config/fflogsConfig.js";
import {
  FflogsAuthError,
  FflogsGraphqlError,
  FflogsHttpError,
  FflogsPayloadError,
} from "./fflogsErrors.js";

/**
 * Execute an authenticated FFLogs user GraphQL query.
 *
 * The caller may provide either an explicit access token or a TokenStore. This
 * wrapper centralizes bearer headers and normalizes common FFLogs failure modes.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function queryFflogs({
  query,
  variables = {},
  tokenStore,
  accessToken = tokenStore?.getAccessToken?.(),
  endpoint = FFLOGS_CONFIG.userGraphqlUrl,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!query) throw new FflogsPayloadError("FFLogs GraphQL query is required");
  if (!accessToken) throw new FflogsAuthError("FFLogs access token is required");
  if (!fetchImpl) throw new FflogsPayloadError("fetch is required for FFLogs GraphQL requests");

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new FflogsHttpError(`FFLogs GraphQL request failed with HTTP ${response.status}`, {
      status: response.status,
      payload,
    });
  }

  if (!payload || typeof payload !== "object") {
    throw new FflogsPayloadError("FFLogs GraphQL response was not a JSON object", { payload });
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new FflogsGraphqlError(payload.errors.map((error) => error.message).join("; "), {
      errors: payload.errors,
    });
  }

  if (!("data" in payload)) {
    throw new FflogsPayloadError("FFLogs GraphQL response did not include data", { payload });
  }

  return payload.data;
}
