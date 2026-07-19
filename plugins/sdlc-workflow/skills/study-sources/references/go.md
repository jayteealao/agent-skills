
# Go sources

Go's module cache stores **full, readable source** for every dependency — Go has no
"binary-only" package concept for library code. The source you need is almost always
already on disk.

## The module cache

```
$GOPATH/pkg/mod/<module>@<version>/          # default $GOPATH ~= ~/go
# e.g. ~/go/pkg/mod/github.com/gin-gonic/gin@v1.9.1/
```

Files here are **read-only** (mode 0444) by design — read in place, don't edit.

```bash
go env GOMODCACHE                             # exact cache path
go list -m -f '{{.Dir}}' <module>            # resolved dir for a module in this project
go list -m -f '{{.Version}}' <module>        # resolved version
```

## Fetch when not cached

```bash
go mod download <module>@<version>            # populates the module cache
# or, from within a project that requires it:
go mod download all
```

The standard library lives in the toolchain, not the module cache:

```bash
go env GOROOT      # → $GOROOT/src/<pkg>/ , e.g. $GOROOT/src/net/http/
```

## Tips

- `go doc <pkg> <symbol>` prints the doc + signature straight from source without opening
  files — fast for a single symbol.
- The version in `go.mod` (and precise hash in `go.sum`) is what's cached — read that, not
  the GitHub tip.
- Vendored projects keep a full copy under `./vendor/<module>/` in the repo itself — read
  that first if present.
