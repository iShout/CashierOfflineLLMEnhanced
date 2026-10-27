# Current Work

## 2026-10-27: POS Device Isolation Removed

- Authentication now creates only an account-and-restaurant session. Renderer persistence, route guards, preload/IPC and main-process session state no longer contain `deviceNo`, and the obsolete local POS binding source/schema has been removed.
- Order lookup, Agent tools, PWD/SC reuse checks, scheduled tasks, attendance, reports, BIR configuration and mall certification now use restaurant scope without `device_no` filters.
- New local orders, payments, refunds, clock records, report snapshots and scheduled tasks no longer write a POS number. Existing `device_no` columns remain only as nullable historical metadata so old receipts and exports can still display their original source when present.
- Startup migration removes the obsolete `local_device_binding` cache table and rebuilds legacy tables whose `device_no` column is required/defaulted, including `order_payment`, `restaurant_waiter_clock_record`, `restaurant_report_print`, `scheduled_order_task` and `restaurant_operation_config`; the obsolete payment restaurant/device index is dropped.
- Agent `get_order_detail` is guarded by the current login and restaurant only, fixing historical orders that were hidden when their saved POS differed from the former local binding.

## 2026-10-26: Agent Merged Into The Cashier Application

- `agent/` is a root-level feature module. Its former `src/` files now live directly in `agent/`; the separate package, lockfile, tsconfig and node_modules were removed. All dependencies use the cashier root package/lockfile.
- Root commands: `npm run agent:dev -- "今天营业额多少？"` and `npm run agent:check` (`tsconfig.agent.json` retains strict Agent checking).
- `agent/run.ts` is the shared CLI/main-process entry; it returns serializable `{ answer, trace }`. Main IPC `agent:ask` is exposed as `window.api.agent.ask(question)` and requires a cashier login session.
- The authenticated renderer now mounts a global floating Smart Assistant in `AppLayout`. It keeps an in-memory conversation while navigating cashier pages, calls `window.api.agent.ask(question)`, and shows pending, success, empty-answer, and error states. The current IPC remains request/response; streaming is intentionally deferred until the main/preload contract exposes request-scoped incremental events and cancellation.
- `agent/.env` is preserved. DeepSeek remains `deepseek-flash`, non-thinking, official Chat Completions API. Main-process model code loads only on explicit requests. Packaged configuration uses `userData/agent.env` or environment variables; Agent source and developer `.env` are excluded from packaging.
- Real-data learning step 3.1 is complete for order detail: `get_order_detail` reuses `getOrderDetailByInnerNo`, enforces the current session and restaurant boundary, and is the only tool currently registered with the Agent. The earlier mock sales/detail/ranking tools and demo data are no longer present.
- Next Agent follow-up can either add more read-only tools through existing cashier business methods or add true streaming to the chat IPC. Do not create another SQLite database/schema or duplicate cashier business logic.
- Verification at the 2026-10-26 merge point: Agent checks, mock tool cases, stubbed model/tool loop, preload/IPC/session guard, and production build passed. No real model request was sent; database and SQLite native binary hashes were unchanged.
- Chat UI verification: production build, targeted ESLint, Ant Design usage/accessibility lint, and touched-file mojibake scan passed. `agent:check` still reports existing nullable/type errors in the cashier DB manager files; this renderer-only change introduced no TypeScript diagnostics.

## 2026-10-23: Standalone Offline Cashier

- The user explicitly approved clearing Git metadata and removing online and hardware-printing features while retaining all other local cashier behavior.
- Login validates SQLite accounts only and establishes an account-and-restaurant session. No POS identifier is restored or bound; missing local account/menu data must be prepared locally, without a server-sync fallback.
- Removed API transports, online payments/vouchers, network monitoring, all data-sync modules, upload queues, daily sync scheduler, USB/label/receipt/kitchen printing, printer configuration, driver resources, and printer-based cash drawer control.
- Local cash/manual orders, PWD/SC/custom discounts, order actions, attendance/shift flows, scheduled local order transitions, reports, digital receipts, E-Journal, BIR, and mall exports remain.
- Existing business data is preserved. Legacy columns/tables and receipt snapshot/text helpers needed by local previews/exports remain for compatibility; no runtime uploader or printer consumes them.
- Electron blocks external HTTP/HTTPS/WS/WSS requests. Development permits local Vite/HMR connections.
- Old dist artifacts and repository Git metadata are removed. No replacement Git history or initial commit is created.

Verification:

- Production build and macOS unpacked packaging passed.
- Real Electron startup and local-account login into the cashier passed without external requests or renderer errors.
- Disposable-database integration checks passed for local login/POS, clock/shift, cash payment, pickup/serve/complete, cancel/refund, manual orders, table clear, local photos, summaries, EOD/digital preview, E-Journal and BIR generation; no upload-outbox writes occurred.
- Fresh-schema/IPC registration, 170 IPC references, dependency removal, touched-file encoding scan and whitespace checks passed.
- TypeScript retains five baseline errors; baseline React Hooks/static-feedback warnings remain. Windows installation/hardware validation was not performed in this macOS environment.
- Follow-up: removed the BIR/POS selection modal, binding write API, EOD notification query/acknowledgement APIs and startup daily-report modal. Historical EOD generation remains silent in the background; report pages and exports remain.
- Follow-up verification: build, targeted ESLint/Ant Design checks, 162 IPC references, POS resolver cases (no BIR/no binding, POS01 exclusion, no writes, missing-data handling), and real Electron login without BIR/binding all passed. The login enters the cashier directly with no entry modal, external request or renderer error. The same five baseline TypeScript errors remain.
- Current source directory is /Users/wayne/my/swifood-cashier-offline (renamed by the user).
- See OFFLINE-CLEANUP.md and README.md for scope and local-data prerequisites.
