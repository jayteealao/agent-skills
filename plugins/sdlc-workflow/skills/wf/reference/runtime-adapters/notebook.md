# Adapter: `notebook` (Jupyter / data exploration)

## Detection signals
- `*.ipynb` files in the repo
- `requirements.txt` / `pyproject.toml` declaring `jupyter`, `notebook`, `nbconvert`, `papermill`
- `environment.yml` for a conda env aimed at data work

## Bootstrap
1. **Ensure the kernel is installed** — `jupyter kernelspec list`.
2. **For papermill execution (preferred):** `pip install papermill` if not present.

## Enumerate
Inventory the executable surface **before** driving (see the enumeration ladder in [_protocols.md](_protocols.md)).
1. **Recipe rung** — read the cell graph and the papermill parameter cell: every parameter is a surface dimension.
2. **Static rung** — collect cell boundaries and their declared inputs/outputs.
3. **Traversal rung** — execute end-to-end and record which cells produced output. The count is a FLOOR.

## Drive
- **Execute notebooks programmatically** — `papermill <notebook>.ipynb <output>.ipynb -p <param> <value>` to parameterize and run.
- **Validate notebook contents** — `jupyter nbconvert --to script <notebook>.ipynb` and inspect output cells.

## Observe
- **Output cells** — read the executed notebook's cell outputs; flag any cell with errors.
- **Plots** — image outputs are embedded in the executed notebook; extract for visual inspection.
- **Runtime** — record execution time per cell when the criterion is performance-related.

## Perturb
Break exactly one dependency, re-observe, restore (see the perturbation protocol in [_protocols.md](_protocols.md)).
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
