/**
 * Place a live tooltip beside its pointer without allowing it to overflow its
 * chart panel. Near the right or lower edges it flips to the opposite side.
 *
 * @param {HTMLElement} tooltip
 * @param {HTMLElement} container
 * @param {MouseEvent} event
 */
export function positionTooltipInContainer(tooltip, container, event) {
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
 * Kept DOM-free so chart renderers share testable edge behavior without a
 * browser test environment.
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
