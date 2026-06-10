import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store'

export function ClipperPanel() {
  const {
    selectedVaultId,
    clipperPort,
    clipperLoading,
    clipperAuthToken,
    loadClipperStatus,
    startClipper,
    stopClipper,
  } = useStore(
    useShallow((s) => ({
      selectedVaultId: s.selectedVaultId,
      clipperPort: s.clipperPort,
      clipperLoading: s.clipperLoading,
      clipperAuthToken: s.clipperAuthToken,
      loadClipperStatus: s.loadClipperStatus,
      startClipper: s.startClipper,
      stopClipper: s.stopClipper,
    })),
  )

  useEffect(() => {
    loadClipperStatus()
  }, [loadClipperStatus])

  if (!selectedVaultId) return null

  return (
    <div className="border-t p-2 space-y-1">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Web Clipper</p>
      {clipperPort ? (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">
            Server running on port <span className="text-accent-foreground">{clipperPort}</span>
          </p>
          {clipperAuthToken && (
            <p className="text-[10px] text-muted-foreground break-all">Token: {clipperAuthToken}</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Install the Chrome extension and set port to {clipperPort}.
          </p>
          <button
            className="w-full text-[10px] px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground"
            onClick={stopClipper}
          >
            Stop Clipper
          </button>
        </div>
      ) : (
        <button
          className="w-full text-[10px] px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground"
          onClick={startClipper}
          disabled={clipperLoading}
        >
          {clipperLoading ? 'Starting...' : 'Start Web Clipper'}
        </button>
      )}
    </div>
  )
}
