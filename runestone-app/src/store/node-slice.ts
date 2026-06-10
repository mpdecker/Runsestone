import type { StateCreator } from 'zustand'
import type { Node, NodeListItem } from '../lib/types'
import type { AppStore } from './index'
import * as api from '../lib/api'

export interface NodeSlice {
  nodes: NodeListItem[]
  selectedNodeId: string | null
  currentNode: Node | null
  secondaryNode: Node | null
  isEditorDirty: boolean
  isSaving: boolean
  wikiLinkPreviews: Record<string, string>
  loadNodes: () => Promise<void>
  loadNodesByTag: (tag: string) => Promise<void>
  scanVault: () => Promise<void>
  selectNode: (nodeId: string) => Promise<void>
  selectSecondaryNode: (nodeId: string) => Promise<void>
  createNode: (title: string) => Promise<void>
  updateNodeContent: (content: string) => void
  saveNode: () => Promise<void>
  deleteNode: (id: string) => Promise<void>
  fetchWikiLinkPreview: (nodeId: string) => Promise<string | null>
}

export const createNodeSlice: StateCreator<AppStore, [], [], NodeSlice> = (set, get) => ({
  nodes: [],
  selectedNodeId: null,
  currentNode: null,
  secondaryNode: null,
  isEditorDirty: false,
  isSaving: false,
  wikiLinkPreviews: {},

  loadNodes: async () => {
    const { selectedVaultId } = get()
    if (!selectedVaultId) return
    set({ isLoading: true, error: null })
    try {
      const nodes = await api.listNodes(selectedVaultId)
      set({ nodes, isLoading: false })
    } catch (e) {
      set({ error: `Failed to load nodes: ${e}`, isLoading: false })
    }
  },

  loadNodesByTag: async (tag: string) => {
    const { selectedVaultId } = get()
    if (!selectedVaultId) return
    set({ isLoading: true, error: null })
    try {
      const nodes = await api.getNodesByTag(selectedVaultId, tag)
      set({ nodes, isLoading: false })
    } catch (e) {
      set({ error: `Failed to load nodes by tag: ${e}`, isLoading: false })
    }
  },

  scanVault: async () => {
    const { selectedVaultId } = get()
    if (!selectedVaultId) return
    set({ isLoading: true, error: null })
    try {
      await api.scanVault(selectedVaultId)
      await get().loadNodes()
      await get().loadGraphData()
    } catch (e) {
      set({ error: `Failed to scan vault: ${e}`, isLoading: false })
    }
  },

  selectNode: async (nodeId: string) => {
    set({ isLoading: true, error: null, isEditorDirty: false, showBacklinks: false, backlinks: [] })
    try {
      const node = await api.getNode(nodeId)
      set({ selectedNodeId: nodeId, currentNode: node, isLoading: false })
      get().addTab?.(nodeId, node.title)
      get().loadNodeTags?.(nodeId)
      get().loadNodeProperties?.(nodeId)
      get().loadNodeVersions?.(nodeId)
    } catch (e) {
      set({ error: `Failed to load node: ${e}`, isLoading: false })
    }
  },

  selectSecondaryNode: async (nodeId: string) => {
    try {
      const node = await api.getNode(nodeId)
      set({ secondaryNode: node, secondaryTabId: nodeId })
      get().loadNodeTags?.(nodeId)
    } catch (e) {
      console.error('Failed to load secondary node:', e)
    }
  },

  createNode: async (title: string) => {
    const { selectedVaultId } = get()
    if (!selectedVaultId) return
    set({ isLoading: true, error: null })
    try {
      const node = await api.createNode({
        vault_id: selectedVaultId,
        title,
        content: '',
      })
      await get().loadNodes()
      await get().loadGraphData()
      set({ selectedNodeId: node.id, currentNode: node, isLoading: false, isEditorDirty: false })
    } catch (e) {
      set({ error: `Failed to create node: ${e}`, isLoading: false })
    }
  },

  updateNodeContent: (content: string) => {
    const { currentNode } = get()
    if (!currentNode) return
    set({ currentNode: { ...currentNode, content }, isEditorDirty: true })
  },

  saveNode: async () => {
    const { currentNode } = get()
    if (!currentNode) return
    set({ isSaving: true, error: null })
    try {
      const updated = await api.updateNode({
        id: currentNode.id,
        content: currentNode.content,
      })
      set({ currentNode: updated, isSaving: false, isEditorDirty: false })
    } catch (e) {
      set({ error: `Failed to save node: ${e}`, isSaving: false })
    }
  },

  deleteNode: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      await api.deleteNode(id)
      set({ selectedNodeId: null, currentNode: null, isLoading: false, isEditorDirty: false })
      await get().loadNodes()
      await get().loadGraphData()
    } catch (e) {
      set({ error: `Failed to delete node: ${e}`, isLoading: false })
    }
  },

  fetchWikiLinkPreview: async (nodeId: string) => {
    const cached = get().wikiLinkPreviews[nodeId]
    if (cached) return cached
    try {
      const fullNode = await api.getNode(nodeId)
      const snippet = fullNode.content
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 250)
      set({
        wikiLinkPreviews: { ...get().wikiLinkPreviews, [nodeId]: snippet },
      })
      return snippet
    } catch {
      return null
    }
  },
})
