/**
 * Browser-only Sankey renderer.
 *
 * The graph math lives in sankeyData.js so it can be unit-tested without a DOM.
 * This module only translates that model into SVG using the D3 globals loaded by
 * the static browser page during local development.
 */

import { getChartColorsForRaid } from "../../config/chartColors.js";

/**
 * Render one Sankey chart into a browser element.
 *
 * @param {HTMLElement} container
 * @param {object} sankeyData
 * @param {{title?: string, colors?: object}} options
 */
export function renderSankey(container, sankeyData, { title = "", colors = getChartColorsForRaid() } = {}) {
  if (!container) return;
  container.replaceChildren();

  if (!sankeyData?.nodes?.length || !sankeyData?.links?.length) {
    container.textContent = "No Sankey data available.";
    return;
  }
  if (!globalThis.d3?.sankey) {
    container.textContent = "D3 Sankey libraries are not loaded.";
    return;
  }

  // D3 is loaded by static script tags so the page stays backend-free.
  const d3 = globalThis.d3;
  const width = Math.max(640, container.clientWidth || globalThis.innerWidth || 960);
  const compact = width < 980;
  const height = compact ? 640 : 580;
  const margin = {
    top: 28,
    right: compact ? 116 : Math.min(360, Math.max(260, width * 0.2)),
    bottom: 24,
    left: compact ? 116 : Math.min(300, Math.max(210, width * 0.16)),
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", title || `${sankeyData.metricType} Sankey`);

  if (title && compact) {
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", 18)
      .attr("text-anchor", "middle")
      .attr("font-size", 14)
      .attr("font-weight", 700)
      .text(title);
  }

  const graphLayer = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const nodeInput = sankeyData.nodes.map((node, index) => ({ ...node, index }));
  const linkInput = sankeyData.links
    .map((link) => ({
      source: nodeInput.findIndex((node) => node.id === link.source),
      target: nodeInput.findIndex((node) => node.id === link.target),
      value: link.value,
      sourceId: link.source,
      targetId: link.target,
    }))
    .filter((link) => link.source >= 0 && link.target >= 0 && link.value > 0);

  const sankey = d3
    .sankey()
    .nodeWidth(16)
    .nodePadding(10)
    .nodeSort(null)
    .linkSort((left, right) => left.source.index - right.source.index)
    .extent([
      [1, 1],
      [innerWidth - 1, innerHeight - 1],
    ]);

  const graph = sankey({
    nodes: nodeInput.map((node) => ({ ...node })),
    links: linkInput.map((link) => ({ ...link })),
  });

  const tooltip = d3
    .select(container)
    .append("div")
    .attr("class", "sankey-tooltip")
    .style("display", "none");

  graphLayer
    .append("g")
    .attr("fill", "none")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", (link) => withOpacity(getNodeColor(link.target.id, colors), 0.48))
    .attr("stroke-width", (link) => Math.max(1, link.width))
    .attr("data-tooltip", (link) => formatLinkTooltip(link, sankeyData.metricType))
    .on("mousemove", (event, link) => {
      tooltip
        .style("display", "block")
        .style("left", `${event.offsetX + 16}px`)
        .style("top", `${event.offsetY + 16}px`)
        .text(formatLinkTooltip(link, sankeyData.metricType));
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  graphLayer
    .append("g")
    .selectAll("rect")
    .data(graph.nodes)
    .join("rect")
    .attr("x", (node) => node.x0)
    .attr("y", (node) => node.y0)
    .attr("width", (node) => node.x1 - node.x0)
    .attr("height", (node) => Math.max(1, node.y1 - node.y0))
    .attr("fill", (node) => getNodeColor(node.id, colors))
    .attr("data-tooltip", (node) => formatNodeExportTooltip(node, sankeyData.metricType));

  graphLayer
    .append("g")
    .selectAll("text")
    .data(graph.nodes)
    .join("text")
    .attr("x", (node) => labelX(node, innerWidth, compact))
    .attr("y", (node) => (node.y0 + node.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (node) => labelAnchor(node))
    .attr("font-family", "Georgia, Times New Roman, serif")
    .attr("font-size", compact ? 12 : 14)
    .attr("font-weight", 400)
    .text((node) => formatNodeLabel(node, compact));
}

/**
 * Return the color for one Sankey node.
 *
 * @param {string} nodeId
 * @param {object} colors
 * @returns {string}
 */
function getNodeColor(nodeId, colors) {
  if (colors[nodeId]) return colors[nodeId];
  const phase = nodeId.split(" ")[0];
  const shortPhase = phase.split(":")[0];
  return colors[phase] || colors[shortPhase] || "#808080";
}

/**
 * Whether labels should be right-aligned after the node.
 *
 * @param {string} nodeId
 * @returns {boolean}
 */
function isRightSideNode(nodeId) {
  return nodeId.endsWith("Total") || nodeId === "Meetings, Breaks and DCs";
}

/**
 * Keep Sankey labels inside the reserved SVG label gutters.
 *
 * @param {object} node
 * @param {number} innerWidth
 * @param {boolean} compact
 * @returns {number}
 */
function labelX(node, innerWidth, compact) {
  if (compact) {
    return isRightSideNode(node.id) ? Math.min(innerWidth - 4, node.x1 + 8) : Math.max(4, node.x0 - 8);
  }
  return isRightSideNode(node.id) ? node.x1 + 8 : node.x0 - 8;
}

/**
 * Select a text anchor that matches the reference-style node placement.
 *
 * @param {object} node
 * @returns {"start"|"end"}
 */
function labelAnchor(node) {
  return isRightSideNode(node.id) ? "start" : "end";
}

/**
 * Format Sankey labels with the node role, duration/count, and percentage.
 *
 * @param {object} node
 * @param {boolean} compact
 * @returns {string}
 */
function formatNodeLabel(node, compact) {
  if (compact) {
    const percentage = node.label.match(/- ([\d.]+%)/)?.[1] || node.label;
    if (node.id === "Meetings, Breaks and DCs") return `Meeting (${percentage})`;
    return `${shortNodeName(node.id)} (${percentage})`;
  }

  if (node.id === "Total Time" || node.id === "Total Pulls") return `${node.id} (${node.label})`;
  if (node.id === "Meetings, Breaks and DCs") return `Meetings, Breaks and DCs (${node.label})`;
  if (node.id.endsWith("Total")) return `${shortNodeName(node.id)} Total (${node.label})`;
  return `${shortNodeName(node.id)} Progression (${node.label})`;
}

/**
 * Collapse full phase node names to P1/P2-style labels for dense chart text.
 *
 * @param {string} nodeId
 * @returns {string}
 */
function shortNodeName(nodeId) {
  return nodeId.split(" ")[0].split(":")[0];
}

/**
 * Convert a hex color to an rgba string.
 *
 * @param {string} color
 * @param {number} opacity
 * @returns {string}
 */
function withOpacity(color, opacity) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${opacity})`;
}

/**
 * Format link hover text.
 *
 * @param {object} link
 * @param {"Time"|"Pulls"} metricType
 * @returns {string}
 */
function formatLinkTooltip(link, metricType) {
  const sourceValue = link.source?.value || 1;
  const percentage = ((link.value / sourceValue) * 100).toFixed(1);
  const source = shortTooltipName(link.source?.id || "");
  const target = shortTooltipName(link.target?.id || "");

  if (metricType === "Time") {
    const hours = Math.floor(link.value / 3600);
    const minutes = Math.floor((link.value % 3600) / 60);
    return `${source} -> ${target}: ${hours}h ${String(minutes).padStart(2, "0")}m (${percentage}%)`;
  }

  return `${source} -> ${target}: ${link.value} pulls (${percentage}%)`;
}

/**
 * Format node hover text for exported HTML chart snapshots.
 *
 * @param {object} node
 * @param {"Time"|"Pulls"} metricType
 * @returns {string}
 */
function formatNodeExportTooltip(node, metricType) {
  const label = formatNodeLabel(node, false);
  if (metricType === "Time") return label;
  return label.replace("hr ", "pulls ");
}

/**
 * Keep hover labels compact enough to scan without covering the chart.
 *
 * @param {string} nodeId
 * @returns {string}
 */
function shortTooltipName(nodeId) {
  if (nodeId === "Meetings, Breaks and DCs") return "Meeting";
  if (nodeId === "Total Time") return "Total";
  if (nodeId === "Total Pulls") return "Total";
  return shortNodeName(nodeId);
}
