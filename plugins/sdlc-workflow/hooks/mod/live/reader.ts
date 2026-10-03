/**
 * The live views' reader (WF-LIVE-VIEWS-PLAN.md 5.2, 5.3).
 *
 * It polls files by size, mtime and offset and returns raw facts. It draws
 * nothing and never writes a workflow file (R4).
 *
 * R2: a journal poll reads only the bytes after the last offset. `$.fs.read`
 * has no offset and refuses a file over 4 MiB, so a file under the read limit
 * is read whole and cut at the offset, and a larger one is read from its byte
 * offset through `readFrom` (a child process). An unchanged file (same size,
 * same mtime) is not read at all.
 */
import { parseJsonLines } from '../../../lib/live-events.mjs'

/** What the reader needs from the engine; the live module binds it to `$`. */
export type LiveIo = {
  /** `{ size, mtimeMs }` of a file, or null when it is absent. */
  stat: (path: string) => Promise<{ size: number; mtimeMs: number } | null>
  /** A file's text, or null when it is absent or unreadable. */
  read: (path: string) => Promise<string | null>
  /** The text of a file from a byte offset, at most `max` bytes, cut at the last newline; null when it cannot. */
  readFrom: (path: string, offset: number, max: number) => Promise<string | null>
  /** The entries of a directory, or [] when it is absent. */
  list: (path: string) => Promise<Array<{ name: string; kind: string; mtimeMs: number }>>
}

/** `$.fs.read` refuses a file over 4 MiB; below this size the reader reads the whole file. */
export const READ_LIMIT = 3.5 * 1024 * 1024
/** At most this many bytes cross per tail read of a large file. */
const TAIL_CHUNK = 2 * 1024 * 1024

type Tail = { size: number; mtimeMs: number; offset: number; mode: 'chars' | 'bytes' }
type Seen = { size: number; mtimeMs: number; text: string | null }

/** The byte length of a text in UTF-8. */
export function byteLengthOf(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i += 1
    } else bytes += 3
  }
  return bytes
}

export class LiveReader {
  private readonly tails = new Map<string, Tail>()
  private readonly seen = new Map<string, Seen>()

  constructor(private readonly io: LiveIo) {}

  /**
   * The JSON lines appended to a journal since the last call. The first call
   * reads the whole file. A shorter file was replaced or truncated: it is
   * read again from the start, and `reset` says so.
   */
  async tail(path: string): Promise<{ lines: Array<Record<string, unknown>>; reset: boolean; exists: boolean }> {
    const stat = await this.io.stat(path)
    const known = this.tails.get(path)
    if (stat === null) {
      if (known !== undefined) this.tails.delete(path)
      return { lines: [], reset: known !== undefined, exists: false }
    }
    let tail = known ?? { size: 0, mtimeMs: 0, offset: 0, mode: 'chars' as const }
    let reset = false
    if (stat.size < tail.size) {
      tail = { size: 0, mtimeMs: 0, offset: 0, mode: 'chars' }
      reset = true
    }
    if (known !== undefined && stat.size === tail.size && stat.mtimeMs === tail.mtimeMs) return { lines: [], reset, exists: true }
    if (stat.size <= READ_LIMIT) {
      const text = await this.io.read(path)
      if (text === null) return { lines: [], reset, exists: true }
      // A file read in bytes before (it was large) and now small again was replaced.
      const start = tail.mode === 'chars' ? Math.min(tail.offset, text.length) : 0
      const { lines, consumed } = parseJsonLines(text.slice(start))
      this.tails.set(path, { size: stat.size, mtimeMs: stat.mtimeMs, offset: start + consumed, mode: 'chars' })
      return { lines, reset: reset || (tail.mode === 'bytes' && tail.offset > 0), exists: true }
    }
    // A large file: read from the byte offset, one chunk per poll.
    let byteOffset = tail.offset
    if (tail.mode === 'chars' && tail.offset > 0) {
      // The file grew past the read limit since the last read: the offset in characters becomes one in bytes.
      const text = await this.io.read(path).catch(() => null)
      byteOffset = text === null ? 0 : byteLengthOf(text.slice(0, tail.offset))
    }
    const chunk = await this.io.readFrom(path, byteOffset, TAIL_CHUNK)
    if (chunk === null) return { lines: [], reset, exists: true }
    const { lines, consumed } = parseJsonLines(chunk)
    const next = byteOffset + byteLengthOf(chunk.slice(0, consumed))
    // Only a whole read records the size: a partial chunk leaves the next poll to read on.
    const isWhole = next >= stat.size
    this.tails.set(path, { size: isWhole ? stat.size : 0, mtimeMs: isWhole ? stat.mtimeMs : 0, offset: next, mode: 'bytes' })
    return { lines, reset, exists: true }
  }

  /**
   * A file's text when it changed since the last call (size or mtime), else
   * `changed: false` with the text last read. An absent file is null.
   */
  async changed(path: string): Promise<{ changed: boolean; text: string | null }> {
    const stat = await this.io.stat(path)
    const known = this.seen.get(path)
    if (stat === null) {
      this.seen.set(path, { size: -1, mtimeMs: -1, text: null })
      return { changed: known !== undefined && known.text !== null, text: null }
    }
    if (known !== undefined && known.size === stat.size && known.mtimeMs === stat.mtimeMs) return { changed: false, text: known.text }
    const text = stat.size > READ_LIMIT ? null : await this.io.read(path)
    this.seen.set(path, { size: stat.size, mtimeMs: stat.mtimeMs, text })
    return { changed: true, text }
  }

  /** The mtime of a file, or null; no read. */
  async mtime(path: string): Promise<number | null> {
    return (await this.io.stat(path))?.mtimeMs ?? null
  }

  /** The entries of a directory. */
  async list(path: string): Promise<Array<{ name: string; kind: string; mtimeMs: number }>> {
    return this.io.list(path)
  }

  /** Forgets every offset: the next poll reads every file again. */
  clear(): void {
    this.tails.clear()
    this.seen.clear()
  }
}

/** A short, stable hash of a text (FNV-1a), for the protected-file check. */
export function hashOf(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
