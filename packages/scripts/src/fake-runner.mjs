export function fakeRunner(respond = () => ({})) {
  const calls = []
  const runner = async (command, args, options = {}) => {
    const call = { command, args, options, line: [command, ...args].join(' ') }
    calls.push(call)
    return { code: 0, stdout: '', stderr: '', ...(await respond(call)) }
  }
  runner.calls = calls
  return runner
}
