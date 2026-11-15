import assert from 'node:assert/strict'
import { test } from 'node:test'
import { costPerAccepted, judge } from './noise.mjs'

const ALL = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function repeat(perAccepted, passed = 7, failing = []) {
  return {
    costUsd: perAccepted * passed,
    passed,
    passedByTask: Object.fromEntries(ALL.map((task) => [task, failing.includes(task) ? 0 : 1])),
  }
}

const baseline = [repeat(30), repeat(31), repeat(32)]

test('a repeat costs its total divided by the runs that passed, and is infinite when none passed', () => {
  assert.equal(costPerAccepted({ costUsd: 12, passed: 4 }), 3)
  assert.equal(costPerAccepted({ costUsd: 5, passed: 0 }), Number.POSITIVE_INFINITY)
})

test('an arm lowers cost when every repeat beats every baseline repeat and the mean is 10 percent lower', () => {
  const result = judge({ arm: [repeat(20), repeat(21), repeat(22)], baseline })
  assert.equal(result.separated, true)
  assert.equal(result.large, true)
  assert.equal(result.verdict, 'lowers cost')
})

test('a mean exactly 10 percent lower counts as lower', () => {
  const result = judge({ arm: [repeat(25), repeat(27), repeat(29)], baseline: [repeat(30), repeat(30), repeat(30)] })
  assert.equal(result.large, true)
  assert.equal(result.verdict, 'lowers cost')
})

test('one repeat that overlaps the baseline breaks the separation', () => {
  const result = judge({ arm: [repeat(20), repeat(21), repeat(30.5)], baseline })
  assert.equal(result.separated, false)
  assert.equal(result.verdict, 'no effect')
})

test('a repeat equal to the cheapest baseline repeat is not separated', () => {
  assert.equal(judge({ arm: [repeat(10), repeat(11), repeat(30)], baseline }).separated, false)
})

test('full separation with a drop under 10 percent is no effect', () => {
  const result = judge({ arm: [repeat(28.5), repeat(28.6), repeat(28.9)], baseline: [repeat(29), repeat(29.2), repeat(29.4)] })
  assert.equal(result.separated, true)
  assert.equal(result.large, false)
  assert.equal(result.verdict, 'no effect')
})

test('a repeat where no run passed is infinite and cannot separate', () => {
  const none = { costUsd: 3, passed: 0, passedByTask: Object.fromEntries(ALL.map((task) => [task, 0])) }
  assert.equal(judge({ arm: [repeat(20), repeat(21), none], baseline }).verdict, 'no effect')
})

test('an arm that costs no more than the worst baseline repeat and passes 2 more runs holds cost while correctness rises', () => {
  const weak = [repeat(30, 6, ['T1']), repeat(31, 6, ['T1']), repeat(32, 6, ['T1'])]
  const result = judge({ arm: [repeat(31), repeat(32), repeat(32)], baseline: weak })
  assert.equal(result.separated, false)
  assert.equal(result.affordable, true)
  assert.equal(result.morePasses, true)
  assert.equal(result.verdict, 'holds cost while correctness rises')
})

test('the correctness clause needs at least 2 more passes', () => {
  const weak = [repeat(30), repeat(31), repeat(32, 6, ['T1'])]
  const result = judge({ arm: [repeat(31), repeat(32), repeat(32)], baseline: weak })
  assert.equal(result.armPassed - result.baselinePassed, 1)
  assert.equal(result.verdict, 'no effect')
})

test('the correctness clause fails when a task passes fewer runs than in the baseline', () => {
  const weak = [repeat(30, 5, ['T1', 'T2']), repeat(31, 5, ['T1', 'T2']), repeat(32, 5, ['T1', 'T2'])]
  const arm = [repeat(31, 6, ['T3']), repeat(32, 6, ['T3']), repeat(32, 6, ['T3'])]
  const result = judge({ arm, baseline: weak })
  assert.equal(result.morePasses, true)
  assert.deepEqual(result.regressions, ['T3'])
  assert.equal(result.verdict, 'no effect')
})

test('the correctness clause fails when the mean cost is above the baseline worst repeat', () => {
  const weak = [repeat(30, 5), repeat(31, 5), repeat(32, 5)]
  const result = judge({ arm: [repeat(40), repeat(41), repeat(42)], baseline: weak })
  assert.equal(result.affordable, false)
  assert.equal(result.verdict, 'no effect')
})

test('the rule needs three repeats on each side', () => {
  assert.equal(judge({ arm: [repeat(1)], baseline }).verdict, 'insufficient data')
  assert.equal(judge({ arm: baseline, baseline: baseline.slice(0, 2) }).verdict, 'insufficient data')
})

test('with no real difference the arm fully separates below the baseline in 1 of 20 splits', () => {
  const values = [1, 2, 3, 4, 5, 6]
  const splits = []
  const pick = (start, chosen) => {
    if (chosen.length === 3) { splits.push(chosen); return }
    for (let index = start; index < values.length; index += 1) pick(index + 1, [...chosen, values[index]])
  }
  pick(0, [])
  const cheaper = splits.filter((arm) => Math.max(...arm) < Math.min(...values.filter((value) => !arm.includes(value))))
  assert.equal(splits.length, 20)
  assert.equal(cheaper.length / splits.length, 0.05)
})
