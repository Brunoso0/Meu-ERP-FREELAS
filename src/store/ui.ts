import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ModalType = 'client' | 'freelancer' | 'project' | 'task' | 'event' | 'transaction' | 'goal' | 'profile'

export interface ModalState {
  type: ModalType
  /** Registro em edição. Ausente = criação. */
  record?: Record<string, any>
  /** Valores iniciais para criação (ex.: dia clicado na agenda). */
  defaults?: Record<string, any>
}

interface UIState {
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  modal: ModalState | null
  commandOpen: boolean
  toggleTheme: () => void
  toggleSidebar: () => void
  openModal: (modal: ModalState) => void
  closeModal: () => void
  setCommandOpen: (open: boolean) => void
}

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: prefersDark() ? 'dark' : 'light',
      sidebarCollapsed: false,
      modal: null,
      commandOpen: false,
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      openModal: (modal) => set({ modal }),
      closeModal: () => set({ modal: null }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
    }),
    {
      name: 'meu-erp-freelas:ui',
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
)
