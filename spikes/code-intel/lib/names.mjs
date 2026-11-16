import { CodeIntelError } from './errors.mjs'

const SCRIPT_EXTENSION = /\.(?:tsx?|mts|cts)$/
const SIGNATURE = /[(<[ ].*$/s

export const stripSignature = (name) => name.replace(SIGNATURE, '')

export function parseName(input) {
  const text = String(input ?? '').trim()
  if (!text) throw new CodeIntelError('empty name')
  const colon = text.indexOf(':')
  if (colon < 0) {
    const member = text.split('.').filter(Boolean)
    if (!member.length) throw new CodeIntelError(`"${text}" is not a name path`)
    return { language: 'csharp', scope: [], member, query: member.at(-1) }
  }
  const scope = text.slice(0, colon).replaceAll('\\', '/').split('/').filter(Boolean)
  const member = text.slice(colon + 1).split('.').filter(Boolean)
  if (!scope.length || !member.length) throw new CodeIntelError(`"${text}" is not a name path; write folder/or/file:exportedName`)
  scope[scope.length - 1] = scope.at(-1).replace(SCRIPT_EXTENSION, '')
  return { language: 'typescript', scope, member, query: member.at(-1) }
}

export function chainOfSymbolPath(path) {
  return path.flatMap((name) => stripSignature(name).split('.')).filter(Boolean)
}

const endsWith = (list, tail) => tail.length <= list.length && tail.every((item, i) => list[list.length - tail.length + i] === item)

const contiguous = (list, run) => {
  for (let i = 0; i + run.length <= list.length; i++) if (run.every((item, j) => list[i + j] === item)) return true
  return false
}

export function pathSegments(relativePath) {
  const segments = relativePath.split('/')
  segments[segments.length - 1] = segments.at(-1).replace(/\.[^.]+$/, '')
  return segments
}

const inOrder = (list, run) => {
  let next = 0
  for (const item of list) if (item === run[next]) next++
  return next === run.length
}

const csharpMatches = (chain, member) => chain.at(-1) === member.at(-1) && inOrder(chain.slice(0, -1), member.slice(0, -1))

export function matches(parsed, candidate) {
  if (parsed.language === 'csharp') return csharpMatches(candidate.chain, parsed.member)
  if (!endsWith(candidate.chain, parsed.member)) return false
  return contiguous(pathSegments(candidate.path), parsed.scope)
}

export function qualified(parsed, candidate) {
  const chain = candidate.chain.join('.')
  return parsed.language === 'csharp' ? chain : `${pathSegments(candidate.path).join('/')}:${chain}`
}
