import type { StateCreator } from 'zustand'
import type { NodeVersion } from '../lib/types'
import type { AppStore } from './index'
import * as api from '../lib/api'

export interface VersionsSlice {
  nodeVersions: NodeVersion[]
  versionsLoading: boolean
  loadNodeVersions: (nodeId: string) => Promise<void>
  restoreVersion: (versionId: string) => Promise<void>
}

export const createVersionsSlice: StateCreator<AppStore, [], [], VersionsSlice> = (set, get) => ({
  nodeVersions: [],
  versionsLoading: false,

  loadNodeVersions: async (nodeId: string) => {
    set({ versionsLoading: true })
    try {
      const versions = await api.getNodeVersions(nodeId)
      set({ nodeVersions: versions, versionsLoading: false })
    } catch {
      set({ nodeVersions: [], versionsLoading: false })
    }
  },

  restoreVersion: async (versionId: string) => {
    const { selectedNodeId } = get()
    await api.restoreNodeVersion(versionId)
    if (selectedNodeId) {
      await get().selectNode(selectedNodeId)
      await get().loadNodeVersions(selectedNodeId)
    }
  },
})
