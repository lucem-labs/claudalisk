import { REPEATS, costPerAccepted, judge } from './noise.mjs'
import { sumUsage } from './usage.mjs'

const cacheRead = (record) => sumUsage(record.models ?? {}).cacheRead

export function stats(values) {
  if (!values.length) return { mean: 0, min: 0, max: 0 }
  return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, min: Math.min(...values), max: Math.max(...values) }
}

export function repeatsOf(records, tasks) {
  const numbers = [...new Set(records.map((record) => record.run))].sort((left, right) => left - right)
  return numbers
    .map((run) => {
      const inRepeat = records.filter((record) => record.run === run)
      const complete = tasks.every((task) => inRepeat.some((record) => record.task === task))
      const passedByTask = Object.fromEntries(tasks.map((task) => [task, inRepeat.filter((record) => record.task === task && record.accepted).length]))
      return {
        run,
        complete,
        runs: inRepeat.length,
        costUsd: inRepeat.reduce((sum, record) => sum + record.totalCostUsd, 0),
        passed: inRepeat.filter((record) => record.accepted).length,
        passedByTask,
      }
    })
    .filter((repeat) => repeat.complete)
}

const usd = (value) => `$${value.toFixed(2)}`
const whole = (value) => Math.round(value).toLocaleString('en-US')
const spread = (values, format) => {
  const { mean, min, max } = stats(values)
  return `${format(mean)} (${format(min)} to ${format(max)})`
}

function row(label, records) {
  const passed = records.filter((record) => record.accepted).length
  return [
    label,
    String(records.length),
    String(passed),
    records.length ? `${Math.round((passed / records.length) * 100)}%` : '-',
    spread(records.map((record) => record.totalCostUsd), usd),
    spread(records.map((record) => record.turns), whole),
    spread(records.map(cacheRead), whole),
    spread(records.map((record) => record.subagents), (value) => value.toFixed(1)),
    spread(records.map((record) => record.wallMs / 1000), whole),
  ]
}

export function table(records, tasks) {
  const header = ['Task', 'Runs', 'Passed', 'Pass rate', 'Cost mean (min to max)', 'Turns', 'Cache read tokens', 'Subagents', 'Wall seconds']
  const body = tasks.map((task) => row(task, records.filter((record) => record.task === task)))
  body.push(row('Suite', records))
  return [header, header.map(() => '---'), ...body].map((cells) => `| ${cells.join(' | ')} |`).join('\n')
}

export const perAccepted = (value) => (Number.isFinite(value) ? usd(value) : 'no run passed')

export function renderArm(name, records, tasks) {
  const repeats = repeatsOf(records, tasks)
  const lines = [`## ${name}`, '', table(records, tasks), '']
  if (!repeats.length) {
    lines.push('No complete repeat yet: a repeat is one run of every task.')
  } else {
    lines.push('Cost per accepted task, one value per repeat (the repeat\'s total cost divided by its runs that passed):')
    for (const repeat of repeats) lines.push(`- repeat ${repeat.run}: ${usd(repeat.costUsd)} over ${repeat.passed} of ${repeat.runs} runs passed, ${perAccepted(costPerAccepted(repeat))} per accepted task`)
  }
  return lines.join('\n')
}

export function renderVerdict(armName, baselineName, arm, baseline) {
  const armRepeats = arm.slice(0, REPEATS)
  const baselineRepeats = baseline.slice(0, REPEATS)
  const result = judge({ arm: armRepeats, baseline: baselineRepeats })
  const lines = [`## ${armName} against ${baselineName}`, '', `Verdict: ${result.verdict}`]
  if (result.reason) {
    lines.push('', result.reason)
    return { text: lines.join('\n'), result }
  }
  lines.push(
    '',
    `- separation: ${result.separated ? 'yes' : 'no'}; the arm's repeats cost ${result.armCosts.map(perAccepted).join(', ')} per accepted task, the baseline's ${result.baselineCosts.map(perAccepted).join(', ')}`,
    `- size: arm mean ${perAccepted(result.armMean)} against baseline mean ${perAccepted(result.baselineMean)}; ${result.large ? 'at least 10% lower' : 'less than 10% lower'}`,
    `- correctness: the arm passed ${result.armPassed} runs and the baseline ${result.baselinePassed}; ${result.regressions.length ? `fewer passes than the baseline on ${result.regressions.join(', ')}` : 'no task passes fewer runs than in the baseline'}`,
  )
  return { text: lines.join('\n'), result }
}

export function renderReport({ armName, records, tasks, against, baselineRecords }) {
  const parts = [renderArm(armName, records, tasks)]
  if (against) {
    parts.push(renderArm(against, baselineRecords, tasks))
    parts.push(renderVerdict(armName, against, repeatsOf(records, tasks), repeatsOf(baselineRecords, tasks)).text)
  }
  return parts.join('\n\n')
}
