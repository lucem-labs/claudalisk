import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isVersion } from './semver.mjs'

export const versionFile = 'package.json'

export function parseAppVersion(text, file = versionFile) {
  let manifest
  try {
    manifest = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new Error(`${file} is not valid JSON, so the app version cannot be read.`)
  }
  if (manifest?.version === undefined) return null
  if (!isVersion(manifest.version)) {
    throw new Error(`${file}: "version" is ${JSON.stringify(manifest.version)}, which is not a Semantic Versioning 2.0.0 version without build metadata (CLA-0099).`)
  }
  return manifest.version
}

export function readAppVersion(appRoot) {
  const file = join(appRoot, versionFile)
  return existsSync(file) ? parseAppVersion(readFileSync(file, 'utf8'), file) : null
}
