# Records by script

`<wf> run` runs a script with the library of the records. The library has the same rules as the CLI: the schema check, the refusals of record put, the commit of a linked project, the lease check and the GitHub layer.

In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root, as in `_records.md`.

## Choose the door

| The work | Use |
|---|---|
| One record field, or one decision | The CLI: `<wf> record set`, `<wf> decide add` |
| Where the workflow stands | The CLI: `<wf> status <root> <slug> --brief` |
| Several records, a change of several list items, or a read with a filter | A script and `<wf> run` |
| A step of a plan, a slice drop or move, a stage done | The CLI only: `<wf> step`, `<wf> slice`, `<wf> record stage-done` |

## Write and run a script

1. Write the script with the file-write tool, in `.ai/workflows/<slug>/.draft/` or in `.scratch/`. Do not write the script as inline shell text. A run refuses a script outside the project.
2. Export one default function. The function gets `{ wf, open, args }`: `wf` is the workflow of `--slug`, `open(slug)` opens another workflow of the project, and `args` holds the words after the script path. Do not import a module of the plugin. The run gives the library to the script.
3. When the script changes records, run it with `--dry-run` first. The dry run lists each change and applies none.

   ```bash
   <wf> run <root> .ai/workflows/<slug>/.draft/<name>.mjs --slug <slug> --dry-run
   ```

4. Run the script without `--dry-run`. The return value of the function prints as JSON.

The run is all or nothing. When the script throws, no change stays, and the run names the operation that failed. When the script returns, each workflow that changed gets one commit.

Run `<wf> describe` for every function of the library, each with one example.

## Examples

The verify result and the convergence of every slice:

```js
export default async function ({ wf }) {
  return wf.records.fields('03-slice', ['slices']).slices.map(({ slug }) => {
    const v = wf.records.get(`06-verify-${slug}`);
    return { slice: slug, result: v?.frontmatter.result ?? null, convergence: v?.frontmatter.convergence ?? null };
  });
}
```

Three slices to `in-progress`, and one deferral:

```js
export default async function ({ wf }) {
  for (const s of ['s4', 's5', 's6']) wf.records.set('03-slice', `slices[${s}].status`, 'in-progress');
  wf.records.set('index', 'runtime-evidence-deferrals+', {
    slice: 's6', ac: 'AC-2', reason: 'waits for the payment API sandbox', 'clearing-event': 'the payment API sandbox is up',
  });
}
```

A batch of answers of the person. Each answer settles its open question:

```js
export default async function ({ wf, args }) {
  const answers = JSON.parse(args[0]);
  return wf.decisions.addMany(answers.map((a) => ({ kind: 'answer', by: 'person', ...a }))).map((r) => r.entry.key);
}
```
