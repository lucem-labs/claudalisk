import { spawn } from 'node:child_process'
import { LogLatch } from './log-latch.mjs'

export const STARTUP_TIMEOUT_MS = 180000

export function runToEnd(command, args, options) {
  return new Promise((resolve, reject) => {
    const latch = new LogLatch(/$^/)
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk) => latch.write(chunk))
    child.stderr.on('data', (chunk) => latch.write(chunk))
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}.\n${latch.tail()}`))
    })
  })
}

export async function startUntilLogged({ name, command, args, options, ready, timeoutMs = STARTUP_TIMEOUT_MS }) {
  const latch = new LogLatch(ready)
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (chunk) => latch.write(chunk))
  child.stderr.on('data', (chunk) => latch.write(chunk))
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
    await exited
  }

  let timer
  const failed = new Promise((_, reject) => {
    child.once('error', reject)
    exited.then((code) => reject(new Error(`${name} exited with ${code} before it was ready.\n${latch.tail()}`)))
    timer = setTimeout(() => reject(new Error(`${name} was not ready after ${timeoutMs} ms.\n${latch.tail()}`)), timeoutMs)
  })
  try {
    await Promise.race([latch.done, failed])
  } catch (error) {
    await stop()
    throw error
  } finally {
    clearTimeout(timer)
  }
  failed.catch(() => {})
  return { stop, tail: () => latch.tail() }
}
