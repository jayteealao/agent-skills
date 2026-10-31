# Review severity and finding shape (single source)

Every review rubric reads this card with its sections. It owns the severity scale, the rules of a finding and the output. A rubric keeps only the checks of its own dimension, and the severity lines that only that dimension has.

## Severity and confidence

- Severity: BLOCKER, HIGH, MED, LOW or NIT.
- BLOCKER blocks the merge on its own. HIGH: fix before merge. MED: fix when time allows. LOW: a cleanup candidate. NIT: a preference.
- Confidence: High, Med or Low.
- Every finding has a severity and a confidence.

## The rules of a finding

- **Evidence first.** Every finding gives `file:line` and the quoted code, config or text that shows the defect.
- **Remediation.** Every BLOCKER or HIGH finding gives a concrete fix that names a method, not only an outcome.
- **Pre-existing.** A finding on lines that the diff did not touch is pre-existing. It is debt, not verdict input.
- Put the register-level findings (style, mechanics) of one file into one finding.

## Output

A reviewer writes no file. A scout of the review stage returns the JSON of the scout prompt in [_dispatch.md](_dispatch.md) Step 3. An ad-hoc review returns its findings inline, per [_ad-hoc.md](_ad-hoc.md).
