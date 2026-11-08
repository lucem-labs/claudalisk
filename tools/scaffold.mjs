#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND_TEMPLATE = join(PLUGIN_ROOT, 'templates', 'app', 'backend')
const MODULE_TEMPLATE = join(PLUGIN_ROOT, 'templates', 'module')
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/

const snake = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const readLf = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

function requirePascal(label, value) {
  if (!value || !PASCAL_CASE.test(value)) {
    throw new Error(`${label} must be PascalCase, got '${value ?? ''}'.`)
  }
}

function applyTokens(text, tokens) {
  return Object.entries(tokens).reduce((result, [token, value]) => result.replaceAll(`<${token}>`, value), text)
}

function targetPath(path, { root, module, aggregate, timestamp }) {
  const segments = path.split(/[\\/]/).map((segment) => {
    const renamed = segment.replace(/^Root(?=\.|$)/, root)
    if (!module) {
      return renamed
    }
    return renamed
      .replace(/\.Name(?=\.|$)/g, `.${module}`)
      .replace(/^Timestamp_InitialName/, `${timestamp}_Initial${module}`)
      .replace(/^Name(?=[A-Z])/, module)
      .replace(/Aggregates/g, aggregate.plural)
      .replace(/Aggregate/g, aggregate.name)
  })
  return join(...segments)
}

function copyTemplate(templateRoot, destination, tokens, names) {
  const walk = (folder) => {
    for (const entry of readdirSync(folder)) {
      const source = join(folder, entry)
      if (statSync(source).isDirectory()) {
        walk(source)
        continue
      }
      const output = join(destination, targetPath(relative(templateRoot, source), names))
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, applyTokens(readLf(source), tokens))
    }
  }
  walk(templateRoot)
}

function findRoot(backend) {
  const solution = readdirSync(backend).find((entry) => entry.endsWith('.slnx'))
  if (!solution) {
    throw new Error(`No .slnx file in ${backend}.`)
  }
  return solution.slice(0, -'.slnx'.length)
}

function insertBefore(file, marker, line) {
  const text = readLf(file)
  const index = text.lastIndexOf(marker)
  if (index < 0) {
    throw new Error(`${file} has no '${marker.trim()}' to insert before.`)
  }
  const lineStart = text.lastIndexOf('\n', index) + 1
  writeFileSync(file, `${text.slice(0, lineStart)}${line}\n${text.slice(lineStart)}`)
}

function timestampOf(date) {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

export function addModule({ appRoot, module, aggregate, plural, now = new Date() }) {
  requirePascal('The module', module)
  requirePascal('The aggregate', aggregate)
  const aggregates = plural ?? `${aggregate}s`
  requirePascal('The plural', aggregates)
  if (module === aggregate || module === aggregates) {
    throw new Error(`The aggregate must differ from the module '${module}', because a type named like its module's namespace does not resolve.`)
  }

  const backend = join(appRoot, 'backend')
  const root = findRoot(backend)
  const implementation = `${root}.Modules.${module}`
  if (existsSync(join(backend, implementation))) {
    throw new Error(`The module ${module} already exists.`)
  }

  const timestamp = timestampOf(now)
  copyTemplate(
    MODULE_TEMPLATE,
    backend,
    {
      Root: root,
      Name: module,
      schema: snake(module),
      Aggregates: aggregates,
      aggregates: snake(aggregates),
      Aggregate: aggregate,
      route: kebab(aggregate),
      routes: kebab(aggregates),
      timestamp,
    },
    { root, module, aggregate: { name: aggregate, plural: aggregates }, timestamp },
  )

  const solution = join(backend, `${root}.slnx`)
  for (const suffix of ['', '.Interfaces', '.Domain', '.Persistence', '.Persistence.Interfaces', '.Tests']) {
    const project = `${implementation}${suffix}`
    insertBefore(solution, '</Solution>', `  <Project Path="${project}/${project}.csproj" />`)
  }

  const host = join(backend, `${root}.Api`)
  insertBefore(join(host, 'AppModules.cs'), '    ];', `        new ${root}.Modules.${module}.${module}Module(),`)
  insertBefore(
    join(host, `${root}.Api.csproj`),
    '  </ItemGroup>\n</Project>',
    `    <ProjectReference Include="../${implementation}/${implementation}.csproj" />`,
  )
  return { root, implementation }
}

export function generateBackend({ target, root, module, aggregate, plural, now }) {
  requirePascal('The root', root)
  const backend = join(target, 'backend')
  if (existsSync(join(backend, `${root}.slnx`))) {
    throw new Error(`${backend} already has a backend.`)
  }
  mkdirSync(backend, { recursive: true })
  if (Boolean(module) !== Boolean(aggregate)) {
    throw new Error('Pass --module and --aggregate together, or neither for an app with no modules yet.')
  }
  copyTemplate(BACKEND_TEMPLATE, backend, { Root: root, root: snake(root) }, { root })
  copyFileSync(join(PLUGIN_ROOT, 'templates', 'app', 'global.json'), join(target, 'global.json'))
  return module ? addModule({ appRoot: target, module, aggregate, plural, now }) : { root, implementation: null }
}

function parseArguments(argv) {
  const positional = []
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith('--')) {
      options[argv[index].slice(2)] = argv[index + 1]
      index += 1
    } else {
      positional.push(argv[index])
    }
  }
  return { positional, options }
}

function main(argv) {
  const { positional: [command, path], options } = parseArguments(argv)
  if (command === 'backend' && path) {
    const result = generateBackend({ target: resolve(path), root: options.root, module: options.module, aggregate: options.aggregate, plural: options.plural })
    console.log(`Generated backend/${result.root}.slnx${result.implementation ? ` with the module ${result.implementation}` : ' with no modules yet'}.`)
    return
  }
  if (command === 'add-module' && path) {
    const result = addModule({ appRoot: resolve(path), module: options.module, aggregate: options.aggregate, plural: options.plural })
    console.log(`Added ${result.implementation}.`)
    return
  }
  throw new Error('Usage: scaffold.mjs backend <app folder> --root <Root> [--module <Name> --aggregate <Aggregate> [--plural <Plural>]]\n       scaffold.mjs add-module <app folder> --module <Name> --aggregate <Aggregate> [--plural <Plural>]')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
