export type ThemeId = 'system' | 'light' | 'dark' | 'ocean' | 'forest' | 'sunset' | 'midnight'

export type ResolvedThemeId = Exclude<ThemeId, 'system'>

export type ThemeOption = {
  id: ThemeId
  label: string
  description: string
  swatch: [string, string]
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'system',
    label: 'System',
    description: 'Match your device',
    swatch: ['#f4f4f5', '#18181b'],
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Clean neutral light',
    swatch: ['#fafafa', '#171717'],
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Neutral dark',
    swatch: ['#27272a', '#fafafa'],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Cool blue tones',
    swatch: ['#eef6ff', '#1d4ed8'],
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Calm green tones',
    swatch: ['#eefaf3', '#15803d'],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm amber tones',
    swatch: ['#fff7ed', '#c2410c'],
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep blue night',
    swatch: ['#1e1b4b', '#c7d2fe'],
  },
]

const darkThemes = new Set<ResolvedThemeId>(['dark', 'midnight'])

export function isDarkTheme(theme: ResolvedThemeId) {
  return darkThemes.has(theme)
}

export function normalizeThemeId(value: unknown): ThemeId {
  if (typeof value !== 'string') return 'system'
  return THEME_OPTIONS.some((option) => option.id === value) ? (value as ThemeId) : 'system'
}

export function getSystemTheme(): ResolvedThemeId {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(theme: ThemeId): ResolvedThemeId {
  return theme === 'system' ? getSystemTheme() : theme
}

export function applyTheme(theme: ThemeId) {
  const resolved = resolveTheme(theme)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = isDarkTheme(resolved) ? 'dark' : 'light'
}

export function readStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return 'system'

  try {
    const stored = JSON.parse(localStorage.getItem('theme-storage') ?? '{}')
    return normalizeThemeId(stored.state?.theme)
  } catch {
    return 'system'
  }
}
