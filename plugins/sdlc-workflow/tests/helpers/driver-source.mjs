// The source of a driver script as the text tests read it. A prompt shows each call of wf through
// wf() (the tool call on Claude, then the command line), so the source holds
// ${wf(`${WF_CMD} …`)} where a plain span \`${WF_CMD} …\` stood. The tests check what a prompt
// says, not how a call is shown: this turns each wf() back into the plain span.
// tests/unit/driver-wf-calls.test.mjs checks the rendering itself.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', '..', 'skills', 'wf', 'workflows');

export function unwrapWf(src) {
  let out = '';
  let i = 0;
  for (;;) {
    const at = src.indexOf('${wf(`', i);
    if (at < 0) return out + src.slice(i);
    // A nested template ends in "` : ''}", never in "`)}": the first "`)}" closes the call.
    const end = src.indexOf('`)}', at);
    if (end < 0) return out + src.slice(i);
    out += `${src.slice(i, at)}\\\`${src.slice(at + 6, end)}\\\``;
    i = end + 3;
  }
}

export const driverSource = (name) => unwrapWf(readFileSync(join(DIR, name), 'utf8'));
