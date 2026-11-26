// The units of the records repo. A unit is the smallest folder with one owner: a workflow, a
// screen of a design surface, one computer's facts. A sync sends the change of a unit only from
// its owner. Some paths belong to no unit: anyone may add a new file there, and nobody changes
// one (the inbox of a workflow, the comments and approvals of a design surface).
//
// unitOf is the only code that reads the layout of the repo. A path it does not know gets null:
// the caller refuses it and reports it, and never sends it.

const NAME = /^[a-z0-9][a-z0-9._-]*$/;
// The files at the top of the repo: the settings of git and the notes of the person.
const REPO_FILES = new Set(['.gitattributes', '.gitignore', '.records-epoch']);
// The folders of _design that hold the files of one workflow: _design/<dir>/<slug>/...
const DESIGN_OF_WORKFLOW = new Set(['versions', 'captures', 'reviews']);

/**
 * The unit of a path of the records repo, relative to its top with `/`, or null when the path is
 * not one the layout knows. Returns `{ kind, unit, project?, slug?, addOnly }`:
 *
 * - `workflow`: `<project>/<slug>/**`, and `<project>/_design/{versions,captures,reviews}/<slug>/**`.
 *   The unit is `<project>/<slug>`.
 * - `inbox`: `<project>/<slug>/inbox/<id>`. Add-only.
 * - `design-item`: `<project>/_design/items/<screen>/**`. The unit is that folder.
 * - `design-comment`, `design-approval`: add-only files of the design surface.
 * - `design-project`: a file of the design surface of the whole project (`_design/checks.json`).
 * - `project`: a file at the top of a project folder.
 * - `machine`: `.machines/<machine>.json`. The unit is the machine.
 * - `repo`: the git settings and `.notes/**` of the repo.
 */
export function unitOf(path) {
  const p = String(path ?? '');
  if (!p || p.includes('\\') || p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null;
  const parts = p.split('/');
  if (parts.some((x) => !x || x === '.' || x === '..')) return null;
  const [top, second, third, fourth] = parts;

  if (parts.length === 1) return REPO_FILES.has(top) ? { kind: 'repo', unit: '.repo', addOnly: false } : null;
  if (top === '.notes') return { kind: 'repo', unit: '.notes', addOnly: false };
  if (top === '.machines') {
    const m = parts.length === 2 && /^(.+)\.json$/.exec(second);
    return m && NAME.test(m[1]) ? { kind: 'machine', unit: `.machines/${m[1]}`, machine: m[1], addOnly: false } : null;
  }
  if (!NAME.test(top)) return null;
  const project = top;
  if (parts.length === 2) return second.startsWith('.') ? null : { kind: 'project', unit: `${project}/${second}`, project, addOnly: false };

  if (second === '_design') {
    if (parts.length === 3) return { kind: 'design-project', unit: `${project}/_design/${third}`, project, addOnly: false };
    if (DESIGN_OF_WORKFLOW.has(third)) {
      return parts.length >= 5 && NAME.test(fourth) ? { kind: 'workflow', unit: `${project}/${fourth}`, project, slug: fourth, addOnly: false } : null;
    }
    if (third === 'items') return parts.length >= 5 && NAME.test(fourth) ? { kind: 'design-item', unit: `${project}/_design/items/${fourth}`, project, addOnly: false } : null;
    if (third === 'comments') return { kind: 'design-comment', unit: null, project, addOnly: true };
    if (third === 'approvals') return parts.length >= 5 ? { kind: 'design-approval', unit: null, project, addOnly: true } : null;
    return null;
  }
  if (!NAME.test(second)) return null;
  const slug = second;
  if (third === 'inbox' && parts.length === 4) return { kind: 'inbox', unit: null, project, slug, addOnly: true };
  return { kind: 'workflow', unit: `${project}/${slug}`, project, slug, addOnly: false };
}

/** The paths of `paths` that no unit holds: the ones a sync must refuse and report. */
export const unknownPaths = (paths) => paths.filter((p) => unitOf(p) === null);
