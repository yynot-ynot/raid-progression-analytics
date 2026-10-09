import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateTooltipPosition } from "../../src/charts/shared/tooltipPosition.js";

const sankeyRendererSource = readFileSync(
  new URL("../../src/charts/sankey/sankeyRenderer.js", import.meta.url),
  "utf8",
);

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

test("calculateTooltipPosition flips a bottom-edge tooltip upward", () => {
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

test("Sankey links use the shared bounded tooltip placement", () => {
  assert.match(sankeyRendererSource, /import \{ positionTooltipInContainer \} from "\.\.\/shared\/tooltipPosition\.js";/);
  assert.match(sankeyRendererSource, /positionTooltipInContainer\(tooltip\.node\(\), container, event\);/);
  assert.doesNotMatch(sankeyRendererSource, /event\.offsetY \+ 16/);
});
