import { existsSync, readFileSync } from 'node:fs'

export function scoutBashDecisions(file) {
  const counts = { allowed: 0, denied: 0, unknownAgent: 0 }
  if (!file || !existsSync(file)) return counts
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const { decision } = JSON.parse(line)
      if (decision in counts) counts[decision] += 1
    } catch {
      continue
    }
  }
  return counts
}
