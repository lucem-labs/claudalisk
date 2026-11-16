export class CodeIntelError extends Error {}

export const errorText = (error) => (error instanceof CodeIntelError ? error.message : `failed: ${error?.message ?? error}`)
