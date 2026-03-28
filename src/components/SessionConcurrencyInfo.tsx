/**
 * @fileoverview Session Concurrency Info Component
 * @description Explains the single-action persona model and how to use Agency sessions for concurrency.
 */

import { Info, Lock, Unlock, MessageSquare, Users, Zap } from 'lucide-react';
import { useState } from 'react';

interface SessionConcurrencyInfoProps {
  sessionStatus: 'idle' | 'streaming' | 'error';
  className?: string;
}

/**
 * Information panel explaining session concurrency constraints and future capabilities.
 * 
 * **Current Behavior:**
 * - Each session processes one action at a time
 * - While streaming, new requests are queued/blocked
 * - Prevents conversation state conflicts
 * 
 * **Agency Concurrency:**
 * - Agency workflows spin up multiple persona seats concurrently
 * - Each seat streams independently with shared goals
 * - Ideal for parallel research, review, or specialized tasks
 * 
 * **Benefits:**
 * - Ask follow-up questions while previous request processes
 * - Multi-threaded discussions with same persona
 * - Parallel agency workflows without blocking
 */
export function SessionConcurrencyInfo({ sessionStatus, className = '' }: SessionConcurrencyInfoProps) {
  const [expanded, setExpanded] = useState(false);

  const isStreaming = sessionStatus === 'streaming';

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-slate-900/40 ${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Lock className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <Unlock className="h-3.5 w-3.5 text-emerald-500" />
          )}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {isStreaming ? 'Single Action Mode' : 'Ready for Requests'}
          </span>
        </div>
        <Info className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-white/10">
          {/* Current Constraint */}
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
              <Lock className="h-3 w-3" />
              Persona Sessions
            </h4>
            <p className="text-slate-600 dark:text-slate-400">
              Persona sessions intentionally run <strong>one action at a time</strong>. This keeps turn order predictable, avoids
              overlapping tool calls, and maintains a single conversational thread.
            </p>
          </div>

          {/* Agency concurrency */}
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
              <Unlock className="h-3 w-3" />
              Agency Concurrency
            </h4>
            <p className="mb-2 text-slate-600 dark:text-slate-400">
              Need parallel progress? Launch an <strong>Agency session</strong>. Each seat gets its own stream and the
              backend can stream seat updates independently. Perfect for research + review + writing teams. Today the
              workbench forwards agency requests through AgentOS and the Planning panel can inspect runtime-backed
              workflow snapshots, browse persisted runtime run records, restore manual checkpoints, and fork runtime
              snapshots into editable plans. Runtime-run checkpoints can also be restored directly from the inspector,
              but the workbench still does not expose graph-native authoring or true runtime resume controls.
            </p>
            <ul className="ml-4 list-disc space-y-1 text-slate-600 dark:text-slate-400">
              <li>
                <strong>Parallel seats:</strong> Assign unique personas to each role and let them work simultaneously.
              </li>
              <li>
                <strong>Live coordination:</strong> Agency updates show seat status, progress, and hand-offs in real time.
              </li>
              <li>
                <strong>Purpose-built for concurrency:</strong> Seat coordination is visible in the timeline even before the
                unified graph runtime is fully wired into the workbench.
              </li>
            </ul>
          </div>

          {/* Benefits */}
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
              <Zap className="h-3 w-3" />
              Benefits
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-3 w-3 flex-shrink-0 text-sky-500" />
                <span className="text-slate-600 dark:text-slate-400">
                  Persona conversations stay coherent—no overlapping answers or tool calls.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 h-3 w-3 flex-shrink-0 text-purple-500" />
                <span className="text-slate-600 dark:text-slate-400">
                  Agency sessions deliver real concurrency with independent seat streams.
                </span>
              </div>
            </div>
          </div>

          {/* Technical Details */}
          <div className="rounded border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-slate-950/60">
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
              Technical Details
            </p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Persona sessions serialize turns via <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">StreamingManager</code>. 
              Agency sessions now forward real agency requests through the backend into AgentOS, and the workbench can
              inspect mirrored runtime runs plus persisted checkpoints. It still is not driving native
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800"> GraphRuntime</code> pause/resume control directly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
