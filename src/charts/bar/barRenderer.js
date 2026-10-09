/**
 * Browser-only stacked bar renderer for reference-compatible raid-day charts.
 *
 * The data model is prepared separately in barData.js so tests can verify date
 * filling, unit conversion, and series ordering without relying on SVG output.
 */

import { getChartColorsForRaid } from "../../config/chartColors.js";

/**
 * Render a stacked bar chart into a browser element.
 *
 * @param {HTMLElement} container
 * @param {object} chartData
 * @param {{title?: string, colors?: object}} options
 */
export function renderStackedBar(container, chartData, { title = "", colors = getChartColorsForRaid() } = {}) {
  if (!container) return;
  container.replaceChildren();

  if (!chartData?.rows?.length || !chartData?.series?.length) {
    container.textContent = "No bar data available.";
    return;
  }
  if (!globalThis.d3) {
    container.textContent = "D3 libraries are not loaded.";
    return;
  }

  // D3 is loaded by static script tags so the page stays backend-free.
  const d3 = globalThis.d3;
  const width = Math.max(640, container.clientWidth || globalThis.innerWidth || 960);
  const height = 620;
  const margin = {
    top: 54,
    right: width < 760 ? 20 : 36,
    bottom: width < 760 ? 148 : 174,
    left: width < 760 ? 58 : 76,
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const series = chartData.series;
  const maxY = Math.max(1, d3.max(chartData.rows, (row) => row.Total) || 1);
  const yPadding = chartData.metricType === "Pulls" ? 1.05 : hasMeeting(series) ? 1.2 : 1;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", title || chartData.title || "Stacked bar chart")
    .attr("font-weight", 400);

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", 26)
    .attr("text-anchor", "middle")
    .attr("font-size", 18)
    .attr("font-weight", 700)
    .text(chartData.title || title);

  const chartLayer = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3
    .scaleBand()
    .domain(chartData.rows.map((row) => row.DisplayDate))
    .range([0, innerWidth])
    .padding(0.18);
  const y = d3
    .scaleLinear()
    .domain([0, maxY * yPadding])
    .nice()
    .range([innerHeight, 0]);
  const stackedRows = d3.stack().keys(series)(chartData.rows);
  const tooltip = d3
    .select(container)
    .append("div")
    .attr("class", "chart-tooltip")
    .style("display", "none");

  chartLayer
    .append("g")
    .attr("class", "bar-grid")
    .call(d3.axisLeft(y).ticks(tickCount(chartData.metricType)).tickSize(-innerWidth).tickFormat(""))
    .call((selection) => selection.select(".domain").remove());

  chartLayer
    .append("g")
    .selectAll("g")
    .data(stackedRows)
    .join("g")
    .attr("fill", (layer) => getSeriesColor(layer.key, colors))
    .selectAll("rect")
    .data((layer) => layer.map((point) => ({ ...point, key: layer.key })))
    .join("rect")
    .attr("x", (point) => x(point.data.DisplayDate))
    .attr("y", (point) => y(point[1]))
    .attr("height", (point) => Math.max(0, y(point[0]) - y(point[1])))
    .attr("width", x.bandwidth())
    .attr("stroke", (point) => (point.key === "Meeting" ? "#111827" : "#ffffff"))
    .attr("stroke-width", (point) => (point.key === "Meeting" ? 1.5 : 0.7))
    .attr("stroke-dasharray", (point) => (point.key === "Meeting" ? "4 3" : null))
    .attr("data-tooltip", (point) => formatBarExportTooltip(point.data, series, chartData.metricType))
    .on("mousemove", (event, point) => {
      renderBarTooltip(tooltip.node(), point.data, series, colors, chartData.metricType);
      tooltip
        .style("display", "block");
      positionTooltipInContainer(tooltip.node(), container, event);
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  chartLayer
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues(everyOtherDate(chartData.rows)).tickSizeOuter(0))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .attr("text-anchor", "end")
    .attr("font-size", 11);

  chartLayer
    .append("g")
    .call(d3.axisLeft(y).ticks(tickCount(chartData.metricType)).tickFormat(formatAxisValue(chartData.metricType)));

  chartLayer
    .append("text")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 72)
    .attr("text-anchor", "middle")
    .attr("font-size", 14)
    .attr("font-weight", 400)
    .text("Date");

  chartLayer
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -52)
    .attr("text-anchor", "middle")
    .attr("font-size", 14)
    .attr("font-weight", 400)
    .text(chartData.yLabel);

  renderLegend(svg, series, colors, margin.left + innerWidth / 2, margin.top + innerHeight);
}

/**
 * Place a live tooltip beside its pointer without allowing it to overflow its
 * chart panel. Near the right or lower edges it flips to the opposite side.
 *
 * @param {HTMLElement} tooltip
 * @param {HTMLElement} container
 * @param {MouseEvent} event
 */
function positionTooltipInContainer(tooltip, container, event) {
  if (!tooltip || !container) return;
  const bounds = container.getBoundingClientRect();
  const position = calculateTooltipPosition({
    pointerX: event.clientX - bounds.left,
    pointerY: event.clientY - bounds.top,
    tooltipWidth: tooltip.offsetWidth,
    tooltipHeight: tooltip.offsetHeight,
    containerWidth: bounds.width,
    containerHeight: bounds.height,
  });
  tooltip.style.left = `${position.left}px`;
  tooltip.style.top = `${position.top}px`;
}

/**
 * Calculate a clamped chart-relative tooltip position.
 *
 * Kept DOM-free so both edge behavior and future renderer changes can be
 * verified without a browser test environment.
 *
 * @param {{pointerX: number, pointerY: number, tooltipWidth: number, tooltipHeight: number, containerWidth: number, containerHeight: number, gap?: number}} input
 * @returns {{left: number, top: number}}
 */
export function calculateTooltipPosition({
  pointerX,
  pointerY,
  tooltipWidth,
  tooltipHeight,
  containerWidth,
  containerHeight,
  gap = 12,
}) {
  const maxLeft = Math.max(0, containerWidth - tooltipWidth);
  const maxTop = Math.max(0, containerHeight - tooltipHeight);
  const rightPosition = pointerX + gap;
  const bottomPosition = pointerY + gap;
  const left = rightPosition + tooltipWidth <= containerWidth ? rightPosition : pointerX - tooltipWidth - gap;
  const top = bottomPosition + tooltipHeight <= containerHeight ? bottomPosition : pointerY - tooltipHeight - gap;
  return {
    left: Math.max(0, Math.min(left, maxLeft)),
    top: Math.max(0, Math.min(top, maxTop)),
  };
}

/**
 * Draw a compact legend below the plot.
 *
 * @param {object} svg
 * @param {string[]} series
 * @param {object} colors
 * @param {number} plotCenterX
 * @param {number} plotBottomY
 */
function renderLegend(svg, series, colors, plotCenterX, plotBottomY) {
  const itemWidths = series.map((key) => (key === "Meeting" ? 238 : 72));
  const legendWidth = itemWidths.reduce((total, value) => total + value, 0);
  const legend = svg
    .append("g")
    .attr("transform", `translate(${Math.max(0, plotCenterX - legendWidth / 2)},${plotBottomY + 142})`)
    .attr("font-weight", 400);

  legend
    .append("text")
    .attr("x", legendWidth / 2)
    .attr("y", -26)
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .attr("font-weight", 400)
    .text("Phases");

  let offset = 0;

  series.forEach((key, index) => {
    const item = legend.append("g").attr("transform", `translate(${offset},0)`);
    item
      .append("rect")
      .attr("width", 18)
      .attr("height", 10)
      .attr("fill", key === "Meeting" ? "none" : getSeriesColor(key, colors))
      .attr("stroke", key === "Meeting" ? "#111827" : "none")
      .attr("stroke-width", key === "Meeting" ? 1.6 : null)
      .attr("stroke-dasharray", key === "Meeting" ? "5 3" : null);
    item
      .append("text")
      .attr("x", 26)
      .attr("y", 10)
      .attr("font-size", 13)
      .attr("font-weight", 400)
      .text(key === "Meeting" ? "Meetings, breaks, and DCs" : compactSeriesLabel(key));
    offset += itemWidths[index];
  });
}

/**
 * Select every other date label to match the reference chart's x-axis density.
 *
 * @param {object[]} rows
 * @returns {string[]}
 */
function everyOtherDate(rows) {
  return rows.map((row) => row.DisplayDate).filter((_, index) => index % 2 === 0);
}

/**
 * Resolve colors by exact phase key, then by short phase prefix.
 *
 * @param {string} key
 * @param {object} colors
 * @returns {string}
 */
function getSeriesColor(key, colors) {
  if (colors[key]) return colors[key];
  const shortPhase = key.split(":")[0];
  return colors[shortPhase] || "#808080";
}

/**
 * Use compact chart labels: phase prefixes remain short, while the two
 * non-phase series use deliberate abbreviations that fit tooltip columns.
 *
 * @param {string} key
 * @returns {string}
 */
export function compactSeriesLabel(key) {
  const label = key.split(":")[0];
  if (label === "Intermission") return "INT";
  if (label === "Meeting") return "Mtg/Brk";
  return label;
}

/**
 * Render one day's full phase split in the B5 tooltip layout.
 *
 * @param {HTMLElement} tooltip
 * @param {object} row
 * @param {string[]} series
 * @param {object} colors
 * @param {"Time"|"Pulls"} metricType
 */
function renderBarTooltip(tooltip, row, series, colors, metricType) {
  if (!tooltip) return;
  tooltip.replaceChildren();

  const total = Number(row.Total || 0);
  const date = document.createElement("div");
  date.className = "chart-tooltip-date";
  date.textContent = `${formatTooltipDate(row.Date || row.DisplayDate)} (${formatTooltipValue(total, metricType)})`;
  tooltip.append(date);

  const splitRows = series
    .map((key) => [key, Number(row[key] || 0)])
    .filter(([, value]) => value > 0);

  for (const [key, value] of splitRows) {
    const line = document.createElement("div");
    const isMeeting = key === "Meeting";
    line.className = `chart-tooltip-row${isMeeting ? " chart-tooltip-row-meeting" : ""}`;

    const phase = document.createElement("span");
    phase.className = "chart-tooltip-phase";
    phase.textContent = compactSeriesLabel(key);

    const percentage = document.createElement("span");
    percentage.className = "chart-tooltip-pct";
    percentage.textContent = formatTooltipPercentage(value, total);

    const formattedValue = document.createElement("span");
    formattedValue.className = "chart-tooltip-value";
    formattedValue.textContent = formatTooltipValue(value, metricType);

    // Meeting time is derived, not a colored phase. Its label uses the vacant
    // dot slot so `Mtg/Brk` stays on one compact line.
    if (!isMeeting) {
      const dot = document.createElement("span");
      dot.className = "chart-tooltip-dot";
      dot.style.background = getSeriesColor(key, colors);
      line.append(dot);
    }
    line.append(phase, percentage, formattedValue);
    tooltip.append(line);
  }
}

/**
 * Format one day's phase split as export-friendly tooltip text.
 *
 * The app uses rich DOM for the live B5 tooltip, while HTML snapshots store
 * this plain value in the SVG so their tiny inline script can recreate hover.
 *
 * @param {object} row
 * @param {string[]} series
 * @param {"Time"|"Pulls"} metricType
 * @returns {string}
 */
function formatBarExportTooltip(row, series, metricType) {
  const total = Number(row.Total || 0);
  const splitLines = series
    .map((key) => [key, Number(row[key] || 0)])
    .filter(([, value]) => value > 0)
    .map(
      ([key, value]) =>
        `${compactSeriesLabel(key)} ${formatTooltipPercentage(value, total)} ${formatTooltipValue(value, metricType)}`,
    );

  return [`${formatTooltipDate(row.Date || row.DisplayDate)} (${formatTooltipValue(total, metricType)})`, ...splitLines].join(
    "\n",
  );
}

/**
 * Format tooltip dates as YYYY-MM-DD.
 *
 * @param {string} value
 * @returns {string}
 */
function formatTooltipDate(value) {
  const [year, month, day] = String(value || "")
    .replaceAll("-", "/")
    .split("/")
    .map((part) => part.padStart(2, "0"));
  if (!year || !month || !day) return String(value || "");
  return `${year}-${month}-${day}`;
}

/**
 * Format tooltip values in compact chart units.
 *
 * @param {number} value
 * @param {"Time"|"Pulls"} metricType
 * @returns {string}
 */
function formatTooltipValue(value, metricType) {
  if (metricType === "Pulls") return `${Math.round(value)} pulls`;

  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

/**
 * Format a phase's share of the hovered day total.
 *
 * @param {number} value
 * @param {number} total
 * @returns {string}
 */
function formatTooltipPercentage(value, total) {
  if (!Number.isFinite(total) || total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * Whether the chart includes derived non-pull time.
 *
 * @param {string[]} series
 * @returns {boolean}
 */
function hasMeeting(series) {
  return series.includes("Meeting");
}

/**
 * Pick a readable tick count for the active metric.
 *
 * @param {"Time"|"Pulls"} metricType
 * @returns {number}
 */
function tickCount(metricType) {
  return metricType === "Pulls" ? 8 : 6;
}

/**
 * Format y-axis tick labels for hours or pull counts.
 *
 * @param {"Time"|"Pulls"} metricType
 * @returns {(value: number) => string}
 */
function formatAxisValue(metricType) {
  if (metricType === "Pulls") return (value) => String(Math.round(value));
  return (value) => `${Number(value).toFixed(value % 1 === 0 ? 0 : 1)}h`;
}
