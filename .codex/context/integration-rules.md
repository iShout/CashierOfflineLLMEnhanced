# Integration Rules For Offline Windows Cashier

## Active Scope Since 2026-10-23

The cashier is now standalone and offline only. Online front-end/backend checkouts remain read-only business-rule references, not runtime dependencies. Earlier server-upload, online-payment/voucher, and printer integration rules below are historical contracts and do not authorize restoring removed features.

Login establishes the local account and restaurant session only. It does not select, restore, infer or bind a POS identity. Entry silently generates missing historical EOD reports without showing a daily-report modal.

Local SQLite accounts, restaurant isolation, transaction/receipt numbering, PWD/SC calculations, order transitions, attendance and reporting remain authoritative. Historical `device_no` columns may be retained only as nullable compatibility metadata and must not gate login, queries, writes or reports. Preserve receipt snapshot/text helpers needed by digital copies and local exports. Do not recreate upload queues, sync IPC, network probes, hardware printing or printer-driven cash-drawer actions.

## 2026-08-07: Local-Source Modules Are Pulled Only During Login Migration Sync

- The new-account login data-sync page uses explicit full sync and may pull all six modules, including Attendance and
  Shift info and Historical Report info, to support old-data migration or backup restoration.
- Background silent full sync and the Settings manual full-sync action pull only Account, Restaurant Configuration,
  Menu/Items, and Historical Orders.
- Settings must not expose Attendance and Shift info or Historical Report info as individually pullable modules. Their
  normal direction is local-to-server upload only.
- A four-module full sync still updates the global full-sync timestamp, but it must not refresh the per-module success
  timestamps for Attendance/Shift or Historical Reports.

## 2026-08-07: Local Mall And Regulatory Reports Follow Payment-Time Cycles

- Local SM, Parqal, Megaworld, End-of-Day, and BIR generation must use final `order_payment` records and `transaction_return_time` when assigning transactions to a report period.
- Offline SQLite queries are scoped by restaurant; backend POS filters are not copied into this Agent-focused standalone application.
- Historical BIR E-1 values must come from the persisted EOD snapshot; do not recalculate an old E-1 row from mutable order/payment tables.
- Local file generation remains filesystem-based. Backend OSS record/download-count mechanics are not copied into the offline architecture.

These rules guide how the offline Windows cashier should use the online front-end source and backend API source as references.

## Core Principles

- The offline Windows cashier is the editable implementation.
- `swifood-cashier-ipad-h5` and `phpay-food` are read-only references.
- Prefer implementing behavior in this repository using its existing architecture, dependencies, naming, and UI conventions.
- Use `swifood-cashier-ipad-h5` to answer front-end behavior questions.
- Use `phpay-food` to answer API contract and business-rule questions.
- If the online front-end and backend API disagree, treat `phpay-food` as the source of truth for backend contracts and business rules, then check whether the online front-end contains compatibility handling that the offline Windows cashier also needs.
- If the offline Windows cashier already intentionally differs from the references, preserve its behavior and record the reason in `decisions.md`.

## Scheduled Local Order Mutations

- Scheduled order work is scoped by `restaurant_id` and `order_inner_no`; it does not require or persist a POS device number.
- The scheduler starts only after the renderer restores the authenticated main-process session and stops on logout or restaurant switch.
- Local mutation commit is the scheduled task success boundary. Server upload failure does not roll back task execution; the complete mutation payload remains in `pending_order_sync` for network recovery.
- `restaurant_setting.completion` controls table auto-clear. For queue orders, `restaurant_wait_setting.dining_out/dining_out_time` controls Taken-to-Ready auto-prepare and `completion/completion_time` controls Ready-to-Complete auto-pickup; switch value `1` is enabled and `2` is disabled.
- Wait-setting delay levels are strict: `0` or `NULL` means immediate main-process execution without a durable task row; `1 = 1s`, `5..14 = 1..10m`, `15 = 20m`, and `16 = 30m`. Other unknown nonzero levels do not trigger automation.
- Fixed tasks are queue unpaid cancellation 15 minutes after `food_order` creation and table-channel fallback completion three days after successful payment.
- Terminal scheduled-order-task history has a seven-day retention period. Cleanup runs at authenticated scheduler startup and every 24 hours thereafter in batches of at most 1,000; PENDING and RUNNING tasks are never included.

## Context Strategy

- Start with `.codex/context/*.md`.
- Use `rg` to locate relevant source in this repository, then in the online front-end or backend API source when needed.
- Read narrow source slices rather than whole directories.
- Summarize reusable findings back into `.codex/context/`.

## Suggested Source Reference Layout

If source-level lookup becomes common, use one of these patterns:

- `external/online-frontend/`: `swifood-cashier-ipad-h5` read-only source copy, submodule, or symlink.
- `external/backend-api/`: `phpay-food` read-only source copy, submodule, or symlink.

Recommended mapping:

```text
external/
  online-frontend/ # online front-end source, read-only reference
  backend-api/     # backend API source, read-only reference
  README.md        # local notes about how these references are connected
```

Do not edit files under `external/online-frontend` or `external/backend-api` unless the user explicitly changes the rule.

## Implementation Checklist

Before editing the offline Windows cashier for behavior that may depend on the references:

1. Read `current-work.md` and `decisions.md`.
2. Inspect this repository's relevant implementation.
3. Check online front-end and backend API summaries for known behavior.
4. If needed, read targeted files from the reference projects.
5. Implement in this repository only.
6. Run focused verification.
7. Update context files with durable findings.

## Conflict Handling

When reference and offline Windows cashier behavior conflicts, record:

- What each source does.
- Which behavior the offline Windows cashier now follows.
- Why that choice was made.
- Any migration or compatibility risk.

## Offline Sync Endpoint Rule

- Offline sync endpoints such as `/cashier-api/cashier/offline/sync/**` are not present in the currently available backend source checkout by design.
- Missing backend source for these endpoints should not block offline Windows cashier implementation.
- Use user-provided API docs/screenshots, observed responses, and existing offline cashier sync code as the primary contract references for offline sync behavior.
- The `order_payment` field is always an array in all four order-sync contracts: server-to-local single/page sync and local-to-server single/batch upload. Query and transfer every row actually stored for the `order_inner_no`; do not filter for a required transaction type or collapse the array to one record.
- A successful payment first persists a deferred pending-order fallback. After local payment post-processing, rebuild the complete sync payload from SQLite and upload that final snapshot; never rely on the earlier payment-mutation object because receipt printing may append `order_payment.system_transaction_no` later.
- Pending-order upload success may delete a task only when its stored payload still matches the version actually uploaded. A newer payload written during an in-flight upload must remain queued.
- Server-to-local batch and single-order sync responses do not contain `waiter_clock_order`; order pull synchronization must leave this locally generated, append-only shift attribution table unchanged.
- After a local order mutation commits, persist its sync payload locally and run ordinary server upload in the background; upload timeouts and failures must not block UI navigation or completion of the local action.
- Keep an upload in the foreground only when the next online-only API call has a strict server-side dependency on that upload, such as online payment creation.

## Local Permission Mapping Rule

- `restaurant_waiter` stores local waiter/user rows.
- `sys_user_role.user_id` maps to `restaurant_waiter.id`.
- `sys_user_role.role_id` maps to `sys_role.id`.
- `sys_role_permission.role_id` maps to `sys_role.id`.
- `sys_role_permission.permission_id` maps to `sys_permission.id`.
- Backend offline permission sync is expected to return permission ids that are used by `sys_role_permission.permission_id`.
- Therefore `sys_permission.id` should be treated as the backend permission id unless a future schema explicitly adds a separate `server_id`.
- If historical local data has `sys_permission.id` as local autoincrement values instead of backend ids, permission sync must reconcile or migrate those rows carefully; otherwise role-permission joins can fail.

## BillOut Amount Calculation Rule

- BillOut calls `/tax/order/amount` only for online voucher calculation and binding.
- PWD/SC always uses the offline Windows cashier's local calculation and the current restaurant's latest applicable BIR configuration.
- Regular and manual-order PWD/SC both go through `usePwdScDiscount`; do not add a server amount preview or before-meal PWD/SC revalidation call.
- PWD/SC ID reuse is limited by the current restaurant and local natural day in independent groups: PWD types `1/3` share one limit and SC types `4/5` share another. The same ID text may be used once in each group; a refunded use still consumes the ID within its group for that day.
- Local PWD/SC payment creation must persist both `order_payment_tax.pwd_discount` and `order_payment_tax.less_vat`. For historical local PWD/SC rows where `less_vat` is `NULL`, detail and Product Summary may use `vat_exemption` as the compatibility value.
- `/tax/order/amount` expects `order_channel` from backend `ChannelCategoryEnum` (`1` table/customer, `4` queue/wait), not manual-order/report `OrderChannelEnum` values such as Grab `4`, Foodpanda `5`, ShopeeFood `6`, GoFood `7`, or Others `99`.
- Voucher amount requests must always include `custom_service_fee`.
- When service fee is closed, queue-order service fee is not applicable, or custom service fee is not active, send `custom_service_fee: 0` instead of omitting the field.
- Send `custom_service_fee_type` only when custom service fee is active and a type has been selected.

## Renderer IPC Error Display Rule

- Preload exposes `window.api` through `wrapApiErrors` so rejected IPC promises remove Electron's `Error invoking remote method 'channel': Error:` prefix before reaching renderer code.
- Renderer pages can continue to display `error.message`; IPC-specific wrapping text should not appear in user-facing messages.
- New preload API modules should be attached through `customApi` in `src/preload/modules/index.js` so this cleanup remains global.

## End-Of-Day Report Save Rule

- BIR and E-Journal downloads must use a native main-process save dialog so the user chooses the final save path.
- E-Journal GBK txt bytes are written in the report IPC handler from the generated hex payload; renderer code should not trigger browser-style downloads for this page.
- BIR xlsx generation remains in the report DB manager, but the report IPC handler owns final save/cancel behavior and returns the chosen path to the renderer.

# Offline Device Compatibility

- `POS01` is the backend's virtual marker for online orders and online aggregate data; it is not a physical offline Windows POS.
- The standalone cashier has no account-to-POS binding and must not use `device_no` as an authorization, isolation or lookup condition.
- Preserve old `device_no` values only when reading historical snapshots for display. New local records leave the field null, and reporting/BIR logic remains restaurant-scoped.
- When migrating backend behavior, preserve formulas, time ranges and status rules, but omit backend POS isolation because this project intentionally has no terminal-binding workflow.

## Offline Order Detail Transaction ID Rule

- Offline Orders detail maps `order_payment.system_transaction_no` to each payment item's `transaction_id` field; the original payment-channel `transaction_id` remains available as `channel_transaction_id`.
- `system_transaction_no` is local SQLite `TEXT` and may contain one number or multiple comma-separated numbers. The detail IPC response returns these values as a trimmed string array so leading zeroes are preserved; null, empty, or delimiter-only values return `[]`.
