import { useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'

interface ObsidianImportProps {
  show: boolean
  onClose: () => void
}

export function ObsidianImport({ show, onClose }: ObsidianImportProps) {
  const { importObsidian, importResult } = useStore()
  const [obsidianPath, setObsidianPath] = useState('')

  if (!show) return null

  return (
    <div className="p-2 border-b space-y-1">
          <input
            className="w-full px-2 py-1 text-xs border rounded bg-background"
            placeholder="Obsidian vault path..."
            value={obsidianPath}
            onChange={(e) => setObsidianPath(e.target.value)}
          />
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="text-xs h-7"
              onClick={async () => {
                if (obsidianPath) {
                  await importObsidian(obsidianPath)
                  setObsidianPath('')
                  onClose()
                }
              }}
            >
              Import
            </Button>
            <Button size="sm" variant="ghost" className="text-xs h-7"
              onClick={() => onClose()}
            >
              Cancel
            </Button>
          </div>
          {importResult && (
            <p className="text-xs text-muted-foreground">
              Imported {importResult.nodes_created} notes, {importResult.links_created} links from {importResult.files_scanned} files
            </p>
          )}
      </div>
  )
}
