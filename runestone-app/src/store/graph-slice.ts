import type { StateCreator } from 'zustand'
import type { GraphData, Backlink, GraphQueryResponse } from '../lib/types'
import type { AppStore } from './index'
import * as api from '../lib/api'

export type GraphViewMode = 'global' | 'local'

export interface GraphSlice {
  graphData: GraphData | null
  graphError: string | null
  graphLoading: boolean
  graphViewMode: GraphViewMode
  graphDepth: number
  backlinks: Backlink[]
  outgoingLinks: Backlink[]
  showBacklinks: boolean
  showOutgoingLinks: boolean
  graphQueryAnswer: string | null
  graphQueryCypher: string | null
  graphQueryResults: GraphQueryResponse['results'] | null
  graphQueryLoading: boolean
  showGraphQuery: boolean
  loadGraphData: (tag?: string) => Promise<void>
  loadLocalGraph: (nodeId: string, depth?: number) => Promise<void>
  setGraphViewMode: (mode: GraphViewMode) => void
  setGraphDepth: (depth: number) => void
  loadBacklinks: (nodeId: string) => Promise<void>
  toggleBacklinks: () => void
  loadOutgoingLinks: (nodeId: string) => Promise<void>
  toggleOutgoingLinks: () => void
  parseWikiLinks: (nodeId: string) => Promise<void>
  sendGraphQuery: (question: string) => Promise<void>
  toggleGraphQuery: () => void
}

export const createGraphSlice: StateCreator<AppStore, [], [], GraphSlice> = (set, get) => ({
  graphData: null,
  graphError: null,
  graphLoading: false,
  graphViewMode: 'global',
  graphDepth: 1,
  backlinks: [],
  outgoingLinks: [],
  showBacklinks: false,
  showOutgoingLinks: false,
  graphQueryAnswer: null,
  graphQueryCypher: null,
  graphQueryResults: null,
  graphQueryLoading: false,
  showGraphQuery: false,

  loadGraphData: async (tag?: string) => {
    const { selectedVaultId } = get()
    if (!selectedVaultId) return
    try {
      const options = tag ? { tag } : undefined
      const data = await api.getGraphData(selectedVaultId, options)
      set({ graphData: data })
    } catch (e) {
      console.error('Failed to load graph data:', e)
    }
  },

  loadLocalGraph: async (nodeId: string, depth?: number) => {
    const d = depth ?? get().graphDepth
    set({ graphViewMode: 'local', graphLoading: true, graphDepth: d, graphError: null })
    try {
      const data = await api.getLocalGraph(nodeId, d)
      set({ graphData: data, graphLoading: false })
    } catch (e) {
      set({ graphError: `Failed to load local graph: ${e}`, graphLoading: false })
    }
  },

  setGraphViewMode: (mode: GraphViewMode) => {
    set({ graphViewMode: mode })
    if (mode === 'global') {
      get().loadGraphData()
    }
  },

  setGraphDepth: (depth: number) => {
    set({ graphDepth: depth })
  },

  loadBacklinks: async (nodeId: string) => {
    try {
      const links = await api.getBacklinks(nodeId)
      set({ backlinks: links })
    } catch (e) {
      console.error('Failed to load backlinks:', e)
    }
  },

  toggleBacklinks: () => {
    const { showBacklinks, selectedNodeId } = get()
    if (!showBacklinks && selectedNodeId) {
      get().loadBacklinks(selectedNodeId)
    }
    set({ showBacklinks: !showBacklinks })
  },

  loadOutgoingLinks: async (nodeId: string) => {
    try {
      const links = await api.getOutgoingLinks(nodeId)
      set({ outgoingLinks: links })
    } catch (e) {
      console.error('Failed to load outgoing links:', e)
    }
  },

  toggleOutgoingLinks: () => {
    const { showOutgoingLinks, selectedNodeId } = get()
    if (!showOutgoingLinks && selectedNodeId) {
      get().loadOutgoingLinks(selectedNodeId)
    }
    set({ showOutgoingLinks: !showOutgoingLinks })
  },

  parseWikiLinks: async (nodeId: string) => {
    try {
      await api.parseWikiLinks(nodeId)
      await get().loadGraphData()
    } catch (e) {
      set({ graphError: `Failed to parse wiki links: ${e}` })
    }
  },

  sendGraphQuery: async (question: string) => {
    const { selectedVaultId } = get()
    if (!selectedVaultId) return
    set({ graphQueryLoading: true, graphQueryAnswer: null, graphQueryCypher: null, graphQueryResults: null, graphError: null })
    try {
      const response = await api.graphQuery({ vault_id: selectedVaultId, question })
      set({
        graphQueryAnswer: response.answer,
        graphQueryCypher: response.cypher,
        graphQueryResults: response.results,
        graphQueryLoading: false,
      })
    } catch (e) {
      set({ graphError: `Graph query failed: ${e}`, graphQueryLoading: false })
    }
  },

  toggleGraphQuery: () => {
    set((s) => ({ showGraphQuery: !s.showGraphQuery }))
  },
})
