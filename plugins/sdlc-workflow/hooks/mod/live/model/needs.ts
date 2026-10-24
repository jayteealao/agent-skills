/**
 * "Needs you" (WF-LIVE-VIEWS-PLAN.md L5, 3.3–3.5): what a run waits on the
 * person for. Pure builders; each need names the section of the view that
 * holds its detail (V8) and the actions of section 6.
 */
import type { SdlcNeed } from '../../../../types'

/** What one stage artifact says, as the live module read it. */
export type RecordFact = {
  /** The path relative to the project root. */
  rel: string
  /** The absolute path, for "open record". */
  path: string
  stage: string
  slice: string | null
  /** The frontmatter `status`. */
  status: string | null
  /** The intent-bearing records in it (id and text). */
  intents: Array<{ id: string; text: string }>
}

/** The needs of the stage records: each intent-bearing decision, and each record that awaits input. */
export function recordNeedsOf(slug: string, records: readonly RecordFact[]): SdlcNeed[] {
  const needs: SdlcNeed[] = []
  for (const record of records) {
    const where = [record.stage, record.slice].filter(Boolean).join(' ')
    for (const intent of record.intents) {
      needs.push({
        id: `decision:${record.rel}:${intent.id}`,
        kind: 'decision',
        title: `${intent.id} · intent-bearing`,
        body: intent.text === '' ? `Recorded in ${where}.` : intent.text,
        section: 'decisions',
        tone: 'intent',
        actions: [
          { key: 'confirm', label: 'Confirm', kind: 'prompt', prompt: `Confirm decision ${intent.id} for ${slug}` },
          { key: 'open', label: 'Open record', kind: 'link', path: record.path },
          { key: 'later', label: 'Later', kind: 'dismiss' },
        ],
      })
    }
    if (record.status === 'awaiting-input') {
      needs.push({
        id: `awaiting:${record.rel}`,
        kind: 'awaiting',
        title: `${where} · awaiting input`,
        body: `${record.rel} waits for your answer.`,
        section: 'decisions',
        tone: 'attention',
        actions: [
          { key: 'open', label: 'Open record', kind: 'link', path: record.path },
          { key: 'answer', label: 'Answer', kind: 'fill', prompt: `/wf yolo ${slug}` },
        ],
      })
    }
  }
  return needs
}

/** One need per protected file that changed since the run started. */
export function protectedNeedsOf(root: string, changed: readonly string[]): SdlcNeed[] {
  return changed.map(file => ({
    id: `protected:${file}`,
    kind: 'protected' as const,
    title: `${file} changed`,
    body: 'A run agent wrote here. Nothing was reverted.',
    section: 'protected',
    tone: 'attention' as const,
    actions: [
      { key: 'diff', label: 'Show diff', kind: 'prompt' as const, prompt: `Show me the diff of ${file} since the yolo run started. Do not change the file.` },
      { key: 'open', label: 'Open', kind: 'link' as const, path: `${root}/${file}` },
      { key: 'keep', label: 'Keep', kind: 'dismiss' as const },
    ],
  }))
}

/** A stale driver: quiet past its own limit with an agent still out. */
export function staleNeedOf(slug: string, minutes: number): SdlcNeed {
  return {
    id: `stale:${slug}`,
    kind: 'stale',
    title: `No journal line for ${minutes} min`,
    body: 'The driver may have stopped. The status check says whether it is presumed dead.',
    section: 'liveness',
    tone: 'stop',
    actions: [
      { key: 'status', label: 'Check status', kind: 'prompt', prompt: `/wf status ${slug}` },
      { key: 'resume', label: 'Resume', kind: 'fill', prompt: `/wf yolo ${slug}` },
      { key: 'dismiss', label: 'Dismiss', kind: 'dismiss' },
    ],
  }
}

/** A build packet whose design waits on the person (`design/_lane.md`): the walk stops there until it is settled. */
export function designNeedOf(packetSlug: string, uxImpact: string): SdlcNeed {
  return {
    id: `design:${packetSlug}`,
    kind: 'design',
    title: `Design ${packetSlug}`,
    body: `ux-impact ${uxImpact}: the design is not settled.`,
    section: 'packets',
    tone: 'attention',
    actions: [
      { key: 'design', label: 'Design it', kind: 'fill', prompt: `/wf design ${packetSlug}` },
      { key: 'later', label: 'Later', kind: 'dismiss' },
    ],
  }
}

/** A packet over the 40-decision cap: the campaign refuses it until it is split. */
export function splitNeedOf(brainstorm: string, key: string, size: number): SdlcNeed {
  return {
    id: `split:${key}`,
    kind: 'split',
    title: `${key}: about ${size} slices`,
    body: 'Above 14: propose a split where the first part is complete. The person may keep it whole.',
    section: 'packets',
    tone: 'attention',
    actions: [
      { key: 'split', label: 'Split it', kind: 'fill', prompt: `/wf intake brainstorm ${brainstorm} split ${key} ` },
      { key: 'later', label: 'Later', kind: 'dismiss' },
    ],
  }
}

/** The needs the person has not kept, put off or dismissed. */
export function openNeedsOf(needs: readonly SdlcNeed[], dismissed: readonly string[]): SdlcNeed[] {
  const gone = new Set(dismissed)
  const seen = new Set<string>()
  return needs.filter(need => {
    if (gone.has(need.id) || seen.has(need.id)) return false
    seen.add(need.id)
    return true
  })
}
