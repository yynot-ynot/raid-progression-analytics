/**
 * Create a normalized pull row used by later aggregation and CSV parity work.
 *
 * @param {object} pull
 * @returns {object}
 */
export function createNormalizedPullRow(pull = {}) {
  return {
    reportCode: pull.reportCode,
    reportTitle: pull.reportTitle ?? null,
    raidDate: pull.raidDate,
    pullNumber: pull.pullNumber,
    fightId: pull.fightId,
    encounterId: pull.encounterId ?? null,
    pullStartTimestamp: pull.pullStartTimestamp,
    pullStartDisplayTime: pull.pullStartDisplayTime,
    pullDurationMs: pull.pullDurationMs,
    bossHpPercentage: pull.bossHpPercentage ?? null,
    kill: Boolean(pull.kill),
    endingPhaseId: pull.endingPhaseId ?? null,
    endingPhaseName: pull.endingPhaseName ?? null,
    phaseTransitions: pull.phaseTransitions ?? [],
    participatingPlayerIds: pull.participatingPlayerIds ?? [],
  };
}
