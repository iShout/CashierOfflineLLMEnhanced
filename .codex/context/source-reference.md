# Source Reference Strategy

The offline Windows cashier may need source-level reference from `swifood-cashier-ipad-h5` and `phpay-food`, but reference code must stay read-only unless the user explicitly says otherwise.

## Absolute Paths

- Online front-end source: `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5`
- Backend API source: `/Users/wayne/paycools/swifood/back-end/phpay-food`
- Offline Windows cashier: `/Users/wayne/my/swifood-cashier-offline`

Using absolute paths is the simplest option when Codex has permission to read them. It avoids duplicating source under this repository.

## Optional `external/` Layout

Reserved paths:

```text
external/online-frontend/ # online front-end source reference
external/backend-api/     # backend API source reference
```

Recommended options:

- Local symlink: easy for one machine, usually not portable across teammates.
- Git submodule: explicit and reproducible, but requires repository access and maintenance.
- Source copy: simple but can become stale and may accidentally create large commits.
- No local mirror: use absolute paths and summarize durable findings into `.codex/context/`.

Current recommendation:

- Start with absolute-path reads plus `.codex/context/` summaries.
- Add `external/online-frontend` and `external/backend-api` only if repeated source lookup becomes common.
- If local copies are used, keep them ignored by git unless the team intentionally wants them versioned.

## Read-Only Rule

Codex must not modify:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5`
- `/Users/wayne/paycools/swifood/back-end/phpay-food`
- `external/online-frontend`
- `external/backend-api`

The only default editable project is the offline Windows cashier.

## What To Record After Reading Source

After checking reference source, summarize durable facts in the appropriate context file:

- Front-end behavior from `swifood-cashier-ipad-h5` goes to `online-frontend-summary.md`.
- Backend contracts and business rules from `phpay-food` go to `backend-api-summary.md`.
- Cross-project mapping goes to `integration-rules.md`.
- Implementation choices go to `decisions.md`.
- Temporary handoff state goes to `current-work.md`.
