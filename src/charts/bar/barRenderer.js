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
  const width = Math.max(900, container.clientWidth || 960);
  const height = 520;
  const margin = { top: 44, right: 36, bottom: 112, left: 76 };
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
    .attr("aria-label", title || chartData.title || "Stacked bar chart");

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", 20)
    .attr("font-size", 15)
    .attr("font-weight", 700)
    .text(title || chartData.title);

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
    .attr("stroke-dasharray", (point) => (point.key === "Meeting" ? "4 3" : null));

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
    .attr("y", innerHeight + 74)
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .text("Date");

  chartLayer
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerHeight / 2)
    .attr("y", -52)
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .text(chartData.yLabel);

  renderLegend(svg, series, colors, width, height);
}

/**
 * Draw a compact legend below the plot.
 *
 * @param {object} svg
 * @param {string[]} series
 * @param {object} colors
 * @param {number} width
 * @param {number} height
 */
function renderLegend(svg, series, colors, width, height) {
  const legend = svg
    .append("g")
    .attr("transform", `translate(${Math.max(0, (width - series.length * 112) / 2)},${height - 38})`);

  series.forEach((key, index) => {
    const item = legend.append("g").attr("transform", `translate(${index * 112},0)`);
    item
      .append("rect")
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", getSeriesColor(key, colors))
      .attr("stroke", key === "Meeting" ? "#111827" : "none")
      .attr("stroke-dasharray", key === "Meeting" ? "4 3" : null);
    item
      .append("text")
      .attr("x", 18)
      .attr("y", 10)
      .attr("font-size", 11)
      .text(key === "Meeting" ? "Meetings, breaks, and DCs" : key);
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
