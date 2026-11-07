import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const requiredFields = {
  app: ['name', 'hostPrefix', 'repo', 'databases', 'ports', 'uat'],
  database: ['role', 'envVar'],
  ports: ['devDb', 'apiLocal'],
  uat: ['composeProject', 'volume'],
}

export const allowedKeys = {
  app: ['$schema', 'name', 'hostPrefix', 'repo', 'databases', 'ports', 'uat', 'backup', 'askCommands', 'ownerOnlyCommands', 'runnerLabel', 'review'],
  database: ['role', 'envVar'],
  ports: ['devDb', 'apiLocal'],
  uat: ['composeProject', 'volume', 'protectedVolumes'],
  backup: ['keep'],
  review: ['uatData', 'security'],
}

export const configPath = (appRoot) => join(appRoot, '.claude', 'claudalisk.json')

const isText = (value) => typeof value === 'string' && value.length > 0

function requireFields(value, fields, path, file) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${file}: "${path}" must be an object.`)
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new Error(`${file}: "${path ? `${path}.` : ''}${field}" is missing.`)
  }
}

function rejectUnknownKeys(value, allowed, path, file) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${file}: "${path}" must be an object.`)
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${file}: "${path ? `${path}.` : ''}${key}" is not a known setting.`)
  }
}

export function parseAppConfig(text, file = '.claude/claudalisk.json') {
  let config
  try {
    config = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`)
  }
  requireFields(config, requiredFields.app, '', file)
  rejectUnknownKeys(config, allowedKeys.app, '', file)
  for (const field of ['name', 'hostPrefix', 'repo']) {
    if (!isText(config[field])) throw new Error(`${file}: "${field}" must be a non-empty string.`)
  }
  if (!Array.isArray(config.databases) || config.databases.length === 0) {
    throw new Error(`${file}: "databases" must list at least one database.`)
  }
  config.databases.forEach((database, index) => {
    requireFields(database, requiredFields.database, `databases[${index}]`, file)
    rejectUnknownKeys(database, allowedKeys.database, `databases[${index}]`, file)
    for (const field of requiredFields.database) {
      if (!isText(database[field])) throw new Error(`${file}: "databases[${index}].${field}" must be a non-empty string.`)
    }
  })
  requireFields(config.ports, requiredFields.ports, 'ports', file)
  rejectUnknownKeys(config.ports, allowedKeys.ports, 'ports', file)
  for (const field of requiredFields.ports) {
    if (!Number.isInteger(config.ports[field])) throw new Error(`${file}: "ports.${field}" must be a whole number.`)
  }
  requireFields(config.uat, requiredFields.uat, 'uat', file)
  rejectUnknownKeys(config.uat, allowedKeys.uat, 'uat', file)
  for (const field of requiredFields.uat) {
    if (!isText(config.uat[field])) throw new Error(`${file}: "uat.${field}" must be a non-empty string.`)
  }
  if (config.backup !== undefined) rejectUnknownKeys(config.backup, allowedKeys.backup, 'backup', file)
  if (config.review !== undefined) rejectUnknownKeys(config.review, allowedKeys.review, 'review', file)
  if (config.backup?.keep !== undefined && !(Number.isInteger(config.backup.keep) && config.backup.keep >= 1)) {
    throw new Error(`${file}: "backup.keep" must be a whole number of at least 1.`)
  }
  return config
}

export function readApp(appRoot) {
  const file = configPath(appRoot)
  if (!existsSync(file)) throw new Error(`${file} does not exist. Create the app config (CLA-0082) first.`)
  return { ...parseAppConfig(readFileSync(file, 'utf8'), file), root: appRoot }
}
