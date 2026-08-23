import assert from "node:assert/strict";
import test from "node:test";
import { queryFflogs } from "../../src/fflogs/api/fflogsClient.js";
import {
  FflogsAuthError,
  FflogsGraphqlError,
  FflogsHttpError,
  FflogsPayloadError,
} from "../../src/fflogs/api/fflogsErrors.js";
import { createFetchMock, createJsonResponse } from "./testHelpers.js";

test("queryFflogs posts JSON to user endpoint with bearer token", async () => {
  const fetchImpl = createFetchMock([createJsonResponse({ payload: { data: { ok: true } } })]);

  const data = await queryFflogs({
    query: "query Test { ok }",
    variables: { x: 1 },
    accessToken: "token",
    fetchImpl,
  });

  assert.deepEqual(data, { ok: true });
  assert.equal(fetchImpl.calls[0].url, "https://www.fflogs.com/api/v2/user");
  assert.equal(fetchImpl.calls[0].options.headers.Authorization, "Bearer token");
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].options.body), {
    query: "query Test { ok }",
    variables: { x: 1 },
  });
});

test("queryFflogs throws auth error when token is missing", async () => {
  await assert.rejects(
    () => queryFflogs({ query: "query Test { ok }", fetchImpl: async () => {} }),
    FflogsAuthError,
  );
});

test("queryFflogs throws HTTP error for non-2xx response", async () => {
  const fetchImpl = createFetchMock([
    createJsonResponse({ ok: false, status: 401, payload: { error: "unauthorized" } }),
  ]);

  await assert.rejects(
    () => queryFflogs({ query: "query", accessToken: "token", fetchImpl }),
    FflogsHttpError,
  );
});

test("queryFflogs throws GraphQL error for errors payload", async () => {
  const fetchImpl = createFetchMock([
    createJsonResponse({ payload: { errors: [{ message: "bad query" }] } }),
  ]);

  await assert.rejects(
    () => queryFflogs({ query: "query", accessToken: "token", fetchImpl }),
    FflogsGraphqlError,
  );
});

test("queryFflogs throws payload error when data is absent", async () => {
  const fetchImpl = createFetchMock([createJsonResponse({ payload: { nope: true } })]);

  await assert.rejects(
    () => queryFflogs({ query: "query", accessToken: "token", fetchImpl }),
    FflogsPayloadError,
  );
});
