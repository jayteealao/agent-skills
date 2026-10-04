/**
 * Glyph geometry for the live views (WF-LIVE-VIEWS-PLAN.md 5.1, 8.2): the
 * 5×7 dot-matrix font of style D, its braille packing for the terminal, the
 * waveform of the heartbeat, the bars and the tick ring.
 *
 * Pure: strings in, strings out. A braille cell holds 2×4 dots, so a 5×7
 * glyph with one column of spacing and one row of padding takes 3×2 cells.
 */

/** Each glyph is seven rows of five characters; `#` is a lit dot. */
const FONT: Record<string, readonly string[]> = {
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  '],
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
  D: ['###  ', '#  # ', '#   #', '#   #', '#   #', '#  # ', '###  '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ####'],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: [' ### ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  J: ['  ###', '   # ', '   # ', '   # ', '   # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'],
  N: ['#   #', '#   #', '##  #', '# # #', '#  ##', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '# # #', ' # # '],
  X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
  '%': ['##   ', '##  #', '   # ', '  #  ', ' #   ', '#  ##', '   ##'],
  '/': ['     ', '    #', '   # ', '  #  ', ' #   ', '#    ', '     '],
  ':': ['     ', ' ##  ', ' ##  ', '     ', ' ##  ', ' ##  ', '     '],
  '.': ['     ', '     ', '     ', '     ', '     ', ' ##  ', ' ##  '],
  '-': ['     ', '     ', '     ', '#####', '     ', '     ', '     '],
  '+': ['     ', '  #  ', '  #  ', '#####', '  #  ', '  #  ', '     '],
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
}

export const GLYPH_WIDTH = 5
export const GLYPH_HEIGHT = 7

/** The characters the font draws; any other character draws as a space. */
export function hasGlyph(char: string): boolean {
  return char.toUpperCase() in FONT
}

/** The dot rows of a text: seven strings, one column of space between glyphs. */
export function dotRowsOf(text: string): string[] {
  const glyphs = [...text.toUpperCase()].map(char => FONT[char] ?? (FONT[' '] as readonly string[]))
  const rows: string[] = []
  for (let y = 0; y < GLYPH_HEIGHT; y += 1) rows.push(glyphs.map(glyph => glyph[y] ?? '     ').join(' '))
  return rows
}

/** The bit of each dot of a braille cell, by [column][row]. */
const BRAILLE_BITS: readonly (readonly number[])[] = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]

/**
 * Packs a grid of dots (`#` lit) into braille lines: 2 columns and 4 rows of
 * dots per character, so a 5×7 glyph takes 3×2 cells.
 */
export function brailleOf(rows: readonly string[]): string[] {
  const width = Math.max(0, ...rows.map(row => row.length))
  const lines: string[] = []
  for (let top = 0; top < rows.length; top += 4) {
    let line = ''
    for (let left = 0; left < width; left += 2) {
      let bits = 0
      for (let dx = 0; dx < 2; dx += 1) {
        for (let dy = 0; dy < 4; dy += 1) {
          if (rows[top + dy]?.[left + dx] === '#') bits |= (BRAILLE_BITS[dx] as readonly number[])[dy] as number
        }
      }
      line += String.fromCharCode(0x2800 + bits)
    }
    lines.push(line)
  }
  return lines
}

/** A text in dot-matrix glyphs as braille lines (two lines tall). */
export function dotTextOf(text: string): string[] {
  return brailleOf(dotRowsOf(text))
}

/**
 * The heartbeat waveform as one braille line `width` cells wide: one spike per
 * journal line inside the window, newest at the right; flat when quiet.
 *
 * @param beats line times in ms
 * @param now the moment drawn
 * @param windowMs how much time the line spans
 */
export function waveOf(beats: readonly number[], now: number, windowMs: number, width: number): string {
  const columns = Math.max(1, width) * 2
  const heights = new Array<number>(columns).fill(0)
  for (const at of beats) {
    const age = now - at
    if (age < 0 || age > windowMs) continue
    const column = columns - 1 - Math.floor((age / windowMs) * (columns - 1))
    // A spike: full height on its column, half on its neighbours.
    heights[column] = 4
    if (column > 0) heights[column - 1] = Math.max(heights[column - 1] ?? 0, 2)
    if (column < columns - 1) heights[column + 1] = Math.max(heights[column + 1] ?? 0, 2)
  }
  const rows = ['', '', '', '']
  for (let x = 0; x < columns; x += 1) {
    const h = heights[x] ?? 0
    for (let y = 0; y < 4; y += 1) {
      // The baseline is the bottom row; a spike lights upward from it.
      const lit = y === 3 || 3 - y < h
      rows[y] += lit ? '#' : ' '
    }
  }
  return brailleOf(rows)[0] ?? ''
}

/** A bar of `width` cells filled to `percent`, with marks at the given percents. */
export function barOf(percent: number | null, width: number, marks: readonly number[] = [], glyphs: { fill: string; empty: string; mark: string } = { fill: '█', empty: '░', mark: '│' }): string {
  const cells = Math.max(1, width)
  const filled = percent === null ? 0 : Math.round((Math.max(0, Math.min(100, percent)) / 100) * cells)
  let bar = ''
  for (let i = 0; i < cells; i += 1) {
    const isMark = marks.some(mark => Math.round((mark / 100) * cells) === i && i >= filled)
    bar += i < filled ? glyphs.fill : isMark ? glyphs.mark : glyphs.empty
  }
  return bar
}

/** A striped bar for style E: `▌` cells filled, `·` empty, `┊` at the marks. */
export function stripedBarOf(percent: number | null, width: number, marks: readonly number[]): string {
  return barOf(percent, width, marks, { fill: '▌', empty: '·', mark: '┊' })
}

/**
 * The tick ring of style D as an SVG document: `ticks` ticks around a circle,
 * the used share lit, the mark ticks in the accent colour.
 */
export function tickRingSvg(options: { percent: number | null; marks: readonly number[]; size: number; lit: string; dim: string; accent: string; label: string; animate: boolean }): string {
  const { percent, marks, size, lit, dim, accent, label, animate } = options
  const ticks = 60
  const centre = size / 2
  const outer = size / 2 - 2
  const inner = outer - Math.max(4, size / 10)
  const used = percent === null ? -1 : Math.round((Math.max(0, Math.min(100, percent)) / 100) * ticks)
  const markTicks = new Set(marks.map(mark => Math.round((mark / 100) * ticks)))
  const lines: string[] = []
  for (let i = 0; i < ticks; i += 1) {
    const angle = (i / ticks) * Math.PI * 2 - Math.PI / 2
    const x1 = (centre + Math.cos(angle) * inner).toFixed(1)
    const y1 = (centre + Math.sin(angle) * inner).toFixed(1)
    const x2 = (centre + Math.cos(angle) * outer).toFixed(1)
    const y2 = (centre + Math.sin(angle) * outer).toFixed(1)
    const colour = markTicks.has(i) ? accent : i < used ? lit : dim
    const fade = animate && i < used ? `<animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="${((i / ticks) * 0.26).toFixed(2)}s" fill="freeze"/>` : ''
    lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="2" stroke-linecap="round">${fade}</line>`)
  }
  const text = percent === null ? '—' : `${Math.round(percent)}%`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img"><title>${escapeXml(label)}</title>${lines.join('')}<text x="${centre}" y="${centre + 5}" text-anchor="middle" font-family="monospace" font-size="${Math.round(size / 5)}" fill="${lit}">${text}</text></svg>`
}

/**
 * A dot-matrix word as an SVG document (style D on the desktop): one circle per
 * dot, lit dots in `lit`, dark dots in `dim`; with `animate`, each lit dot
 * fades in after a delay of its own, at most 260 ms (the shimmer of 5.6).
 */
export function dotWordSvg(options: { text: string; dot: number; lit: string; dim: string; label: string; animate: boolean }): string {
  const { text, dot, lit, dim, label, animate } = options
  const rows = dotRowsOf(text)
  const width = (rows[0]?.length ?? 0) * dot
  const height = rows.length * dot
  const circles: string[] = []
  rows.forEach((row, y) => {
    ;[...row].forEach((cell, x) => {
      const isLit = cell === '#'
      // A fixed spread of delays from the position, so a redraw of the same word draws the same.
      const delay = (((x * 7 + y * 13) % 27) / 100).toFixed(2)
      const fade = animate && isLit ? `<animate attributeName="opacity" from="0.15" to="1" dur="0.4s" begin="${delay}s" fill="freeze"/>` : ''
      circles.push(`<circle cx="${x * dot + dot / 2}" cy="${y * dot + dot / 2}" r="${(dot * 0.38).toFixed(1)}" fill="${isLit ? lit : dim}">${fade}</circle>`)
    })
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeXml(label)}</title>${circles.join('')}</svg>`
}

function escapeXml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
}

/** Minutes and seconds as `4 s`, `11 min`, `1 h 05`. */
export function ageText(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

/** A percent as `76 %`, or `—` when unknown (U3). */
export function percentText(percent: number | null): string {
  return percent === null || !Number.isFinite(percent) ? '—' : `${Math.round(percent)} %`
}

/** A clock time `16:40` from an ISO time, or `—`. */
export function clockOf(iso: string | null): string {
  if (iso === null) return '—'
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return '—'
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
