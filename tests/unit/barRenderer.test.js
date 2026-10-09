import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateTooltipPosition, compactSeriesLabel } from "../../src/charts/bar/barRenderer.js";

const rendererSource = readFileSync(new URL("../../src/charts/bar/barRenderer.js", import.meta.url), "utf8");

test("compactSeriesLabel preserves short phases and abbreviates special series", () => {
  assert.equal(compactSeriesLabel("P3: Exdeath"), "P3");
  assert.equal(compactSeriesLabel("Intermission"), "INT");
  assert.equal(compactSeriesLabel("Meeting"), "Mtg/Brk");
});

test("derived meeting tooltip rows omit the swatch and span its label space", () => {
  assert.match(rendererSource, /chart-tooltip-row-meeting/);
  assert.match(rendererSource, /if \(!isMeeting\) \{/);
  assert.match(rendererSource, /line\.append\(dot\);/);
});

// Tooltip placement is a UI boundary contract. A bar near the right edge must
// flip its detail card left instead of sending it outside the chart panel.
test("calculateTooltipPosition flips a right-edge tooltip to the left", () => {
  assert.deepEqual(
    calculateTooltipPosition({
      pointerX: 920,
      pointerY: 120,
      tooltipWidth: 180,
      tooltipHeight: 100,
      containerWidth: 1_000,
      containerHeight: 600,
    }),
    { left: 728, top: 132 },
  );
});

test("calculateTooltipPosition clamps top and left edges", () => {
  assert.deepEqual(
    calculateTooltipPosition({
      pointerX: 10,
      pointerY: 590,
      tooltipWidth: 180,
      tooltipHeight: 100,
      containerWidth: 1_000,
      containerHeight: 600,
    }),
    { left: 22, top: 478 },
  );
});
