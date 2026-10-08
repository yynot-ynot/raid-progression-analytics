import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

// These tests protect the no-data UX for chart exports. The chart download
// controls should not be visible until a chart family has rendered, and their
// visibility should not depend on live FFLogs CSV state.
test("chart download controls are hidden before any chart is rendered", () => {
  assert.match(indexHtml, /<div class="split-download" data-download-family="bar" hidden>/);
  assert.match(indexHtml, /<div class="split-download" data-download-family="sankey" hidden>/);
  assert.match(indexHtml, /\.split-download\[hidden\]\s*\{\s*display: none;/);
});

test("chart export state is managed separately from CSV export state", () => {
  const csvStateBody = extractFunctionBody(indexHtml, "setCsvExportState");

  assert.doesNotMatch(csvStateBody, /downloadBarHtmlBtn|downloadBarMenuBtn|downloadBarPngBtn/);
  assert.doesNotMatch(csvStateBody, /downloadSankeyHtmlBtn|downloadSankeyMenuBtn|downloadSankeyPngBtn/);
  assert.match(indexHtml, /function setChartExportState\(family, enabled\)/);
  assert.match(indexHtml, /setChartExportState\("bar", true\)/);
  assert.match(indexHtml, /setChartExportState\("sankey", true\)/);
  assert.match(indexHtml, /function resetChartExportState\(\)/);
});

test("normal FFLogs flow uses direct profile-source actions and an always-visible manual path", () => {
  assert.match(indexHtml, /id="source-connect" class="source-connect" hidden[\s\S]*id="connect">Connect FFLogs<\/button>/);
  assert.match(indexHtml, /\.source-connect\[hidden\]\s*\{\s*display: none;/);
  assert.match(indexHtml, /id="source-workflow" hidden/);
  assert.doesNotMatch(indexHtml, /id="reconnect"/);
  assert.doesNotMatch(indexHtml, /class="top-actions"/);
  assert.match(indexHtml, /id="profile-source-actions" class="profile-source-actions" hidden/);
  assert.match(indexHtml, /id="source-url"[\s\S]*placeholder="Paste FFLogs link"/);
  assert.match(indexHtml, /id="analyze" disabled>Analyze<\/button>/);
  assert.match(indexHtml, /#analyze\s*\{\s*background: #2b674f;/);
  assert.match(indexHtml, /\.profile-source\.active\s*\{\s*background: #233142;/);
  assert.doesNotMatch(indexHtml, /id="show-manual-source"/);
  assert.doesNotMatch(indexHtml, /id="source-select"/);
  assert.doesNotMatch(indexHtml, /id="discover"/);
  assert.doesNotMatch(indexHtml, /id="time-preset"/);
  assert.match(indexHtml, /buildPrimaryReportSourceActions\(state\.currentUser\)/);
  assert.match(indexHtml, /sourceConnectEl\.hidden = true;/);
  assert.match(indexHtml, /sourceWorkflowEl\.hidden = false;/);
  assert.match(indexHtml, /else \{\s*sourceConnectEl\.hidden = false;/);
  assert.match(indexHtml, /function setSelectedProfileSource\(sourceId\)/);
  assert.match(indexHtml, /#source-section\.manual-only \.source-grid/);
  assert.match(indexHtml, /button\.setAttribute\("aria-pressed", String\(isSelected\)\)/);
  assert.match(indexHtml, /await runDiscovery\(\{ sourceUrl: state\.sourceOptions\[0\]\.url, automatic: true \}\)/);
  assert.match(indexHtml, /if \(autoSelect && orderedGroups\.length === 1\)/);
  assert.match(indexHtml, /await selectUltimate\(orderedGroups\[0\]\)/);
  assert.match(indexHtml, /onUpdate: async \(update\) =>/);
  assert.match(indexHtml, /await renderUltimateList\(update\.ultimates, \{ autoSelect: false \}\)/);
  assert.match(indexHtml, /Fetching report pages \$\{update\.progress\.current\} of \$\{totalPages\}/);
  assert.match(indexHtml, /Identifying Ultimate reports \$\{update\.progress\.current\} of \$\{update\.progress\.total\}/);
});

// Authentication failures are intentionally not exposed in the UI. OAuth and
// token errors may contain implementation details, while the user can always
// recover through the same connection action.
test("authentication failures use the standard unauthenticated status", () => {
  const bootstrapCatch = indexHtml.slice(indexHtml.lastIndexOf("} catch (error)"));

  assert.match(bootstrapCatch, /console\.error\(error\);/);
  assert.match(bootstrapCatch, /setStatus\(authStatusEl, "Not authenticated\. Click Connect FFLogs\."\);/);
  assert.doesNotMatch(bootstrapCatch, /setStatus\(authStatusEl, error\.message/);
});

// Discovery owns generic report-detail loading. Selecting an encounter must
// reuse its cached details rather than issue a second filtered FFLogs request.
test("selected Ultimate loading reuses cached discovery details", () => {
  assert.match(indexHtml, /let openedReports = 0;/);
  assert.match(indexHtml, /function formatReportProgress\(openedReports, totalReports\)/);
  assert.match(indexHtml, /reports: formatReportProgress\(openedReports, totalReports\)/);
  assert.match(indexHtml, /reportDetails: group\.reportDetails,/);
  assert.match(indexHtml, /openedReports = bundle\.reports\.length;/);
  assert.match(indexHtml, /pulls: bundle\.pulls\.length,\s*reports: openedReports,/);
  assert.match(indexHtml, /Loading available data for \$\{group\.ultimate\.displayName\}/);
  assert.doesNotMatch(indexHtml, /onReportProgress: \(\{ current, total \}\) =>/);
});

test("Ultimate picker preserves first-seen order and coalesces active selections", () => {
  assert.match(indexHtml, /pickerEncounterOrder: \[\]/);
  assert.match(indexHtml, /function orderUltimateGroups\(groups\)/);
  assert.match(indexHtml, /state\.pickerEncounterOrder\.push\(encounterId\)/);
  assert.match(indexHtml, /selectionLoads: new Map\(\)/);
  assert.match(indexHtml, /const existingLoad = state\.selectionLoads\.get\(encounterId\);/);
  assert.match(indexHtml, /if \(existingLoad\) return existingLoad;/);
  assert.match(indexHtml, /loadedEncounterIds: new Set\(\)/);
  assert.match(indexHtml, /encounterId === state\.activeEncounterId && state\.loadedEncounterIds\.has\(encounterId\)/);
  assert.match(indexHtml, /Loading\.\.\./);
});

test("provisional selection updates do not remount charts for every detail commit", () => {
  assert.match(indexHtml, /discoveryInProgress: false/);
  assert.match(indexHtml, /selectUltimate\(refreshedSelection, \{ refresh: true, renderCharts: false \}\)/);
  assert.match(indexHtml, /selectUltimate\(finalSelection, \{ refresh: true, renderCharts: true \}\)/);
  assert.match(indexHtml, /if \(renderCharts\) \{\s*resetChartExportState\(\);/);
  assert.match(indexHtml, /if \(renderCharts\) \{\s*await renderChartsFromPulls/);
  assert.match(indexHtml, /Searching \$\{group\.ultimate\.displayName\}; \$\{bundle\.pulls\.length\} pull\(s\) cached/);
});

test("discovery writes every fetched report name and date to the debug console", () => {
  assert.match(indexHtml, /id="download-discovery-reports" class="secondary" disabled>Download Discovery Reports<\/button>/);
  assert.match(indexHtml, /function logDiscoveredReports\(reports\)/);
  assert.match(indexHtml, /console\.debug\(\s*"\[FFLogs\] Fetched discovery reports"/);
  assert.match(indexHtml, /function toDiscoveryDebugReports\(reports\)/);
  assert.match(indexHtml, /function buildDiscoveryReportDebugExport\(\)/);
  assert.match(indexHtml, /downloadDiscoveryReportsBtn\.disabled = false;/);
  assert.match(indexHtml, /downloadText\("fflogs-discovery-reports\.json"/);
  assert.match(indexHtml, /logDiscoveredReports\(state\.discovery\.reports\)/);
  assert.doesNotMatch(indexHtml, /id="discovery-debug"/);
});

/**
 * Extract a simple top-level function body from the inline module script.
 *
 * This keeps the test dependency-free while still letting us assert that CSV
 * enablement does not control chart-export visibility.
 *
 * @param {string} source
 * @param {string} functionName
 * @returns {string}
 */
function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `${functionName} should have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  assert.fail(`${functionName} body should close`);
}
