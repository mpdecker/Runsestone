import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Code, Loader2, Search, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'

export function GraphQueryPanel() {
  const {
    showGraphQuery,
    toggleGraphQuery,
    sendGraphQuery,
    graphQueryLoading,
    graphQueryAnswer,
    graphQueryCypher,
    graphQueryResults,
    graphError,
  } = useStore(
    useShallow((s) => ({
      showGraphQuery: s.showGraphQuery,
      toggleGraphQuery: s.toggleGraphQuery,
      sendGraphQuery: s.sendGraphQuery,
      graphQueryLoading: s.graphQueryLoading,
      graphQueryAnswer: s.graphQueryAnswer,
      graphQueryCypher: s.graphQueryCypher,
      graphQueryResults: s.graphQueryResults,
      graphError: s.graphError,
    })),
  )

  const [question, setQuestion] = useState('')
  const [showCypher, setShowCypher] = useState(false)
  const [showResults, setShowResults] = useState(false)

  if (!showGraphQuery) return null

  return (
    <div className="border-t">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="font-medium text-xs flex items-center gap-1">
          <Search className="w-3 h-3" />
          Graph Query
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={toggleGraphQuery}
          title="Close graph query panel"
          aria-label="Close graph query panel"
        >
          <span className="text-[10px]">&times;</span>
        </Button>
      </div>

      <div className="px-3 pb-2 space-y-2">
        <div className="flex gap-1">
          <input
            className="flex-1 px-2 py-1 text-xs border rounded bg-background"
            placeholder="Ask about your graph..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && question.trim()) {
                sendGraphQuery(question.trim())
                setQuestion('')
              }
            }}
            disabled={graphQueryLoading}
            aria-label="Graph query question"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            disabled={graphQueryLoading || !question.trim()}
            onClick={() => {
              if (question.trim()) {
                sendGraphQuery(question.trim())
                setQuestion('')
              }
            }}
            title="Ask graph query"
            aria-label="Submit graph query"
          >
            {graphQueryLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <span className="text-[10px]">&rarr;</span>
            )}
          </Button>
        </div>

        <div className="text-[10px] text-muted-foreground">
          Ask: "What concepts relate to note X?" "Show Entity nodes extracted from papers."
        </div>

        {graphQueryLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Thinking...
          </div>
        )}

        {graphError && (
          <div className="flex items-start gap-1 text-[10px] text-destructive bg-destructive/10 rounded p-2">
            <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
            <span>{graphError}</span>
          </div>
        )}

        {!graphQueryLoading && !graphError && graphQueryResults && graphQueryResults.length === 0 && graphQueryAnswer && (
          <div className="text-xs bg-muted/30 rounded p-2 max-h-32 overflow-y-auto">
            {graphQueryAnswer}
          </div>
        )}

        {graphQueryAnswer && graphQueryResults && graphQueryResults.length > 0 && (
          <div className="text-xs bg-muted/30 rounded p-2 max-h-32 overflow-y-auto">
            {graphQueryAnswer}
          </div>
        )}

        {graphQueryCypher && (
          <div>
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowCypher(!showCypher)}
              aria-expanded={showCypher}
            >
              {showCypher ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Code className="w-3 h-3" />
              Cypher
            </button>
            {showCypher && (
              <pre className="text-[10px] bg-muted/30 rounded p-2 mt-1 overflow-x-auto max-h-24">
                {graphQueryCypher}
              </pre>
            )}
          </div>
        )}

        {graphQueryResults && graphQueryResults.length > 0 && (
          <div>
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowResults(!showResults)}
              aria-expanded={showResults}
            >
              {showResults ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Results ({graphQueryResults.length})
            </button>
            {showResults && (
              <pre className="text-[10px] bg-muted/30 rounded p-2 mt-1 overflow-x-auto max-h-32">
                {JSON.stringify(
                  graphQueryResults.map((r) => r.values),
                  null,
                  2,
                )}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
