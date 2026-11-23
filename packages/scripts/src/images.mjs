import { compose, composeChecked } from './environment.mjs'
import { runChecked } from './process.mjs'

const serviceAndImage = '{{index .Config.Labels "com.docker.compose.service"}}\t{{.Image}}'
const imageId = ['image', 'inspect', '--format', '{{.Id}}']
const imageLayers = ['image', 'inspect', '--format', '{{json .RootFS.Layers}}']
const fixedTags = ['latest', 'previous', 'replaced']

export async function requireDefaultImageNames(runner, settings, env = {}) {
  const read = await composeChecked(runner, settings, ['--profile', 'migrate', 'config', '--format', 'json'], { env, what: 'Reading the Compose config' })
  let services
  try {
    services = JSON.parse(read.stdout).services ?? {}
  } catch (error) {
    throw new Error(`Refusing to deploy ${settings.environment}: docker compose config did not print JSON (${error.message}). Nothing was changed.`)
  }
  const named = Object.entries(services)
    .filter(([service, { build, image }]) => build && image && ![`${settings.project}-${service}`, `${settings.project}-${service}:latest`].includes(image))
    .map(([service, { image }]) => `${service} (image: ${image})`)
  if (named.length === 0) return
  throw new Error(`Refusing to deploy ${settings.environment}: the Compose files name the image of a service they build: ${named.join(', ')}. A deploy keeps the current and the previous image under Compose's default name, ${settings.project}-<service>, so under another name nothing is kept or removed and every deploy leaves an image behind (CLA-0030). Remove the image key from each service that has a build key; the deploy tags what it built with the app's version (CLA-0099). Nothing was changed.`)
}

async function runningImages(runner, settings) {
  const listed = await compose(runner, settings, ['ps', '--all', '--quiet'])
  const containers = listed.code === 0 ? listed.stdout.split(/\r?\n/).filter(Boolean) : []
  if (containers.length === 0) return []
  const inspected = await runner('docker', ['inspect', '--format', serviceAndImage, ...containers])
  if (inspected.code !== 0) return []
  return inspected.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split('\t'))
    .filter(([service, image]) => service && image)
}

export async function holdReplacedImages(runner, settings) {
  const held = []
  for (const [service, image] of await runningImages(runner, settings)) {
    const repository = `${settings.project}-${service}`
    if ((await runner('docker', [...imageId, repository])).code !== 0) continue
    if ((await runner('docker', ['tag', image, `${repository}:replaced`])).code === 0) held.push(repository)
  }
  return held
}

async function keepPrevious(runner, repository) {
  const layers = await runChecked(runner, 'docker', [...imageLayers, repository, `${repository}:replaced`], { what: `Reading the layers of ${repository}` })
  const [current, replaced] = layers.stdout.trim().split(/\r?\n/).map((line) => line.trim())
  if (!current || current !== replaced) {
    await runChecked(runner, 'docker', ['tag', `${repository}:replaced`, `${repository}:previous`], { what: `Tagging the previous image of ${repository}` })
  }
  await runChecked(runner, 'docker', ['image', 'rm', `${repository}:replaced`], { what: `Untagging ${repository}:replaced` })
}

async function projectTags(runner, project) {
  const listed = await runChecked(runner, 'docker', ['image', 'ls', '--no-trunc', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Repository}}\t{{.Tag}}\t{{.ID}}'], {
    what: `Listing the ${project} images`,
  })
  const repositories = new Map()
  for (const line of listed.stdout.split(/\r?\n/)) {
    const [repository, tag, id] = line.trim().split('\t')
    if (!id || repository === '<none>' || tag === '<none>') continue
    if (!repositories.has(repository)) repositories.set(repository, new Map())
    repositories.get(repository).set(tag, id)
  }
  return repositories
}

async function keepVersionTags(runner, project, version, current) {
  for (const [repository, tags] of await projectTags(runner, project)) {
    if (!tags.has('latest') || !current.has(repository)) continue
    if (version) await runChecked(runner, 'docker', ['tag', `${repository}:latest`, `${repository}:${version}`], { what: `Tagging ${repository} with its version` })
    for (const [tag, id] of tags) {
      if (fixedTags.includes(tag) || tag === version || id === tags.get('previous')) continue
      await runner('docker', ['image', 'rm', `${repository}:${tag}`])
    }
  }
}

async function imagesInUse(runner) {
  const listed = await runChecked(runner, 'docker', ['ps', '--all', '--quiet'], { what: 'Listing the containers' })
  const containers = listed.stdout.split(/\r?\n/).filter(Boolean)
  if (containers.length === 0) return new Set()
  const inspected = await runChecked(runner, 'docker', ['inspect', '--format', '{{.Image}}', ...containers], { what: 'Reading the images the containers use' })
  return new Set(inspected.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
}

async function currentRepositories(runner, settings, env) {
  const listed = await composeChecked(runner, settings, ['--profile', 'migrate', 'config', '--services'], { env, what: 'Listing the Compose services' })
  const services = listed.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (services.length === 0) throw new Error('docker compose config listed no services')
  return new Set(services.map((service) => `${settings.project}-${service}`))
}

async function removeImagesOfGoneServices(runner, settings, current) {
  const gone = [...(await projectTags(runner, settings.project))].filter(([repository]) => !current.has(repository))
  if (gone.length === 0) return
  const used = await imagesInUse(runner)
  for (const [repository, tags] of gone) {
    if ([...tags.values()].some((id) => used.has(id))) continue
    for (const tag of tags.keys()) await runner('docker', ['image', 'rm', `${repository}:${tag}`])
  }
}

export async function keepCurrentAndPreviousImages(runner, settings, held, version = null, env = {}) {
  for (const repository of held) await keepPrevious(runner, repository)
  const current = await currentRepositories(runner, settings, env)
  await removeImagesOfGoneServices(runner, settings, current)
  await keepVersionTags(runner, settings.project, version, current)
  const pruned = await runChecked(runner, 'docker', ['image', 'prune', '--force', '--filter', `label=com.docker.compose.project=${settings.project}`], {
    what: `Removing the older ${settings.project} images`,
  })
  return /Total reclaimed space: (.+)/.exec(pruned.stdout)?.[1].trim() ?? null
}
