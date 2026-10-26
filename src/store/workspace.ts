import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WorkspaceState {
  /** Workspace em que a pessoa está trabalhando. Vazio até o app confirmar que ela é membro. */
  activeId: string | null
  setActive: (id: string | null) => void
}

/** O que lembramos entre uma visita e outra é só qual workspace estava aberto. */
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeId: null,
      setActive: (activeId) => set({ activeId }),
    }),
    { name: 'meu-erp-freelas:workspace' },
  ),
)

export const activeWorkspaceId = () => useWorkspaceStore.getState().activeId
