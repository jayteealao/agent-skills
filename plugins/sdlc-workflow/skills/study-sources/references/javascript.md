
# JavaScript / TypeScript sources

npm packages ship their source (or at least their published build + `.d.ts` types)
**inside `node_modules/`**. This is almost always already on disk — read it in place before
fetching anything.

## Read what's installed

```
node_modules/<pkg>/                     # package root: package.json, dist/, src?, *.d.ts
node_modules/@scope/<pkg>/
```

- `package.json` `"main"`/`"module"`/`"exports"`/`"types"` tells you which files are the
  real entry points.
- Types live in `*.d.ts` (bundled) or come from `node_modules/@types/<pkg>/` (DefinitelyTyped).
- Many packages publish only compiled `dist/` — for original TypeScript, fetch the repo
  (see below).

Resolve the *exact* installed version before reading:

```bash
node -p "require('<pkg>/package.json').version"
cat node_modules/<pkg>/package.json | grep '"version"'
```

## Non-flat stores (pnpm / Yarn Berry)

- **pnpm**: real files live in the content-addressed store, symlinked via
  `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/`. Follow the link or read there.
  Global store: `pnpm store path`.
- **Yarn Berry (PnP)**: packages stay **zipped** in `.yarn/cache/*.zip`. Unzip the one you
  need into `.scratch/`, or use `yarn unplug <pkg>` to materialize it under `.yarn/unplugged`.

## Fetch when not installed (or you want original TS source)

```bash
# Exact published tarball for a version — decompressed source as published
npm pack <pkg>@<version> --pack-destination .scratch/sources/js/
tar -xzf .scratch/sources/js/<pkg>-<version>.tgz -C .scratch/sources/js/   # → package/

# Original (pre-build) TypeScript usually only exists in the repo:
#   read package.json "repository" → clone that tag (see git-sources.md)
npm view <pkg>@<version> repository.url
```

## Tips

- The published tarball (`npm pack`) contains exactly what a consumer installs — the
  truth for "what does this version actually ship". The Git repo may be ahead.
- For type-only questions, `@types/<pkg>` or bundled `.d.ts` is the fastest authoritative
  answer.
- Deno/JSR: source is fetched to `~/.cache/deno/`; or read directly from the JSR/esm.sh URL.
