
# Python sources

Python packages install **as readable `.py` source** into `site-packages` — the exception
being compiled extension modules (`.so`/`.pyd`, written in C/Rust/Cython). Read the
installed copy first.

## Find the installed source

```bash
python -c "import <pkg>, os; print(os.path.dirname(<pkg>.__file__))"   # package dir
python -m pip show -f <dist-name>                                       # files + version + location
```

Typical locations:

```
<venv>/lib/python3.X/site-packages/<pkg>/      # active virtualenv (preferred)
~/.local/lib/python3.X/site-packages/<pkg>/    # user install
<sys.prefix>/lib/python3.X/site-packages/<pkg>/# system
```

`.venv`, Poetry (`poetry env info -p`), Pipenv, Conda (`$CONDA_PREFIX/lib/...`) all resolve
to a `site-packages` — ask the interpreter, don't guess.

## Fetch when not installed

```bash
# Source distribution (sdist) — the real source tree, not a wheel
pip download <pkg>==<version> --no-binary :all: --no-deps -d .scratch/sources/py/
tar -xzf .scratch/sources/py/<pkg>-<version>.tar.gz -C .scratch/sources/py/

# Wheel (may be pre-compiled, but pure-Python wheels contain the .py source)
pip download <pkg>==<version> --no-deps -d .scratch/sources/py/
unzip -o .scratch/sources/py/<pkg>-<version>-*.whl -d .scratch/sources/py/<pkg>-<version>/
```

## Compiled extensions

If `<pkg>.__file__` points at a `.so`/`.pyd`, the Python layer is a thin wrapper over
native code. For the real implementation, read the project's `repository` (clone its C/
Cython/Rust source — see [git-sources.md](git-sources.md), [rust.md](rust.md)).

## Tips

- `pip show <dist>` bridges the **distribution name** (what you install, e.g. `PyYAML`) and
  the **import name** (what you `import`, e.g. `yaml`) — they often differ.
- The sdist is authoritative for "what this version ships"; the GitHub `main` may be ahead.
- Stub-only type info may live in a separate `<pkg>-stubs` package or `typeshed`.
