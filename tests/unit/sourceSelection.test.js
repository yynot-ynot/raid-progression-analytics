import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAvailableReportSources,
  buildPrimaryReportSourceActions,
} from "../../src/fflogs/static-data/sourceSelection.js";

test("buildAvailableReportSources prefers statics before personal logs", () => {
  const sources = buildAvailableReportSources({
    id: 467755,
    name: "ynot",
    guilds: [
      { id: 3, name: "Free Company", type: "0" },
      { id: 112977, name: "The BEAM", type: "1" },
    ],
  });

  assert.deepEqual(sources, [
    {
      id: "static:112977",
      kind: "static",
      label: "Static: The BEAM",
      url: "https://www.fflogs.com/guild/reports-list/112977",
      sourceId: 112977,
    },
    {
      id: "personal:467755",
      kind: "personal",
      label: "Personal logs: ynot",
      url: "https://www.fflogs.com/user/reports-list/467755",
      sourceId: 467755,
    },
  ]);
});

test("buildAvailableReportSources retains personal logs when no static is available", () => {
  assert.deepEqual(buildAvailableReportSources({ id: 467755, name: "ynot", guilds: [] }), [
    {
      id: "personal:467755",
      kind: "personal",
      label: "Personal logs: ynot",
      url: "https://www.fflogs.com/user/reports-list/467755",
      sourceId: 467755,
    },
  ]);
});

test("buildAvailableReportSources returns no options without an authenticated user", () => {
  assert.deepEqual(buildAvailableReportSources(null), []);
});

test("buildPrimaryReportSourceActions exposes one Static action and personal logs", () => {
  const sources = buildPrimaryReportSourceActions({
    id: 467755,
    name: "ynot",
    guilds: [
      { id: 100, name: "First Static", type: "1" },
      { id: 200, name: "Second Static", type: "1" },
    ],
  });

  assert.deepEqual(sources.map((source) => source.id), ["static:100", "personal:467755"]);
});

test("buildPrimaryReportSourceActions exposes only personal logs without a Static", () => {
  assert.deepEqual(
    buildPrimaryReportSourceActions({ id: 467755, name: "ynot", guilds: [] }).map((source) => source.id),
    ["personal:467755"],
  );
});
