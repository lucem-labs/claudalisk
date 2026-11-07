import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app-config.schema.json'), 'utf8'));

export const configPath = (appRoot) => join(appRoot, '.claude', 'claudalisk.json');

const typeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
};

function check(schema, value, path, problems) {
  if (schema.type && typeOf(value) !== schema.type) {
    problems.push(`${path}: must be ${schema.type}, got ${typeOf(value)}`);
    return;
  }
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    problems.push(`${path}: "${value}" does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${path}: ${value} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${path}: ${value} is above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${path}: needs at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, problems));
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) problems.push(`${path}.${key}: is required`);
    const properties = schema.properties ?? {};
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) check(properties[key], item, `${path}.${key}`, problems);
      else if (schema.additionalProperties === false) problems.push(`${path}.${key}: is not a known key`);
    }
  }
}

export function validateAppConfig(value) {
  const problems = [];
  check(SCHEMA, value, '$', problems);
  return problems;
}

export function readAppConfig(appRoot) {
  const path = configPath(appRoot);
  if (!existsSync(path)) return null;
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e.message}`);
  }
  const problems = validateAppConfig(value);
  if (problems.length) throw new Error(`${path} is invalid:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  return value;
}
