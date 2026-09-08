const GOLDEN_ANGLE = 137.508
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

export type WorkspaceColorSource = {
  id: number
  color?: string | null
}

export function workspaceInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function workspaceHue(workspaceId: number) {
  return Math.abs(workspaceId * GOLDEN_ANGLE) % 360
}

function hslToHex(h: number, s: number, l: number) {
  const saturation = s / 100
  const lightness = l / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const huePrime = h / 60
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1))
  let red = 0
  let green = 0
  let blue = 0

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma
    green = x
  } else if (huePrime < 2) {
    red = x
    green = chroma
  } else if (huePrime < 3) {
    green = chroma
    blue = x
  } else if (huePrime < 4) {
    green = x
    blue = chroma
  } else if (huePrime < 5) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  const match = lightness - chroma / 2
  const toHex = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

export function generatedWorkspaceColor(workspaceId: number) {
  return hslToHex(workspaceHue(workspaceId), 62, 48)
}

/** @deprecated Use resolveWorkspaceColor instead */
export function workspaceColor(workspaceId: number) {
  return generatedWorkspaceColor(workspaceId)
}

export function resolveWorkspaceColor(workspace: WorkspaceColorSource) {
  if (workspace.color && HEX_COLOR_PATTERN.test(workspace.color)) {
    return workspace.color.toLowerCase()
  }
  return generatedWorkspaceColor(workspace.id)
}

export function groupItemsByWorkspace<T extends { workspaceId?: number }>(items: T[]) {
  const groups = new Map<number, T[]>()
  const ungrouped: T[] = []

  for (const item of items) {
    if (item.workspaceId === undefined) {
      ungrouped.push(item)
      continue
    }
    groups.set(item.workspaceId, [...(groups.get(item.workspaceId) ?? []), item])
  }

  const grouped = [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([workspaceId, groupItems]) => ({ workspaceId, items: groupItems }))

  if (ungrouped.length > 0) {
    grouped.push({ workspaceId: -1, items: ungrouped })
  }

  return grouped
}
