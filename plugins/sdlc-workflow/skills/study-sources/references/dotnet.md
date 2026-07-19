
# .NET / C# sources

NuGet packages ship **compiled assemblies** (`.dll`), not source. Three routes to the real
code, best first: **SourceLink** (step into published source), the project's Git repo, or
**decompilation**.

## Local NuGet cache

```
~/.nuget/packages/<pkg-lowercase>/<version>/       # nupkg contents
    lib/<tfm>/<pkg>.dll                            # bytecode (IL)
    <pkg>.<version>.nupkg
```

```bash
dotnet nuget locals global-packages --list         # exact cache path
find ~/.nuget/packages/<pkg> -name '*.dll'
```

A `.nupkg` is just a zip — unpack to inspect metadata and any bundled files:

```bash
unzip -o ~/.nuget/packages/<pkg>/<version>/<pkg>.<version>.nupkg -d .scratch/sources/dotnet/<pkg>-<version>/
```

## Getting real source

- **SourceLink** (most modern packages): the PDB points at the exact commit on the Git
  host. `dotnet` / debuggers can fetch that source on demand. The `.nuspec`
  `repository` element names the repo + commit — clone it (see [git-sources.md](git-sources.md)).
- **Decompile** when there's no source link:

```bash
# ILSpy CLI
ilspycmd ~/.nuget/packages/<pkg>/<version>/lib/<tfm>/<pkg>.dll \
  -o .scratch/sources/dotnet/<pkg>-decompiled/
# Alternatives: dotPeek (JetBrains), dnSpy (GUI)
```

## .NET runtime / BCL

The base class library (`System.*`) source is on GitHub at `dotnet/runtime` — read there
(or via SourceLink), tagged to the target framework version.

## Tips

- Resolve the version from the `.csproj` `<PackageReference>` or `packages.lock.json`.
- Decompiled C# loses `async`/iterator/`record` sugar and exact names — prefer SourceLink
  or the real repo for anything subtle.
