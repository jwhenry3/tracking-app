import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { applyTheme, normalizeThemeId, type ThemeId } from '@/lib/themes'

type ThemeState = {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',

      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(normalizeThemeId(state.theme))
        }
      },
    },
  ),
)

export type { ThemeId } from '@/lib/themes'
