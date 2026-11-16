const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function untilStable(fetch, { attempts = 12, delayMs = 250, sleep = wait, count = (value) => value.length } = {}) {
  let previous
  let value
  for (let attempt = 1; attempt <= attempts; attempt++) {
    value = await fetch()
    const current = count(value)
    if (previous === current) return { value, attempts: attempt, stable: true }
    previous = current
    if (attempt < attempts) await sleep(delayMs)
  }
  return { value, attempts, stable: false }
}
