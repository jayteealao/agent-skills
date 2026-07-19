
# C / C++ and system sources

C/C++ has no single package registry, so source lives in a few predictable places:
**system headers**, a **package-manager cache** (vcpkg/Conan), or the **upstream repo**.

## System headers & libraries

Public API surface is in headers, already on disk:

```
/usr/include/            /usr/local/include/        # system + locally-installed headers
# macOS SDK:
$(xcrun --show-sdk-path)/usr/include/
# find the header that declares a symbol:
grep -rl "<symbol>" /usr/include 2>/dev/null
```

Headers give you signatures and macros. For *implementations*, you need the library's
source package or repo (below).

## Package managers with source caches

```bash
# vcpkg — source is downloaded and built under the buildtrees/sources dirs
<vcpkg-root>/buildtrees/<port>/src/
<vcpkg-root>/installed/<triplet>/include/     # installed headers

# Conan — recipe + source cache
conan cache path <pkg>/<version>              # path to the cached recipe/source
~/.conan2/p/                                   # Conan 2 package cache
```

## Distro source packages

```bash
# Debian/Ubuntu — fetch upstream source for an installed lib
apt-get source <libfoo>       # unpacks source into ./ (run inside .scratch/)
# Fedora/RHEL:
dnf download --source <libfoo>
```

## Otherwise — clone upstream

Most C/C++ libraries are on GitHub/GitLab. Resolve the version you link against
(`pkg-config --modversion <lib>`, or the version in your build files) and clone that tag —
see [git-sources.md](git-sources.md).

## Tips

- Header (`.h`/`.hpp`) = declarations/API; `.c`/`.cc`/`.cpp` = implementation. For "how
  does it behave", you need the latter → source package or repo.
- Match the exact version you compile/link against; ABI and behavior shift across releases.
- The C standard library implementation is glibc/musl/libc++ — clone the specific one your
  toolchain uses if you need its internals.
