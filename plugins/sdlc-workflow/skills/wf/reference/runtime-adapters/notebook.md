# Adapter: `notebook` (Jupyter / data exploration)

The registry ([../runtime-adapters.md](../runtime-adapters.md)) selects this adapter. [_protocols.md](_protocols.md) owns the enumeration and perturbation rules; this file gives only the steps of this platform.

## Bootstrap
1. **Ensure the kernel is installed** — `jupyter kernelspec list`.
2. **For papermill execution (preferred):** `pip install papermill` if not present.

## Enumerate
1. **Recipe rung** — read the cell graph and the papermill parameter cell: every parameter is a surface dimension.
2. **Static rung** — collect cell boundaries and their declared inputs/outputs.
3. **Traversal rung** — execute end-to-end and record which cells produced output.

## Drive
- **Execute notebooks programmatically** — `papermill <notebook>.ipynb <output>.ipynb -p <param> <value>` to parameterize and run.
- **Validate notebook contents** — `jupyter nbconvert --to script <notebook>.ipynb` and inspect output cells.

## Observe
- **Output cells** — read the executed notebook's cell outputs; flag any cell with errors.
- **Plots** — image outputs are embedded in the executed notebook; extract for visual inspection.
- **Runtime** — record execution time per cell when the criterion is performance-related.

## Perturb
- **Missing input dataset** — point a parameter at an absent path; check the failure is diagnosable, not a bare traceback deep in a cell.
- **Empty input** — a zero-row frame; check downstream cells degrade rather than emitting `fabricated-value` defaults.

## Tear down
- Delete intermediate executed notebooks under `<evidence-dir>/` after capturing the relevant outputs.

## Evidence layout
```
<evidence-dir>/
  <notebook-name>.executed.ipynb
  <notebook-name>.cell-<N>.png       # extracted plot
```

## Remediation hints
- Kernel missing → "Install the kernel with `python -m ipykernel install --user --name <env>`."
- Cell error → "Re-run the notebook manually to see the full traceback; the executed notebook has the error in the failing cell's output."
