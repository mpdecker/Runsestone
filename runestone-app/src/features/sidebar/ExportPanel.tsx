import { useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Download, FileText, FolderOutput, Loader2 } from 'lucide-react'
import { exportNodeToMarkdown, exportVaultToMarkdown } from '@/lib/api'

export function ExportPanel() {
  const selectedVaultId = useStore((s) => s.selectedVaultId)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const showExport = useStore((s) => (s as unknown as { showExport: boolean }).showExport)
  const toggleExport = useStore((s) => (s as unknown as { toggleExport: () => void }).toggleExport)

  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  if (!showExport) return null

  return (
    <div className="border-t">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="font-medium text-xs flex items-center gap-1">
          <Download className="w-3 h-3" />
          Export
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={toggleExport}
          title="Close export panel"
          aria-label="Close export panel"
        >
          <span className="text-[10px]">&times;</span>
        </Button>
      </div>

      <div className="px-3 pb-2 space-y-2">
        {selectedNodeId && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-[10px] h-7 justify-start gap-1"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              setResult(null)
              try {
                const path = await exportNodeToMarkdown(selectedNodeId)
                setResult(`Exported: ${path}`)
              } catch (e) {
                setResult(`Error: ${e}`)
              }
              setExporting(false)
            }}
          >
            {exporting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <FileText className="w-3 h-3" />
            )}
            Export Current Node
          </Button>
        )}

        {selectedVaultId && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-[10px] h-7 justify-start gap-1"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              setResult(null)
              try {
                const paths = await exportVaultToMarkdown(selectedVaultId, '')
                setResult(`Exported ${paths.length} files`)
              } catch (e) {
                setResult(`Error: ${e}`)
              }
              setExporting(false)
            }}
          >
            {exporting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <FolderOutput className="w-3 h-3" />
            )}
            Export Entire Vault
          </Button>
        )}

        {!selectedVaultId && (
          <p className="text-[10px] text-muted-foreground">
            Select a vault to enable export.
          </p>
        )}

        {result && (
          <div
            className={`text-[10px] rounded p-1.5 ${result.startsWith('Error') ? 'bg-destructive/10 text-destructive' : 'bg-muted/30'}`}
          >
            {result}
          </div>
        )}
      </div>
    </div>
  )
}
