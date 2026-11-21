const ANSI = /\x1b\[[0-9;]*m/g
const NEWLINE = /\r?\n/

export class LogLatch {
  #pattern
  #limit
  #lines = []
  #partial = ''
  #release
  latched = false
  match = null

  constructor(pattern, { limit = 200 } = {}) {
    this.#pattern = pattern
    this.#limit = limit
    this.done = new Promise((resolve) => {
      this.#release = resolve
    })
  }

  write(chunk) {
    const parts = (this.#partial + String(chunk)).split(NEWLINE)
    this.#partial = parts.pop()
    for (const line of parts) this.#keep(line)
    this.#check(this.#partial)
    if (this.#partial.length > 65536) {
      this.#keep(this.#partial)
      this.#partial = ''
    }
  }

  tail() {
    return [...this.#lines, this.#partial].filter(Boolean).join('\n')
  }

  #keep(line) {
    this.#check(line)
    this.#lines.push(line)
    if (this.#lines.length > this.#limit) this.#lines.splice(0, this.#lines.length - this.#limit)
  }

  #check(line) {
    if (this.latched) return
    const match = this.#pattern.exec(line.replace(ANSI, ''))
    if (!match) return
    this.latched = true
    this.match = match
    this.#release()
  }
}
