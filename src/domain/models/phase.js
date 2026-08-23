/**
 * Create a normalized encounter phase summary.
 *
 * @param {object} phase
 * @returns {object}
 */
export function createPhaseSummary(phase = {}) {
  return {
    encounterId: phase.encounterId ?? phase.encounterID ?? null,
    id: phase.id,
    name: phase.name ?? null,
    isIntermission: Boolean(phase.isIntermission),
  };
}
