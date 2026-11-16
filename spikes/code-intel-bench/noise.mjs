export const REPEATS = 3
export const MINIMUM_DROP = 0.1
export const EXTRA_PASSES = 2

export function costPerAccepted({ costUsd, passed }) {
  return passed > 0 ? costUsd / passed : Number.POSITIVE_INFINITY
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

function sumBy(repeats, key) {
  const totals = {}
  for (const repeat of repeats) {
    for (const [task, count] of Object.entries(repeat[key])) totals[task] = (totals[task] ?? 0) + count
  }
  return totals
}

export function judge({ arm, baseline }) {
  if (arm.length !== REPEATS || baseline.length !== REPEATS) {
    return { verdict: 'insufficient data', reason: `The rule needs ${REPEATS} repeats of each side; the arm has ${arm.length} and the baseline ${baseline.length}.` }
  }
  const armCosts = arm.map(costPerAccepted)
  const baselineCosts = baseline.map(costPerAccepted)
  const armMean = mean(armCosts)
  const baselineMean = mean(baselineCosts)
  const separated = Math.max(...armCosts) < Math.min(...baselineCosts)
  const large = armMean <= baselineMean * (1 - MINIMUM_DROP)
  const armPassed = arm.reduce((sum, repeat) => sum + repeat.passed, 0)
  const baselinePassed = baseline.reduce((sum, repeat) => sum + repeat.passed, 0)
  const armByTask = sumBy(arm, 'passedByTask')
  const baselineByTask = sumBy(baseline, 'passedByTask')
  const tasks = new Set([...Object.keys(armByTask), ...Object.keys(baselineByTask)])
  const regressions = [...tasks].filter((task) => (armByTask[task] ?? 0) < (baselineByTask[task] ?? 0))
  const affordable = armMean <= Math.max(...baselineCosts)
  const morePasses = armPassed >= baselinePassed + EXTRA_PASSES
  const details = { armCosts, baselineCosts, armMean, baselineMean, separated, large, affordable, morePasses, armPassed, baselinePassed, regressions }
  if (separated && large) return { verdict: 'lowers cost', ...details }
  if (affordable && morePasses && regressions.length === 0) return { verdict: 'holds cost while correctness rises', ...details }
  return { verdict: 'no effect', ...details }
}
