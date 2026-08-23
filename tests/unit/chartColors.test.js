import assert from "node:assert/strict";
import test from "node:test";
import {
  getChartColorsForRaid,
  getChartPhasesForRaid,
  MEETING_SANKEY_NODE,
  RAID_CHART_CONFIG,
  resolveRaidChartConfig,
} from "../../src/config/chartColors.js";

// Chart palettes are intentionally encounter-specific, matching the reference
// repo's raid_config.json model. These tests prevent a regression back to a
// single global P1/P2/P3 color map.

test("raid chart config stores separate palettes per Ultimate", () => {
  assert.equal(RAID_CHART_CONFIG.fru.colors.P1, "#a0522d");
  assert.equal(RAID_CHART_CONFIG.dm.colors.P1, "#334052");
  assert.notEqual(RAID_CHART_CONFIG.fru.colors.P1, RAID_CHART_CONFIG.dm.colors.P1);
});

test("resolveRaidChartConfig matches slug, encounter ID, display name, and aliases", () => {
  assert.equal(resolveRaidChartConfig("dm").slug, "dm");
  assert.equal(resolveRaidChartConfig(1085).slug, "dm");
  assert.equal(resolveRaidChartConfig({ displayName: "Dancing Mad" }).slug, "dm");
  assert.equal(resolveRaidChartConfig("The Omega Protocol (Ultimate)").slug, "top");
  assert.equal(resolveRaidChartConfig("dragonsong_reprise").slug, "dsr");
});

test("getChartColorsForRaid merges selected raid colors with synthetic chart nodes", () => {
  const colors = getChartColorsForRaid({ slug: "dm" });

  assert.equal(colors.P1, "#334052");
  assert.equal(colors.P2, "#e6c34a");
  assert.equal(colors.P3, "#1f5fd1");
  assert.equal(colors.P4, "#98207a");
  assert.equal(colors.P5, "#9f241d");
  assert.equal(colors[MEETING_SANKEY_NODE], "#d3d3d3");
  assert.equal(colors.Meeting, "#ffffff");
  assert.equal(colors["Total Time"], "#d1d5db");
});

test("getChartPhasesForRaid returns configured phase order", () => {
  assert.deepEqual(getChartPhasesForRaid("top"), ["P1", "P2", "P3", "P4", "P5", "P6"]);
  assert.deepEqual(getChartPhasesForRaid("dsr"), [
    "P1",
    "P2",
    "P3",
    "P4",
    "Intermission",
    "P5",
    "P6",
    "P7",
  ]);
});
