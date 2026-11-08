export const PARALLEL_PROJECT = 'parallel'
export const SERIAL_PROJECT = 'serial'

export function playwrightArgs(project, extra) {
  const passWithNoTests = project === SERIAL_PROJECT || extra.length > 0
  return ['test', `--project=${project}`, ...(passWithNoTests ? ['--pass-with-no-tests'] : []), ...extra]
}

export async function runProjects(run, extra = []) {
  const parallel = await run(PARALLEL_PROJECT, playwrightArgs(PARALLEL_PROJECT, extra))
  const serial = await run(SERIAL_PROJECT, playwrightArgs(SERIAL_PROJECT, extra))
  return parallel || serial
}
