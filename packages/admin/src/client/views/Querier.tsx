import React from 'react'
import {useLocalStorage, useMeasure} from 'react-use'
import {z} from 'zod'
import {SVGProps} from '../page'
import {ResultsViewer} from '../results/grid'
import {useSettings} from '../settings'
import {SqlCodeMirror} from '../sql-codemirror'
import {trpc} from '../utils/trpc'
import {Button} from '@/components/ui/button'
import {Progress} from '@/components/ui/progress'
import {PostgreSQLJson} from '@/packlets/autocomplete/suggest'

const AutoProgress = ({complete = false, estimate = 1000}) => {
  const [progress, setProgress] = React.useState(0)
  React.useEffect(() => {
    if (complete) {
      setProgress(100)
      return
    }

    const timeout = setTimeout(() => {
      console.log(progress, 100 * (20 / estimate), {progress, estimate})
      setProgress(Math.min(99, progress + 100 * (20 / estimate)))
    }, 20)
    return () => clearTimeout(timeout)
  }, [progress, setProgress, estimate, complete])

  return <pre>{JSON.stringify({progress, estimate, complete})}</pre>
  return <Progress value={progress} />
}

const noErrors = [] as []

const PGErrorLike = z.object({
  code: z.string(),
  position: z.string(),
})
const PGErrorWrapper = z.object({
  error: PGErrorLike,
})

export const Querier = () => {
  const [ref, mes] = useMeasure<HTMLDivElement>()
  const [storedCode = '', setStoredCode] = useLocalStorage(`sql-editor-code:0.0.1`, `show search_path`)
  const [wrapText, setWrapText] = useLocalStorage(`sql-editor-wrap-text:0.0.1`, true)
  const settings = useSettings()
  const execute = trpc.executeSql.useMutation({
    onSuccess: data => {
      const newErrors = data.results.flatMap(r => {
        if (r.error && typeof r.position === 'number') {
          return [{message: r.error.message, position: r.position + 1}]
        }

        const parsed = PGErrorWrapper.safeParse(r.error?.cause)
        if (parsed.success) {
          const pgError = parsed.data.error
          return [{message: r.error?.message || pgError.code, position: Number(pgError.position) - 1}]
        }

        return []
      })
      setErrors(newErrors.length > 0 ? newErrors : noErrors)
    },
  })
  const aiMutation = trpc.aiQuery.useMutation({
    onSuccess: (data, variables) => {
      setStoredCode(
        [
          `-- Prompt: ${variables.prompt}`,
          data.query, //
        ].join('\n\n'),
      )
    },
  })

  const [errorMap, setErrorMap] = React.useState(
    {} as Record<string, {time: number; errs: Array<{position: number; message: string}>}>,
  )

  const errors = React.useMemo(() => errorMap[storedCode]?.errs || [], [errorMap, storedCode])
  const setErrors = React.useCallback(
    (errs: (typeof errorMap)[string]['errs']) => {
      const entries = Object.entries(errorMap)
        .concat([[storedCode, {time: Date.now(), errs}]])
        .slice(-100) // don't hang on to the past
      setErrorMap(Object.fromEntries(entries))
    },
    [errorMap, storedCode],
  )

  return (
    <div className="p-4 dark:bg-gray-900 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-100 dark:text-gray-100">SQL Editor</h3>
        <div className="flex gap-1">
          <Button
            variant="outline"
            title="AI"
            disabled={aiMutation.isLoading}
            onClick={() => {
              const aiPrompt = prompt('Enter a prompt', aiMutation.variables?.prompt || '')
              if (!aiPrompt) return
              aiMutation.mutate({
                prompt: aiPrompt,
                includeSchemas: settings.includeSchemas,
                excludeSchemas: settings.excludeSchemas,
              })
            }}
          >
            🧙‍♂️
          </Button>
          <Button variant="outline" title="Run" onClick={() => execute.mutate({query: storedCode})}>
            <PlayIcon className="w-4 h-4 text-gray-100 dark:text-gray-100" />
          </Button>
        </div>
      </div>
      {aiMutation.isLoading && <AutoProgress complete={aiMutation.isSuccess} estimate={3000} />}
      <div className="flex flex-col gap-4 h-[90%] relative">
        <div ref={ref} className="h-1/2 border rounded-lg overflow-scroll relative bg-gray-800">
          <SqlCodeMirror
            height={mes.height + 'px'}
            code={storedCode}
            errors={errors}
            onChange={setStoredCode}
            onExecute={query => execute.mutate({query})}
          />
          <div className="absolute bottom-2 right-2">
            <Button onClick={() => setWrapText(old => !old)} className="text-gray-100" size="sm" variant="ghost">
              <RemoveFormattingIcon className="w-4 h-4 text-gray-100" />
            </Button>
            <Button className="text-gray-100" size="sm" variant="ghost">
              <DownloadIcon className="w-4 h-4 text-gray-100" />
            </Button>
          </div>
        </div>
        <div className="h-1/2 border rounded-lg overflow-scroll bg-gray-800 text-gray-100">
          <div className="resultsContainer">
            {execute.data?.results.map((r, i, {length}) => {
              return (
                <details key={`${i}_${r.query}`} open={i === length - 1 || Boolean(r.error)}>
                  <summary>Query {r.query}</summary>
                  {r.error ? (
                    <pre
                      style={{
                        width: '100%',
                        maxWidth: '80vw',
                        overflowX: 'scroll',
                        textWrap: wrapText ? 'wrap' : 'nowrap',
                      }}
                    >
                      Error:{'\n'}
                      {JSON.stringify(r, null, 2)}
                    </pre>
                  ) : (
                    <>
                      <ResultsViewer values={r.result || []} />
                      <blockquote>
                        <details>
                          <summary>Statement</summary>
                          <pre>{r.original}</pre>
                        </details>
                      </blockquote>
                    </>
                  )}
                </details>
              )
            })}
            <span title="Squirrel" data-title-es="Ardilla" className="endMarker">
              🐿️
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RemoveFormattingIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7V4h16v3" />
      <path d="M5 20h6" />
      <path d="M13 4 8 20" />
      <path d="m15 15 5 5" />
      <path d="m20 15-5 5" />
    </svg>
  )
}

function DownloadIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}

function PlayIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}