const escapeData = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const escapeProperty = (text) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C')

export function reportFindings(findings, { heading, env, log = console.log, error = console.error }) {
  if (findings.length === 0) return 0
  if (env.GITHUB_ACTIONS === 'true') {
    for (const { file, line, message } of findings) {
      log(`::error file=${escapeProperty(file)}${line ? `,line=${line}` : ''}::${escapeData(message)}`)
    }
  }
  error(`${heading}\n${findings.map(({ file, line, message }) => `${file}${line ? `:${line}` : ''}: ${message}`).join('\n')}`)
  return 1
}

export function parseSkips(values = []) {
  return values.map((value) => value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''))
}

export const isSkipped = (file, skips) => skips.some((path) => file === path || file.startsWith(`${path}/`))
