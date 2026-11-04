export type Link = {
  href: string
}

export type Action = {
  href: string
  method: string
}

export type Links = Record<string, Link | undefined>

export type Actions = Record<string, Action | undefined>

export type Representation = {
  _links?: Links
  _actions?: Actions
}

export function actionOf(representation: Representation | undefined, name: string): Action | undefined {
  return representation?._actions?.[name]
}

export function linkOf(representation: Representation | undefined, relation: string): Link | undefined {
  return representation?._links?.[relation]
}
