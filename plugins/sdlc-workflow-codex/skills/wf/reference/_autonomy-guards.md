# Shared autonomy guards (single source)

Two guards for stages and drivers that run with autonomy. Consumers reference
this file. Do not paste the guards into other files.

## Early-stop guard

Before you end your turn, check your last paragraph.

- If the last paragraph is a plan, an analysis, a question, or a promise
  about work you have not done, do that work now.
- End your turn only when the stage contract is complete, or when you are
  blocked on input that only the user can provide.
- An `awaiting-input` gate is such a block. A described-but-unrun next step
  is not.

## Release valve

Pause for the user only when the work genuinely requires the user:

- a destructive or irreversible action,
- a real scope change, or
- an answer that only the user holds.

When the prompt, an existing artifact, or the codebase already answers a
question, do not ask the question. Record the answer and the source of the
answer, then continue. The recorded source keeps the audit trail that the
question existed to create.
