import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store'

export function VersionsPanel() {
  const { selectedNodeId, nodeVersions, versionsLoading, restoreVersion } = useStore(
    useShallow((s) => ({
      selectedNodeId: s.selectedNodeId,
      nodeVersions: s.nodeVersions,
      versionsLoading: s.versionsLoading,
      restoreVersion: s.restoreVersion,
    })),
  )

  if (!selectedNodeId) return null

  return (
    <div className="border-t p-2 space-y-1">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Version History</p>
      {versionsLoading ? (
        <p className="text-[10px] text-muted-foreground px-1">Loading...</p>
      ) : nodeVersions.length > 0 ? (
        <div className="max-h-32 overflow-y-auto space-y-0.5">
          {nodeVersions.map((v) => (
            <div key={v.id} className="flex items-center gap-1 group px-1 py-0.5 rounded hover:bg-muted">
              <span className="text-[10px] text-muted-foreground shrink-0 w-6">v{v.version_number}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {v.created_at ? new Date(v.created_at).toLocaleDateString() : 'N/A'}
              </span>
              <span className="text-[10px] text-muted-foreground">{v.word_count}w</span>
              <button
                className="text-[10px] ml-auto text-muted-foreground hover:text-accent-foreground opacity-0 group-hover:opacity-100"
                onClick={() => restoreVersion(v.id)}
                title="Restore this version"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground px-1">No version history available</p>
      )}
    </div>
  )
}
