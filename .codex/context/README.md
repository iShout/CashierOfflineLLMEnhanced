# Long-Term Codex Context

This directory stores durable project context for Codex conversations opened from the offline Windows cashier repository.

The goal is to avoid loading all of the online front-end source and backend API source into every chat. Instead, keep stable summaries and decisions here, then let Codex read reference source files only when a task genuinely needs source-level detail.

## Files

- `online-frontend-summary.md`: durable summary of `swifood-cashier-ipad-h5`, the online front-end source.
- `backend-api-summary.md`: durable summary of `phpay-food`, the backend API source.
- `integration-rules.md`: cross-project mapping and rules for implementing offline Windows cashier behavior.
- `decisions.md`: dated decisions, tradeoffs, and assumptions.
- `current-work.md`: active work state, unresolved questions, and next actions.
- `source-reference.md`: how to reference source without editing it.

## Maintenance Rules

- Prefer summaries over pasted code.
- Record facts that future Codex sessions are likely to need again.
- Keep temporary task notes in `current-work.md`; move lasting conclusions into `decisions.md` or the relevant summary.
- If a summary becomes too large, split it by domain, for example `online-frontend-order-flow.md` or `backend-api-payment-contracts.md`.
