# A fixture with planted faults

`app/tally.mjs` is a small command with faults planted on purpose. `faults.json` names each fault, the outcome that it breaks, and which validator must find it. `contract.json` is the vision contract of the fixture.

Use it to tune the validator tasks of `/wf orchestrate`: copy the folder into a new git repo, put and approve the contract, and run the validators. A validator must fail each outcome that has a planted fault, and must pass the control outcome. Do not repair `app/tally.mjs` in this folder: a run repairs its copy.

Copy only `app/` into the new repo. Keep this README and `faults.json` out of it, so that no agent of the run reads the list of the faults.

The first live run (2026-11-13) showed two things about a fixture. A comment in the product that forbids the repair is a written rule, and the code validator rightly fails the rules outcome on it. An outcome with two clauses was read in two ways by two validators. So the product file states no rule, and each outcome says one thing.

`tests/unit/orchestrate-fixture.test.mjs` runs the part that needs no model: the measure judge fails the measured fault and passes the control.
