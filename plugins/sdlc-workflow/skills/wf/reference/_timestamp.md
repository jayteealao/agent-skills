# Shared timestamp rule (single source)

Every timestamp written into an artifact (`created-at`, `updated-at`,
`observed-at`, `measured-at`, `closed-at`, `skipped-at`, `surfaced-at`,
run-ids, review dates) is the REAL current UTC time obtained from the host
shell — never guessed, never reused from an example, never `T00:00:00Z`.

Get it from whichever shell is native to the host:

- POSIX: `date -u +"%Y-%m-%dT%H:%M:%SZ"`
- PowerShell: `(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")`

Variant formats derive the same way from one real clock read:

| Need | POSIX | PowerShell |
| --- | --- | --- |
| Full ISO-8601 (frontmatter) | `date -u +"%Y-%m-%dT%H:%M:%SZ"` | `(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")` |
| Compact run-id `<yyyymmdd>T<hhmm>Z` | `date -u +"%Y%m%dT%H%MZ"` | `(Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmZ")` |
| Date only `<yyyy-mm-dd>` | `date -u +"%Y-%m-%d"` | `(Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")` |
| Epoch seconds (staleness math) | `date -u +%s` | `[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()` |

One clock read per run is enough — reuse it for every field stamped in the
same pass. If no shell call is possible, say so in the chat return and write
`<unknown>` rather than inventing a plausible-looking value.
