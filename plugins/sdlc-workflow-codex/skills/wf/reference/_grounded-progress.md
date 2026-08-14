# Shared grounded-progress rule (single source)

This rule governs every progress report, hand-back, and count that a stage or
driver emits. Consumers reference this file. Do not paste the rule into other
files.

## The rule

Before you report progress, audit each claim against a tool result from this
session.

- Report only work that a tool result shows. Name the evidence when the
  consumer contract asks for it, for example a file path and line.
- When a claim is not yet verified, say so explicitly. Write "not verified",
  not a softer phrase.
- When a test fails, say so and include the output.
- When you skip a step, record `skip`. Never record `pass` for a check that
  did not run.
- When a count appears in a report (checks run, findings, commits), derive
  the count from an artifact or tool result that you opened in this run. Do
  not derive a count from memory of your own earlier turns.

## Relation to stronger stage laws

Some stages carry stronger evidence laws, for example the probe receipts in
`verify.md`. Those laws stay in force. This rule is the floor, not the
ceiling.
