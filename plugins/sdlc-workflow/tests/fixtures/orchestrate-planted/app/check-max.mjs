// The proof of OUT-TALLY-003: exits 0 when `max` prints the largest number.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tally = fileURLToPath(new URL('./tally.mjs', import.meta.url));
const out = execFileSync(process.execPath, [tally, 'max', '5', '-2', '9'], { encoding: 'utf8' }).trim();
console.log(`max 5 -2 9 => ${out}`);
process.exitCode = out === '9' ? 0 : 1;
