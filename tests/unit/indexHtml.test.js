import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

// These tests protect the no-data UX for chart exports. The chart download
// controls should not be visible until a chart family has rendered, and their
// visibility should not depend on live FFLogs CSV state.
test("chart download controls are hidden before any chart is rendered", () => {
  assert.match(indexHtml, /<section id="data-summary" class="section summary" hidden>/);
  assert.match(indexHtml, /<section id="bar-surface" class="surface" hidden>/);
  assert.match(indexHtml, /<section id="sankey-surface" class="surface" hidden>/);
  assert.match(indexHtml, /#data-summary\[hidden\],[\s\S]*#bar-surface\[hidden\],[\s\S]*#sankey-surface\[hidden\],[\s\S]*#debug-section\[hidden\]\s*\{\s*display: none;/);
  assert.match(indexHtml, /<div class="split-download" data-download-family="bar" hidden>/);
  assert.match(indexHtml, /<div class="split-download" data-download-family="sankey" hidden>/);
  assert.match(indexHtml, /\.split-download\[hidden\]\s*\{\s*display: none;/);
});

test("chart surfaces omit redundant visible titles and rendered-count status text", () => {
  assert.doesNotMatch(indexHtml, /<h2>Bar Analysis<\/h2>/);
  assert.doesNotMatch(indexHtml, /<h2>Sankey Analysis<\/h2>/);
  assert.match(indexHtml, /id="bar-status" class="visually-hidden" aria-live="polite"/);
  assert.match(indexHtml, /id="sankey-status" class="visually-hidden" aria-live="polite"/);
  assert.match(indexHtml, /const hidden = element\.classList\.contains\("visually-hidden"\)/);
  assert.match(indexHtml, /\.tabs \.split-download/);
});

test("summary and charts appear only for selected or rendered data", () => {
  assert.match(indexHtml, /dataSummaryEl\.hidden = selected === "No fight loaded";/);
  assert.match(indexHtml, /function setChartSurfacesVisible\(visible\)/);
  assert.match(indexHtml, /resetChartExportState\(\);\s*setChartSurfacesVisible\(false\);\s*renderLiveSankeyBtn\.disabled = true;/);
  assert.match(indexHtml, /setChartSurfacesVisible\(false\);\s*setChartLoading\(\[barTimeEl/);
  assert.match(indexHtml, /async function renderChartsFromPulls[\s\S]*setChartSurfacesVisible\(true\);/);
});

test("debug tools are visible only on localhost", () => {
  assert.match(indexHtml, /<section id="debug-section" class="section" hidden>/);
  assert.match(indexHtml, /debugSectionEl\.hidden = window\.location\.hostname !== "localhost";/);
});

test("downloaded chart HTML keeps tooltips within the viewport", () => {
  assert.match(indexHtml, /rightPosition \+ tooltipWidth <= window\.innerWidth/);
  assert.match(indexHtml, /event\.clientX - tooltipWidth - gap/);
  assert.match(indexHtml, /bottomPosition \+ tooltipHeight <= window\.innerHeight/);
  assert.match(indexHtml, /event\.clientY - tooltipHeight - gap/);
});

test("derived meeting tooltip labels span the unused phase-swatch space", () => {
  assert.match(indexHtml, /grid-template-columns: 10px 32px 48px 50px;/);
  assert.match(indexHtml, /\.chart-tooltip-row-meeting \.chart-tooltip-phase\s*\{\s*grid-column: 1 \/ span 2;/);
  assert.match(indexHtml, /\.chart-tooltip-row-meeting \.chart-tooltip-pct\s*\{\s*grid-column: 3;/);
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

test("normal FFLogs flow uses direct profile-source actions and a zone-first picker", () => {
  assert.match(indexHtml, /id="source-connect" class="source-connect" hidden[\s\S]*id="connect">Connect FFLogs<\/button>/);
  assert.match(indexHtml, /\.source-connect\[hidden\]\s*\{\s*display: none;/);
  assert.match(indexHtml, /id="source-workflow" hidden/);
  assert.doesNotMatch(indexHtml, /id="reconnect"/);
  assert.doesNotMatch(indexHtml, /class="top-actions"/);
  assert.match(indexHtml, /id="profile-source-actions" class="profile-source-actions" hidden/);
  assert.match(indexHtml, /id="source-url"[\s\S]*placeholder="Paste an FFLogs link to a report or personal logs"/);
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
  assert.match(indexHtml, /function renderProfileSourceActions\(\)/);
  assert.match(indexHtml, /static-unavailable/);
  assert.match(indexHtml, /label: "Static:"/);
  assert.match(indexHtml, /function getStaticActionLayout\(\)/);
  assert.match(indexHtml, /labelOffset/);
  assert.match(indexHtml, /function refreshPastedSourceActions\(sourceUrl\)/);
  assert.match(indexHtml, /function resolvePersonalReportUrl\(sourceUrl\)/);
  assert.match(indexHtml, /loadReportOwner\(\{ reportCode: config\.reportCode, queryFflogs: queryWithToken \}\)/);
  assert.match(indexHtml, /placeholder="Paste an FFLogs link to a report or personal logs"/);
  assert.match(indexHtml, /loadUserById\(\{ userId: config\.userId, queryFflogs: queryWithToken \}\)/);
  assert.match(indexHtml, /await runDiscovery\(\{ sourceUrl: sourceUrlEl\.value \}\);\s*await refreshPastedSourceActions\(sourceUrlEl\.value\)/);
  assert.doesNotMatch(indexHtml, /sourceUrlEl\.addEventListener\("input"/);
  assert.match(indexHtml, /#source-section\.manual-only \.source-grid/);
  assert.match(indexHtml, /button\.setAttribute\("aria-pressed", String\(isSelected\)\)/);
  assert.match(indexHtml, /await runDiscovery\(\{ sourceUrl: state\.sourceOptions\[0\]\.url, automatic: true \}\)/);
  assert.match(indexHtml, /onUpdate: async \(update\) =>/);
  assert.match(indexHtml, /function renderZoneList\(zones = \[\]\)/);
  assert.match(indexHtml, /Open an FFLogs zone to confirm its fights/);
  assert.match(indexHtml, /createZoneDetailLoader/);
  assert.match(indexHtml, /detailConcurrency: 3/);
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

test("share navigation preserves choices through login and restores source before descendants", () => {
  assert.match(indexHtml, /from "\.\/src\/navigation\/shareSelection\.js"/);
  assert.match(indexHtml, /shareSelection: parseShareSelection\(window\.location\.search\)/);
  assert.match(indexHtml, /saveShareSelectionForLogin\(\);\s*return startLogin/);
  assert.match(indexHtml, /const sharedSelection = resolveAuthenticatedShareSelection/);
  assert.match(indexHtml, /await initializeAutomaticSourceFlow\(\{ sharedSelection \}\)/);
  assert.match(indexHtml, /if \(sharedSelection\?\.source\)/);
  assert.match(indexHtml, /restoreSelection: sharedSelection/);
  assert.match(indexHtml, /if \(restoreSelection\?\.zone\) await restoreSharedSelection\(restoreSelection\)/);
  assert.match(indexHtml, /await openZone\(zone, \{ requestedEncounterId: selection\.encounter \}\)/);
  assert.match(indexHtml, /await selectUltimate\(group, view\)/);
  assert.match(indexHtml, /requestedEncounterId == null\s*&& hasSingleSupportedFight/);
});

// A selected fight reads its opened zone's cache. The zone loader owns FFLogs
// detail requests, and selection itself does not invoke an API loader.
test("selected Ultimate loading reuses opened-zone details", () => {
  assert.match(indexHtml, /reportDetails: group\.reportDetails,/);
  assert.match(indexHtml, /const summaryMetrics = buildSummaryMetrics\(bundle\.pulls\);/);
  assert.match(indexHtml, /pulls: bundle\.pulls\.length,\s*\.\.\.summaryMetrics,/);
  assert.match(indexHtml, /Loading available data for \$\{group\.ultimate\.displayName\}/);
  assert.match(indexHtml, /function openZone\(zone,/);
  assert.match(indexHtml, /const existing = state\.zoneLoads\.get\(zone\.key\);/);
  assert.match(indexHtml, /if \(existing\) return existing\.done;/);
});

test("summary groups pull and session time before calendar days and the data window", () => {
  assert.match(indexHtml, /id="summary-pull-time"/);
  assert.match(indexHtml, /id="summary-session-time"/);
  assert.match(indexHtml, /number\.className = "time-duration-number";/);
  assert.match(indexHtml, /unitLabel\.className = "time-duration-unit";/);
  assert.match(indexHtml, /function renderSummaryDuration\(element, durationMs\)/);
  assert.match(indexHtml, /font-variant-numeric: tabular-nums;/);
  assert.match(indexHtml, /Includes time between pulls: meetings, breaks, and DCs\./);
  assert.match(indexHtml, /id="summary-calendar-label"/);
  assert.match(indexHtml, /calendarDays === 1 \? "Calendar day" : "Calendar days"/);
  assert.doesNotMatch(indexHtml, /id="summary-reports"/);
  assert.match(indexHtml, /function buildSummaryMetrics\(pulls = \[\]\)/);
  assert.match(indexHtml, /calculateRaidDurationsByDate\(pulls\)/);
});

test("zone picker preserves first-seen order and coalesces repeated opens", () => {
  assert.match(indexHtml, /zoneOrder: \[\]/);
  assert.match(indexHtml, /function orderZones\(zones\)/);
  assert.match(indexHtml, /state\.zoneOrder\.push\(key\)/);
  assert.match(indexHtml, /zoneLoads: new Map\(\)/);
  assert.match(indexHtml, /const existing = state\.zoneLoads\.get\(zone\.key\);/);
  assert.match(indexHtml, /if \(existing\) return existing\.done;/);
  assert.match(indexHtml, /activeZoneKey/);
  assert.match(indexHtml, /Checking fights/);
  assert.match(indexHtml, /function hasSingleSupportedFight\(zone\)/);
  assert.match(indexHtml, /findLegacyZoneExpansion/);
  assert.match(indexHtml, /function zoneDisplayName\(zone\)/);
  assert.match(indexHtml, /return expansion \? `\$\{zone\.zoneName\} · \$\{expansion\}` : zone\.zoneName;/);
  assert.match(indexHtml, /function fightDisplayName\(group\)/);
  assert.match(indexHtml, /return group\.ultimate\.displayName;/);
  assert.doesNotMatch(indexHtml, /\$\{group\.ultimate\.displayName\} \(\$\{group\.ultimate\.expansion\}\)/);
  assert.match(indexHtml, /hasSingleSupportedFight\(update\.zone\)/);
});

test("zone-detail updates defer charts until the selected zone is complete", () => {
  assert.match(indexHtml, /discoveryInProgress: false/);
  assert.match(indexHtml, /loadSelectedUltimate\(active, update\.zone, \{ renderCharts: update\.zone\.complete \}\)/);
  assert.match(indexHtml, /loadSelectedUltimate\(group, zone, \{ renderCharts: zone\.complete \}\)/);
  assert.match(indexHtml, /Loading all zone reports before rendering charts/);
  assert.match(indexHtml, /setCsvExportState\(renderCharts\)/);
  assert.match(indexHtml, /renderLiveSankeyBtn\.disabled = !renderCharts/);
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
