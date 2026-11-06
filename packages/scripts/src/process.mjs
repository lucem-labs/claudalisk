import { spawn } from 'node:child_process'

export function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const output = options.inherit ? 'inherit' : 'pipe'
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', output, output],
      shell: false,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }))
    if (options.input !== undefined) child.stdin.end(options.input)
  })
}

export async function runChecked(runner, command, args, options = {}) {
  const result = await runner(command, args, options)
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`${options.what ?? `${command} ${args[0]}`} failed with exit code ${result.code}${detail ? `: ${detail}` : ''}`)
  }
  return result
}

export function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}
