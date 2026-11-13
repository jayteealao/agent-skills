// The proof of OUT-TALLY-001: exits 0 when `add` sums every number.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tally = fileURLToPath(new URL('./tally.mjs', import.meta.url));
const out = execFileSync(process.execPath, [tally, 'add', '5', '-2', '4'], { encoding: 'utf8' }).trim();
console.log(`add 5 -2 4 => ${out}`);
process.exitCode = out === '7' ? 0 : 1;
