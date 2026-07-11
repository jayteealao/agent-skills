
# Rust sources

Cargo unpacks every crate's **full source** into a registry cache. Like Go, Rust library
crates are always source — read the cached copy.

## The registry cache

```
~/.cargo/registry/src/<index-hash>/<crate>-<version>/     # decompressed crate source
~/.cargo/registry/cache/<index-hash>/<crate>-<version>.crate   # the .crate tarball
```

`<index-hash>` is e.g. `index.crates.io-6f17d22bba15001f` for crates.io.

```bash
find ~/.cargo/registry/src -maxdepth 2 -name '<crate>-<version>' -type d
cargo metadata --format-version 1 | ...        # resolve exact versions in this project
```

## Fetch / materialize when not cached

```bash
# Vendor all of a project's deps into one readable tree (great for offline study)
cargo vendor .scratch/sources/rust/vendor/

# Pull a single crate's source without adding it as a dependency
cargo download <crate>==<version> 2>/dev/null   # if cargo-download is installed
# else fetch the .crate tarball directly:
curl -sL "https://crates.io/api/v1/crates/<crate>/<version>/download" \
  -o .scratch/sources/rust/<crate>-<version>.crate
tar -xzf .scratch/sources/rust/<crate>-<version>.crate -C .scratch/sources/rust/
```

## Tips

- **docs.rs** renders the exact published API with "source" links per item — fastest for a
  single symbol without touching disk.
- The Rust std library source: `rustup component add rust-src` →
  `$(rustc --print sysroot)/lib/rustlib/src/rust/library/`.
- Match the version in `Cargo.lock`; the crates.io release can lag or lead the GitHub repo.
