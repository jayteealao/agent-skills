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
export function staleNeedOf(slug: string, kind: 'yolo' | 'campaign', minutes: number): SdlcNeed {
  return {
    id: `stale:${slug}`,
    kind: 'stale',
    title: `No journal line for ${minutes} min`,
    body: 'The driver may have stopped. The status check says whether it is presumed dead.',
    section: 'liveness',
    tone: 'stop',
    actions: [
      { key: 'status', label: 'Check status', kind: 'prompt', prompt: `/wf status ${slug}` },
      { key: 'resume', label: 'Resume', kind: 'fill', prompt: `/wf ${kind} ${slug}` },
      { key: 'dismiss', label: 'Dismiss', kind: 'dismiss' },
    ],
  }
}

/** A campaign slug that waits for its prepare. */
export function prepareNeedOf(brainstorm: string, unitKey: string, slug: string, wave: number | null): SdlcNeed {
  return {
    id: `prepare:${unitKey}`,
    kind: 'prepare',
    title: `Prepare ${slug}`,
    body: wave === null ? 'It waits for its prepare.' : `Wave ${wave} waits for its prepare.`,
    section: 'waves',
    tone: 'attention',
    actions: [
      { key: 'prepare', label: 'Prepare', kind: 'prompt', prompt: `/wf campaign ${brainstorm} prepare ${unitKey}` },
      { key: 'later', label: 'Later', kind: 'dismiss' },
    ],
  }
}

/** A question the campaign asked the person. */
export function askedNeedOf(brainstorm: string, id: string, text: string, wave: number | null): SdlcNeed {
  return {
    id: `asked:${id}`,
    kind: 'asked',
    title: wave === null ? `Question ${id}` : `Wave ${wave} · question ${id}`,
    body: text,
    section: 'waves',
    tone: 'attention',
    actions: [
      { key: 'answer', label: 'Answer', kind: 'fill', prompt: `/wf campaign ${brainstorm} answer ${id}: ` },
      { key: 'later', label: 'Later', kind: 'dismiss' },
    ],
  }
}

/** A task, investigate or discover packet that the campaign leaves to the person. */
export function outsideNeedOf(brainstorm: string, key: string, slug: string, form: string, title: string): SdlcNeed {
  return {
    id: `outside:${key}`,
    kind: 'outside',
    title: `${form} · ${slug}`,
    body: title,
    section: 'waves',
    tone: 'plain',
    actions: [
      { key: 'start', label: 'Start', kind: 'fill', prompt: `/wf intake .ai/workflows/${brainstorm}/work/${slug}.md` },
      { key: 'later', label: 'Later', kind: 'dismiss' },
    ],
  }
}

/** A packet over the 40-decision cap: the campaign refuses it until it is split. */
export function splitNeedOf(brainstorm: string, key: string, size: number): SdlcNeed {
  return {
    id: `split:${key}`,
    kind: 'split',
    title: `${key} carries ${size} decisions`,
    body: 'Over 40: split it before a campaign runs it.',
    section: 'packets',
    tone: 'stop',
    actions: [
      { key: 'split', label: 'Split it', kind: 'fill', prompt: `/wf brainstorm ${brainstorm} split ${key} ` },
      { key: 'later', label: 'Later', kind: 'dismiss' },
    ],
  }
}

/** A paused campaign: the reset time, and resume now. */
export function pausedNeedOf(brainstorm: string, until: string | null, reason: string | null): SdlcNeed {
  return {
    id: `paused:${brainstorm}:${until ?? 'open'}`,
    kind: 'paused',
    title: until === null ? 'Paused' : `Paused until ${until.slice(11, 16)}`,
    body: reason ?? 'The usage window is over the pause line.',
    section: 'usage',
    tone: 'stop',
    actions: [{ key: 'resume', label: 'Resume now', kind: 'prompt', prompt: `/wf campaign ${brainstorm}` }],
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
