#!/usr/bin/env node
// A small command with faults planted on purpose. faults.json names each one.
// The README of the fixture says how it is used. This file states no rule: a run on a copy repairs it.
const [cmd, ...rest] = process.argv.slice(2);
const numbers = rest.map(Number);

if (cmd === 'add') {
  // PLANTED (add-drops-negatives): a negative number is left out of the sum.
  console.log(numbers.filter((n) => n >= 0).reduce((a, b) => a + b, 0));
} else if (cmd === 'mean') {
  // PLANTED (mean-of-nothing): with no number this prints NaN, not the message.
  console.log(numbers.reduce((a, b) => a + b, 0) / numbers.length);
} else if (cmd === 'max') {
  if (!numbers.length) console.log('no numbers');
  else console.log(Math.max(...numbers));
} else {
  console.error('usage: tally add|mean|max <number>...');
  process.exitCode = 2;
}
