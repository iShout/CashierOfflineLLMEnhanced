# Codex Project Context Guide

This repository is the offline Windows cashier source: `swifood-cashier-offline-windows`.

When working in this repository, Codex should treat the offline Windows cashier as the only editable workspace. The online front-end source and backend API source are long-term read-only references for business logic, API behavior, naming, and implementation comparison.

## Reference Projects

- Online front-end source: `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5`
  - Alias: 在线前端源码
  - Role: online cashier front-end reference.
- Backend API source: `/Users/wayne/paycools/swifood/back-end/phpay-food`
  - Alias: 后端接口源码
  - Role: backend API and business-rule reference.
- Offline Windows cashier source: this repository.
  - Role: the only project Codex may edit by default.

## Required Reading Order

Before making changes that may depend on reference behavior, Codex should read the long-term context files in this order:

1. `.codex/context/current-work.md`
2. `.codex/context/decisions.md`
3. `.codex/context/integration-rules.md`
4. `.codex/context/online-frontend-summary.md`
5. `.codex/context/backend-api-summary.md`
6. `.codex/context/source-reference.md`

Only read online front-end or backend API source files directly when the summaries are not enough for the current task.

## Editing Boundaries

- Codex may create, edit, and test files in the offline Windows cashier source only.
- Codex must not modify the online front-end source or backend API source unless the user explicitly asks for that in a later message and grants the needed workspace permissions.
- If reference source directories are available through `external/online-frontend`, `external/backend-api`, symlinks, submodules, or absolute paths, treat them as read-only references.
- Do not copy large chunks of reference source into chat context. Prefer targeted reads of specific files, functions, API definitions, or business-rule fragments.
- If behavior differs between the online front-end, backend API, and offline Windows cashier, preserve the offline Windows cashier architecture unless the user asks to align it.

## Code Comment Expectations

- For each code change, add brief Chinese comments before necessary new logic, new methods, or non-obvious branches to make review easier.
- Keep comments concise and focused on intent or business behavior. Do not comment trivial assignments, obvious JSX, or self-explanatory code.

## Encoding And Mojibake Prevention

- Source files in this repository should be treated as UTF-8. Do not save source files as GBK, ANSI, or another legacy Windows encoding.
- On Windows, before editing Chinese comments, Chinese UI text, SQL comments, or other non-ASCII text, Codex should confirm the active terminal uses UTF-8:
  - `chcp` should report `65001`.
  - `[Console]::InputEncoding` and `[Console]::OutputEncoding` should be UTF-8.
- If the Windows terminal or sandbox shell is not UTF-8, set the current PowerShell session to UTF-8 before running commands that read, write, transform, or generate text:
  - `chcp 65001`
  - `[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()`
  - `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()`
  - `$OutputEncoding = [System.Text.UTF8Encoding]::new()`
- Do not assume a non-interactive Codex sandbox shell has loaded the user's PowerShell profile. If encoding-sensitive work is happening on Windows, explicitly set UTF-8 in the command/session when needed.
- Keep mojibake checks lightweight and local to the current task. Before or after editing a file that contains Chinese text, briefly check only the touched file for obvious mojibake markers such as `�`, `锟`, `鏀`, `璁`, `鎵`, or similar mixed Chinese-looking gibberish. Do not run a full-repository mojibake scan unless the user explicitly asks for encoding cleanup.
- If Chinese mojibake is found in a touched file, fix it promptly when the intended text is clear. Repair only comments or user-facing text unless the user explicitly asks for broader changes; do not change SQL fields, field order, default values, indexes, TypeScript types, or business logic as part of encoding cleanup.
- On macOS or Linux, Codex may fix mojibake directly when the intended text is clear. If the text cannot be confidently restored, record the affected file path, line number, and mojibake sample so it can be reviewed later.
- After several consecutive tasks with no mojibake found in touched files, Codex should ask the user whether these mojibake-specific constraints can be simplified or removed from this guide.

## Long-Term Context Maintenance

Codex should keep `.codex/context/` useful over time:

- Add stable facts about the online front-end source to `.codex/context/online-frontend-summary.md`.
- Add stable facts about the backend API source to `.codex/context/backend-api-summary.md`.
- Add cross-project mapping, API assumptions, and compatibility rules to `.codex/context/integration-rules.md`.
- Add important decisions, tradeoffs, and rejected approaches to `.codex/context/decisions.md`.
- Update `.codex/context/current-work.md` when a task creates ongoing state, unresolved issues, or follow-up work.

Keep these files concise. They should help future conversations recover context quickly, not become a full mirror of the reference source code.

## Deferred Optimization Points

- `.codex/context/optimization-points.md` records deferred optimization ideas by number.
- Codex should read this file only when the user explicitly asks about current project optimization points,待优化点,优化项,技术债, or asks to choose/handle an optimization item.
- Do not include `optimization-points.md` in the default required reading order for ordinary implementation, debugging, review, or explanation tasks.
- When an optimization item is completed and verified, remove that item from `optimization-points.md`.

## Verification Expectations

When changing the offline Windows cashier:

- Inspect the local implementation before editing.
- Compare with the online front-end or backend API source only when relevant.
- Run the smallest useful verification command available in this repository.
- Report any reference behavior that could not be verified because source access or context is missing.
