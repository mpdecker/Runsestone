import type { StateCreator } from 'zustand'
import type { AppStore } from './index'
import * as api from '../lib/api'

export interface ClipperSlice {
  clipperPort: number | null
  clipperLoading: boolean
  clipperAuthToken: string | null
  loadClipperStatus: () => Promise<void>
  startClipper: () => Promise<void>
  stopClipper: () => Promise<void>
}

export const createClipperSlice: StateCreator<AppStore, [], [], ClipperSlice> = (set, get) => ({
  clipperPort: null,
  clipperLoading: false,
  clipperAuthToken: null,

  loadClipperStatus: async () => {
    try {
      const [port, token] = await Promise.all([
        api.getClipperStatus(),
        api.getClipperAuthToken(),
      ])
      set({ clipperPort: port, clipperAuthToken: token })
    } catch {
      // clipper not available
    }
  },

  startClipper: async () => {
    const { selectedVaultId } = get()
    if (!selectedVaultId) return
    set({ clipperLoading: true })
    try {
      const port = await api.startClipperServer(selectedVaultId)
      const token = await api.getClipperAuthToken()
      set({ clipperPort: port, clipperAuthToken: token, clipperLoading: false })
    } catch (e) {
      set({ clipperLoading: false, error: `Failed to start clipper: ${e}` })
    }
  },

  stopClipper: async () => {
    try {
      await api.stopClipperServer()
      set({ clipperPort: null })
    } catch (e) {
      set({ error: `Failed to stop clipper: ${e}` })
    }
  },
})
