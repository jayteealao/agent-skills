// The contrast check the design tests share: every word a tree draws on the
// light Desktop app has a raw colour, and that colour reads at 4.5:1 or better
// on the ground beneath it (WCAG AA).
import { contrastOf } from '../styles/tokens.ts'

/** The light ground of the Desktop app: what style A draws on, since it paints none. */
export const APP_GROUND = '#faf9f5'

/** The ratio every word must reach on its ground (WCAG AA, body text). */
export const MIN_CONTRAST = 4.5

type Word = { text: string; color: unknown; ground: string }

/**
 * Every run of words in a drawn tree with its colour and the ground it sits
 * on: the nearest `backgroundColor` on it or around it, else the app's ground.
 * A Text inside a Text takes the outer colour unless it names its own. A
 * Button is the app's own control and carries no colour, so the walk skips it.
 */
function wordsOf(node: unknown, ground: string, color: unknown, out: Word[]): Word[] {
  if (typeof node === 'string') {
    if (node.trim() !== '') out.push({ text: node, color, ground })
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) wordsOf(child, ground, color, out)
    return out
  }
  if (node && typeof node === 'object') {
    const record = node as { type?: string; props?: Record<string, unknown>; children?: unknown }
    if (record.type === 'Button') return out
    const props = record.props ?? {}
    const own = typeof props['backgroundColor'] === 'string' ? (props['backgroundColor'] as string) : ground
    const ink = record.type === 'Text' && props['color'] !== undefined ? props['color'] : color
    wordsOf(record.children ?? props['children'] ?? [], own, ink, out)
  }
  return out
}

/**
 * The words of a tree whose colour is missing, not a raw colour, or under
 * 4.5:1 on its ground. A tree with no words is a fault too: the walk found
 * nothing to check. `appGround` is the surface's own ground under a word no
 * `backgroundColor` covers; null is a surface whose ground is unknown (a
 * terminal, light or dark), where such a word is a fault: a fixed ink colour
 * needs a ground of its own.
 */
export function contrastFaults(tree: unknown, appGround: string | null = APP_GROUND): string[] {
  const words = wordsOf(tree, appGround ?? '', undefined, [])
  if (words.length === 0) return ['no words drawn']
  return words
    .filter(word => typeof word.color !== 'string' || !/^#[0-9a-f]{6}$/iu.test(word.color) || word.ground === '' || contrastOf(word.color, word.ground) < MIN_CONTRAST)
    .map(word => `${JSON.stringify(word.text)} ${String(word.color)} on ${word.ground === '' ? 'no ground' : word.ground}`)
}
