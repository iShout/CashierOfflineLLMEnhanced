# Decisions

## 2026-10-27: Restaurant Scope Supersedes POS Device Isolation

- The user explicitly removed account-to-POS binding from the standalone, Agent-focused cashier. Authentication and route access require a valid local account and restaurant only.
- `device_no` must not be used to authorize, isolate, filter or group local orders, discounts, scheduled tasks, attendance, BIR configuration, reports or mall exports.
- New local records do not generate a POS number. Legacy columns remain nullable only to preserve old database rows and optional historical receipt/report labels; the obsolete local binding module/schema and existing cache table are removed.
- Existing databases are migrated without deleting business records: affected tables are rebuilt with nullable device columns, while report/task keys and queries use restaurant plus their existing business identifiers.
- This decision supersedes all earlier offline decisions that required restoring a real POS identity or replacing backend `POS01` filters with a local terminal number.

## 2026-10-27: Agent Chat Uses The Existing Request/Response IPC First

- The authenticated `AppLayout` owns one floating Agent entry so it is available across cashier pages but never appears before login.
- Renderer conversation history is session-memory UI state. Each question uses the existing protected `window.api.agent.ask(question)` bridge and displays a pending assistant message until the complete `{ answer, trace }` result returns.
- Do not simulate streaming from a completed answer. True streaming is deferred until main and preload expose request-scoped incremental events, cleanup/cancellation, and session-change guards for the full stream lifecycle.

## 2026-10-26: Agent Is A Feature Module With Shared Business Logic

- The user explicitly superseded the independent Agent subproject design: retain the root `agent/` folder but use one root package, lockfile and dependency installation for the cashier application.
- Agent tools and existing IPC handlers must share cashier business methods; `ipcMain.handle` registration is not itself a reusable business interface. Preserve login, restaurant and permission checks when selecting shared entry points.
- Do not recreate business tables, seed a parallel cashier database or duplicate financial calculations for Agent learning. Initial real integration is read-only; mutation learning comes later with explicit confirmation and test data.
- Agent uses Node-side cloud model requests; existing cashier renderer network restrictions remain in place. Sharing a package does not require running LLM code in the renderer or changing cashier transaction behavior.
- Tutorials remain in chat and focus on Agent mechanisms. The next tutorial must reflect the migrated module layout; the old step-3 standalone SQLite tutorial is superseded.

## 2026-10-23: Remove Login BIR Binding And Entry EOD Notification

Superseded on 2026-10-27 for POS restoration and isolation: login no longer resolves any terminal identity, and business data is restaurant-scoped.

- Login no longer presents POS/BIR selection or writes a binding/BIR configuration association. Existing mappings are read only; absent a matching machine mapping, restore the most recent restaurant-local terminal from legacy mappings/business history, with existing local configuration as the final fallback. Always exclude `POS01`.
- Preserve the real device number required by local orders, numbering and reports. Missing local data remains a clear login error; no artificial default terminal is created.
- Remove the EOD startup notification/list/acknowledgement flow. Preserve silent historical EOD generation so reporting cycles, BIR exports and manual report actions remain intact.

## 2026-10-23: Pure Offline Architecture Supersedes Online And Printing Flows

- User-approved scope removes every server-dependent feature and hardware printing rather than retaining disabled network/print adapters.
- Preserve SQLite business logic and existing business data, including schema compatibility and receipt text/snapshots used by digital previews, E-Journal and reports.
- Use local accounts and automatic local POS identity restoration; never manufacture a default POS or fall back to `POS01`. A prepared local database is required; empty-store provisioning was not added.
- Cash payment and local commits are completion boundaries. No upload, sync queue, auto-print or printer cash-drawer step follows them.
- Keep EOD persistence/auto-generation and report preview/export independent of physical printing.
- Earlier decisions about server sync, online payment, vouchers, and physical printer behavior are historical reference only and must not reintroduce the removed modules.

## 2026-08-07: Offline Order Amounts Prefer Final Payment Snapshots

Decision:

- Offline Orders treats `order_payment.real_service_fee` and `real_tax_amount` from the successful final payment as the authoritative paid whole-order amounts.
- When no successful payment snapshot exists, service fee, tax amount, and packaging fee are summed from every non-cancelled `food_order` sharing the same `order_inner_no`.

Reason:

- Main and additional orders persist their own proportional fee amounts. Reading only the master row shows a partial fee even though the product list and paid total represent the whole order group.

Impact on offline Windows cashier:

- Paid detail summaries reconcile with BillOut and the payment record; unpaid/list fallbacks no longer omit added-order fees.

## 2026-08-07: Physical Reprints Share A Ten-Reprint Limit

Decision:

- End-of-Day, End-of-Shift, and Summary-of-Products use the persisted successful report `print_count`: count `0` is the original print without a reprint header, and prior counts `1..10` produce `REPRINT 1..10` using the Payment/Refund header layout.
- A report is capped at eleven successful physical prints in total: one original plus ten reprints.
- Payment/Refund manual reprint counters represent successful USB output only and are capped at ten; automatic Payment/Refund printing remains outside those manual counters.
- Order and Kitchen retain their existing print-count semantics but cap manual reprints at ten.
- All seven limits use the shared `MAX_RECEIPT_REPRINT_COUNT` constant so a later limit change has one source of truth.
- Preview generation may show the header for the next physical reprint but never mutates a counter.

Reason:

- Report printing has no automatic first-print event comparable to Payment/Refund, so its initial manual print is the original rather than `REPRINT 1`.
- Persisting counters only after printer success prevents failed or unavailable-printer attempts from consuming the regulated reprint allowance.

## 2026-08-06: Scheduled Order Work Is Main-Process Owned And Database-Backed

Decision:

- `scheduled_order_task` is the durable source of truth; an in-memory timeout is only the next wake-up signal and is rebuilt after inserts, cancellations, execution, login restoration, synchronization, and system resume.
- Scheduled order actions execute in the main process through idempotent domain mutations rather than depending on a mounted renderer Hook.
- Completed and skipped task rows remain as audit evidence instead of being deleted immediately; transient execution failures remain pending with bounded exponential backoff.
- Queue unpaid cancellation is due 15 minutes after order creation. Queue Taken-to-Ready uses `dining_out/dining_out_time`, queue Ready-to-Complete uses `completion/completion_time`, and only table-channel paid unfinished orders are force-completed three days after successful payment.
- The normal cashier payment transaction remains responsible for Pending-to-Taken; the scheduler must not add a second automatic acceptance step.
- Manual state transitions explicitly cancel superseded PENDING tasks by `restaurant_id + order_inner_no`; RUNNING tasks are not forcibly interrupted and must finish through the idempotent state guard.
- SUCCEEDED, SKIPPED, CANCELLED, and terminal FAILED task rows are physically deleted after seven days. This best-effort maintenance is intentionally a separate startup-plus-daily main-process timer rather than a durable order task; it never deletes PENDING or RUNNING rows.

Reason:

- Renderer pages and Hooks may not be mounted when a task expires, while the main process owns SQLite and the order transactions.
- Persisted status, leases, and idempotent state checks allow recovery from application exit between the order commit, sync-queue write, and task completion update.
- A single recalculated timeout handles task insertion and cancellation without maintaining one timer per order.

## 2026-08-06: Order Inner Number Is The Whole-Order Display And Receipt Boundary

Decision:

- Offline Orders detail and whole-order receipt/preview paths aggregate active dishes from every main/additional `food_order` sharing the same `order_inner_no`.
- Active dishes require both a non-cancelled parent order and `order_detail.detail_type = 1`; cancellation/reduction rows are never added as positive receipt items.
- A print request with an explicit `order_no` remains a child-order print, while a request containing only `order_inner_no` is a whole-order print.

Reason:

- After-meal additional orders are separate `food_order` rows but belong to the same customer settlement and payment/refund evidence.
- Automatic Order/Kitchen printing at the moment an additional order is placed must show only new dishes, while Bill/Payment/Refund and later whole-order reprints must show the complete settled order.

## 2026-08-06: Server Cash Confirmation Is The Online Cash UI Success Boundary

Decision:

- After `POST /cashier/order/cashReceived` succeeds, the online Cash Received modal must resolve and close without waiting for order pull, local finalization, coupon snapshot, printing, or final replication.
- Server-confirmed payment immediately clears the renderer's pending-payment confirmation state so a later local reconciliation failure cannot offer Cash Received again.
- Local reconciliation remains ordered but runs detached with bounded retries; failures are logged and left to normal synchronization recovery instead of being shown as payment failure.

Reason:

- Server cash confirmation is irreversible. Keeping the confirmation modal open because a later local step failed invites a duplicate request whose only possible result is an already-paid error.
- Ant Design method modals stay open when their `onOk` promise rejects, so post-commit work must not remain in that promise.
- Order pull, local SI/pickup finalization, snapshots, printing, and replication are compensatable operations and must not redefine the result of the payment itself.

## 2026-08-05: Local Order Commit Is The UI Success Boundary

Decision:

- Ordinary order replication to the server must not remain in renderer business-action `await` chains after the local transaction succeeds.
- The complete sync payload is persisted in `pending_order_sync`; online upload is then triggered in the background and failures stay available for later retry without blocking navigation or showing a failure notification.
- A server call may remain awaited only when the next online-only operation has a true server-side dependency, such as creating an online payment for an order the server does not yet have.

Reason:

- The offline cashier's primary source of continuity is the committed local order. Network latency or a 15-second upload timeout must not make a successful local order look like a failed Bill Out action.
- Persisting the retry payload before upload preserves eventual synchronization without coupling UI progress to server availability.

## 2026-08-05: End-of-Day Refunds Separate Sales From Service Charge

Decision:

- End-of-Day refund sales use `food_order.total_amount - food_order.service_fee`; Gross Amount and Less Refund therefore never include service charge.
- A same-period refund is already excluded from the successful-order service-fee sum and must not be deducted twice.
- A refund whose original sale completed before the report period explicitly subtracts `real_service_fee` from Service Charge Amount and Total Service Charge.

Reason:

- Service charge is reported in its own section, so adding it back through a refund would make Gross Amount cease to represent sales.
- Local cash and online payment records do not share one stable `order_payment.amount` meaning, while the order total and order service fee have a consistent reporting meaning.
- Refund service charge must reverse the original charge while preserving correct results when sale and refund timestamps fall in the same report range.

## 2026-08-05: Bill Receipt Uses A Dedicated Discount-Aware Total

Decision:

- Bill Receipt no longer reuses Order Receipt amount rows.
- PWD/SC amounts use `pwdDiscount` with `discountAmount` as fallback and retain a separate `LESS VAT` row; all non-PWD/SC discounts use one `Promo Discount` row sourced from `promoDiscount` with `discountAmount` as fallback, plus Voucher amount.
- Bill Total Amount is the displayed gross amount minus the displayed Promo, PWD/SC, and Less VAT deductions.

Reason:

- Persisted ordinary-discount payments normally store the same value in both `order_payment.discount_amount` and `order_payment_tax.promo_discount`; summing them would double-count the discount.
- Order Receipt has different business requirements and must not gain Bill-only discount rows.

## 2026-08-05: Receipt Language Follows The Target Printer Configuration

Decision:

- Order, Bill, Payment, and Refund receipts derive `PrintOrderBo.chinese` from the current Receipt printer's `language`; Kitchen derives it from the Kitchen printer as before.
- The Chinese template translates the same business-facing fields as backend `PrintHandlerChineseImpl` while retaining English BIR/tax identifiers, receipt titles, SI/TRANS/ORDER ID labels, legal statements, and company footer.
- E-Journal generation uses the same current printer language projection. Report receipts stay English because the backend Chinese handler inherits the common English report templates without Chinese overrides.

Reason:

- Printer language is runtime device configuration and must override historical `chinese` values persisted in order print snapshots.
- Matching the backend's selective translation boundary avoids changing regulated receipt wording and keeps online/offline output compatible.

## 2026-08-05: Data Sync Serial Number Uses A POS Selection Fallback

Decision:

- Data Sync keeps `bir_info.serial_number` as its primary Serial Number source.
- When that value is unavailable before first synchronization, it displays the selected POS device's `serial_number`, temporarily held in Zustand as `selectedPosSerialNumber`.
- The fallback is session-only and is cleared by logout; it is not added to persisted Zustand storage.

Reason:

- The POS selection API already provides the machine serial number, while a new account may not yet have synchronized local BIR data.
- A dedicated fallback preserves the existing BIR-first behavior without making the initial display depend on local restaurant records.

## 2026-08-05: Queue Labels Print After Payment

Decision:

- Queue orders retain the rule that `take_food_no` is allocated only inside successful-payment finalization.
- Their first automatic label print runs after that transaction and snapshot refresh, so the label includes the pickup number.
- Ordinary before-meal table orders keep printing labels immediately after local order creation because they do not use pickup numbers.

Reason:

- Allocating pickup numbers at order creation would consume numbers for abandoned or failed payments and weaken the existing successful-payment sequence invariant.

## 2026-08-05: PWD/SC Customer Fields Are Left-Aligned

Decision:

- Payment/refund `PWD NAME`, `PWD ID`, `SC NAME`, and `SC ID` rows are left-aligned with the other CUSTOMER INFORMATION fields.
- The discount customer name follows the `PWD/SC NAME:` label on the same line and wraps from the same left edge only when the complete row exceeds the receipt width.
- Digital Copy renders the shared receipt text as a fixed 32-column monospace block on a canvas wide enough to retain both horizontal margins, so alignment matches the physical receipt without clipping the right edge.

Reason:

- Centering only these labels and values made the PWD/SC customer block inconsistent with `VALID THRU`, `ADDRESS`, `TIN`, and `SIGNATURE`; the former image renderer also re-centered every generated line and hid the template correction in previews.

## 2026-08-05: Payment/Refund BIR Header Separates Distinct Names

Decision:

- When Trade Name and Tax Payer are both present and differ, the payment/refund header prints Trade Name, the fixed text `Owned and Operated By`, and Tax Payer as three consecutive lines, followed by one blank line.
- When both names are the same, the header prints the name only once.

Reason:

- The ownership text is a required header line, and only the completed three-line ownership block is separated from the address below it.

## 2026-08-05: End-of-Day Discounts Use The Persisted Payment Enum

Decision:

- End-of-Day PWD classification uses `PWD_SC_ALL = 1` and `PWD_SC_PEOPLE = 3`; ordinary discount uses `CUSTOM = 2`; SC uses `SC_ALL = 4` and `SC_PEOPLE = 5`.
- The report implementation must reference the shared local constants instead of duplicating numeric literals in its classification branches.

Reason:

- The former End-of-Day branches had types `1` and `2` reversed, so whole-order PWD was added to Other Discount and an ordinary discount was treated as PWD. SC was unaffected because its `4/5` mapping was already correct.

## 2026-08-05: Cashier Report Payment Received Uses Channel Real Amount

Decision:

- Cashier Report `paymentReceived` reuses the sum of `channelSettlementReports.transactionAmount`, exactly matching the payment-type table's `Total Amount`.
- The amount therefore comes from successful payment `real_amount`; order-level discounts are not added back into received payments.

Reason:

- Summing `food_order.total_amount` reported the pre-discount order amount and diverged from both the actual payment and the payment-type table.
- Sharing one aggregate prevents the two displayed totals from drifting again.

## 2026-08-05: Refunds Never Consume The SI Sequence

Decision:

- `local_setting.next_receipt_no` is consumed only when a positive payment reaches successful finalization; creating an unpaid payment record does not reserve an SI.
- A refund `order_payment.receipt_no` preserves the original successful payment's SI for `ORIG.SI#` and never advances `next_receipt_no`.
- Refund numbering is exclusively handled by `order_payment.refund_serial_no` from `local_setting.next_refund_serial_no`.
- Previously consumed SI gaps are not reclaimed, preserving the invariant that an issued sequence never moves backward or gets reused.

Reason:

- Refunds are reverse transactions with a dedicated serial and must not create gaps in the forward sales-invoice sequence.
- Delaying SI allocation until payment success prevents failed or abandoned payment attempts from consuming invoice numbers.

## 2026-08-05: Payment/Refund Reprint Count Represents Prior Manual Reprints

Decision:

- `paymentPrintCount` and `refundPrintCount` are persisted counts of prior manual reprints; the receipt being generated displays the persisted value plus one.
- A manual payment/refund print is identified by `print_source = manual`, so the first manual print displays `REPRINT 1` even when no prior receipt print id exists.
- Payment-like receipt time rendering combines split `orderDate` and time-only `orderTime` values before applying the `YYYY/MM/DD HH:mm:ss` display format.

Reason:

- Receipt text is generated before the successful print count is persisted, so displaying the stored value directly produced `REPRINT 0` on the first manual payment reprint.
- Refund print-id existence does not reliably describe whether the current request is a manual reprint.

## 2026-08-05: End-of-Day Service Charge Is Separately Reported And Not Taxed

Decision:

- Offline End-of-Day reports expose the actual service fee through `serviceFee` and `totalServiceFee`; `serviceFeeTax` is always zero.
- Gross/NET/current accumulated sales exclude the service fee because it is reported separately.
- Taxable sales and tax amounts continue to come from `order_payment_tax`. NON-VAT subtotal calculation still explicitly removes the actual order service fee before applying percentage tax.
- `cancelled` and `lessCancelled` are fixed at zero; cancelled orders do not contribute an amount to the End-of-Day report.

Reason:

- Service Charge Amount and Total Service Charge must remain visible for payment reconciliation, but the service fee must not produce Service Charge Tax.
- This matches the referenced backend report structure: it subtracts `food_order.service_fee` from sales, reports the fee separately through `serviceFee`/`totalServiceFee`, and leaves `serviceFeeTax` at zero.
- Cancelled orders never enter Gross or NET sales, so separately reporting their pre-cancellation order value would be misleading for the offline EOD requirement.

## 2026-07-31: Offline Accumulated Sales Uses Current-POS Gross Orders

Decision:

- Offline End-of-Day accumulated sales is calculated directly from completed `food_order` rows for the currently bound POS, starting at the approved BIR audit time when present.
- Fully refunded orders remain part of accumulated Gross Sales because their refund is represented separately by `Less Refund`; excluding them makes the accumulated-sales fields internally inconsistent and can create a negative past balance.
- Do not depend on backend `order_summary` for this local calculation because the offline device does not run the backend summary-generation job.

Reason:

- Backend `salesOfTheDay` is Gross Amount and includes the original sale of refunded orders, while its direct current-day accumulated query excludes fully refunded status. Applying both rules literally caused `pastAccumulatedSales` to equal the negative refund amount.
- The BIR relationship must remain `presentAccumulatedSales = pastAccumulatedSales + salesOfTheDay`, with refunds deducted separately from net sales.

## 2026-07-31: Offline Windows Application Identity

Decision:

- The packaged application is identified as `Swifood Cashier Offline` with app id `com.swifood.cashier.offline.windows` and executable name `swifood-cashier-offline`.
- The npm package name is `swifood-cashier-offline`; Windows shortcuts, uninstall entries, installation paths, and Electron user-data paths use the Offline product identity.
- The new identity intentionally does not reuse the former `Swifood Cashier` user-data directory, preventing unrelated cashier applications from sharing the local SQLite database and credentials.

Reason:

- A separate application and product identity allows the offline Windows cashier to coexist with another `Swifood Cashier` installation without installer, shortcut, updater, or local-data collisions.

## 2026-07-27: End-of-Day Order Numbers Separate Storage From Presentation

Decision:

- `restaurant_report_print.report_json.orderNos` and `refundOrderNos` are persistence and sync fields; they always contain `order_inner_no`.
- End-of-Day SI/refund ranges are presentation fields; receipt generation and BIR export resolve persisted internal order numbers to `order_payment.receipt_no` or `refund_serial_no` only while reading.
- Every report write boundary, including server report sync and startup migration, must enforce the persistence rule. Presentation conversion must never be written back into `report_json`.

Reason:

- Using one array for both database identity and printed serial numbers caused local generation, report sync, and receipt rendering fixes to overwrite each other's semantics.
- A fixed write invariant plus read-only presentation projection prevents receipt-number regressions without changing backend-compatible report snapshots.

## 2026-07-22: Attendance Sync Uses A Mapping Outbox

Decision:

- A pending attendance task stores only the local clock-record id; upload reads the latest completed clock, allowance, and withdrawal rows when it runs.
- The clock, allowance, and withdrawal tables separate local primary keys from nullable server ids.
- End-shift upload is silent and capped at 6000 ms. Manual Attendance sync uses the normal HTTP timeout and uploads before server pull.
- The batch endpoint is treated as atomic: the selected queue rows are deleted only when the entire request succeeds.
- Clock-in and clock-out photos stay on the device and are not uploaded.

Reason:

- A shift row changes throughout clock-in, rest, and clock-out, so an id mapping avoids stale queued payloads.
- Durable outbox rows preserve failed offline uploads without blocking cashier sign-out.

This file records durable decisions so future Codex conversations can recover project history without reading old chats.

## 2026-06-02: Long-Term Reference Context Strategy

Decision:

- The offline Windows cashier remains the only editable workspace.
- `swifood-cashier-ipad-h5` (`/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5`) is a read-only reference for online front-end behavior.
- `phpay-food` (`/Users/wayne/paycools/swifood/back-end/phpay-food`) is a read-only reference for backend API contracts and business rules.
- Durable cross-project knowledge should be summarized in `.codex/context/` instead of pasted into chat.
- Source-level reads from the reference projects should be targeted and performed only when summaries are insufficient.

Reason:

- Avoid filling Codex conversation context with entire reference source trees.
- Make new Codex conversations recover important background by reading project files.
- Preserve a clear edit boundary so reference code is not changed accidentally.

Open follow-up:

- Continue summarizing the most important online front-end flows into `online-frontend-summary.md`.
- Continue summarizing the most important backend API contracts into `backend-api-summary.md`.
- Decide whether to use absolute paths, read-only symlinks, submodules, or source copies for `external/online-frontend` and `external/backend-api`.

## 2026-06-02: Use Descriptive Reference Names Instead Of Letter Aliases

Decision:

- Use `online-frontend-summary.md` for the online front-end source.
- Use `backend-api-summary.md` for the backend API source.
- Use project names or roles in prose: `swifood-cashier-ipad-h5`, `phpay-food`, online front-end source, backend API source, and offline Windows cashier.

Reason:

- Letter aliases are too implicit for long-term project memory.
- Descriptive names are easier for future Codex conversations and humans to understand without reading old chat history.

Impact on offline Windows cashier:

- All project-level Codex context now points to descriptive file names and source names.

## 2026-06-03: Voucher Binding Uses Online Backend, Local BillOut Keeps Amount Model

Decision:

- Voucher use remains online-only.
- Offline Windows cashier calls backend `/cashier-api/tax/order/amount` to validate and bind vouchers, but only consumes voucher-specific fields such as `discount_amount` for local BillOut rendering.
- BillOut continues to compute subtotal, service fee, VAT, and final total in the renderer.
- When the app is online, payment-order creation uses backend `/cashier/order/payment/create` even for cash/offline payment channels, so backend cash-received flow can write off bound vouchers.

Reason:

- Reuses backend voucher validation, binding, and write-off logic.
- Avoids duplicating coupon-status, coupon-sku, restaurant applicability, and tax-include rules in the renderer.
- Minimizes disruption to the offline Windows cashier's existing local amount rendering model.

Impact on offline Windows cashier:

- Voucher list, voucher-code entry, and scan-code entry should share one online binding path.
- Local amount state should treat backend voucher amount as an input, not as a replacement for the whole backend amount calculation response.

## 2026-06-03: PWD/SC Binding Follows Voucher-Style Amount Input

Decision:

- Offline Windows cashier uses `/cashier-api/tax/order/amount` for PWD/SC validation and amount calculation when online.
- BillOut keeps its local amount model, but consumes backend-returned PWD/SC-specific fields: `discount_amount`, `tax_info.pwd_discount`, `tax_info.less_vat`, and VAT breakdown fields.
- PWD/SC payment creation carries the discount identity fields (`discount_nos`, `discount_number`, `discount_type`, `discount_validity_period`, `discounter_name`) so backend payment validation and reports can use the same data.

Reason:

- This matches the online frontend route while preserving the offline Windows cashier renderer architecture.
- Backend PWD/SC calculation includes both direct discount and VAT exemption/less VAT, so the local total must subtract both fields instead of using only the generic backend `real_amount`.

Impact on offline Windows cashier:

- PWD/SC, voucher, custom, and fixed discounts remain mutually exclusive in BillOut.
- PWD/SC remains online-only, consistent with current voucher binding and backend duplicate-use validation.

## 2026-06-04: Single Order Pull Sync Uses Existing Batch DB Writers

Decision:

- `SYNC_ONE_ORDER` is exposed under `window.api.orders.syncOneOrder(orderInnerNo)`.
- The main process calls `GET /cashier-api/cashier/offline/sync/order/data` with `orderInnerNo` and writes each returned table payload through the existing batch-order sync table writers.
- Renderer-side trigger logic is centralized in `useSyncOneOrderFromServer` instead of ad hoc page calls.

Reason:

- Batch sync already defines local upsert behavior for order, detail, payment, tax, print, and status tables.
- A small hook keeps online checks and error handling consistent across payment/status nodes.
- The endpoint is a pull-from-server reconciliation step, so it belongs behind IPC where DB writes and auth-bound server requests already live.

Impact on offline Windows cashier:

- Online payment creation and online cash received can refresh the local order from server state when `isOnline === true`.
- Local order upload to server does not immediately pull the same order back, because the pushed local payload is already the source data and a follow-up pull can create redundant traffic or misleading failure prompts.
- Main-process request or DB-write failures propagate through IPC to the renderer caller.

## 2026-06-05: Order Mutation Sync Direction Follows Mutation Origin

Decision:

- If an order mutation is created by the offline Windows cashier local DB transaction, the renderer should push the returned local `sync_data` to `/cashier/offline/sync/order` when online.
- If an order mutation is created by a cashier backend API call, the renderer should pull the order back through `SYNC_ONE_ORDER` after the backend call succeeds.

Reason:

- The system has two authoritative mutation sources. Pulling after a local mutation can overwrite or miss local-only rows before the server receives them, while pushing after a server mutation can send stale local state over the backend result.

Impact on offline Windows cashier:

- Local order creation, local cancellation, local cash-received, and local refund use `useSyncOrderToServer`.
- Online payment-order creation and online cash-received use `useSyncOneOrderFromServer`.
- Local cash-received and refund DB transactions return `sync_data` that includes changed `food_order`, `order_payment`, `order_payment_tax`, and `order_status_change` rows.

## 2026-06-04: Order Sync Uses Local ID And Server ID

Decision:

- Order sync tables use a dual-id model: local `id` remains the SQLite primary key, and server primary keys are stored in nullable `server_id`.
- Server-pulled rows are never inserted with server `id` as local `id`.
- During order sync, server parent ids are mapped to local parent ids before child rows are written.
- For synced orders, child tables are rebuilt from the server payload after the parent `food_order` local ids are resolved.

Reason:

- Offline-created rows are assigned local autoincrement ids before the server generates its own ids.
- Existing server orders pulled by batch sync also need local ids for local joins, UI, printing, reports, and offline operations.
- Keeping local id stable and storing server id separately prevents `UNIQUE(order_no)` conflicts and avoids breaking local foreign-key-style references.

Impact on offline Windows cashier:

- New databases create `server_id` columns on order sync tables.
- Existing development databases add `server_id` columns and unique partial indexes at startup.
- Because production has not started and existing data is disposable, clearing local data after this schema change is the preferred clean development path.

## 2026-06-04: First Login Data Sync Is Restaurant Scoped

Decision:

- First-login data sync is determined after login obtains the current restaurant id.
- The app checks whether `restaurant_waiter` has any waiter for that specific `restaurant_id`.
- A missing waiter for the current restaurant means the user should enter `/data-sync`.

Reason:

- A global `restaurant_waiter` empty check is incorrect when the local database may contain waiter data for a different restaurant.

Impact on offline Windows cashier:

- `window.api.app.isFirstLogin(restaurantId)` requires a restaurant id.
- Login and persisted-session startup refresh `isFirstLogin` using the current restaurant id.

## 2026-06-09: Data Sync Entry Uses Restaurant Table Presence

Decision:

- Login data-sync entry now treats local `restaurant` table presence as the primary "current restaurant has been synced" signal.
- After online login, the renderer passes backend `restaurant_no` plus any known `restaurant_id` to `window.api.app.isDataSyncRequired`.
- If `restaurant_no` is not found in local `restaurant`, the app enters `/data-sync`.
- Persisted-session startup can still fall back to checking local `restaurant.id` when only `restaurant_id` is available.
- Renderer state now uses `requiresDataSync` instead of the misleading `isFirstLogin` name.

Reason:

- Switching from an already-synced restaurant account to a never-synced restaurant account may not have a local `restaurant_id` mapping yet.
- In that state, checking waiter data by `restaurant_id` can be skipped or misleading, while `restaurant_no` is the stable backend identity available before sync.

Impact on offline Windows cashier:

- `RENDERER_VITE_FORCE_DATA_SYNC` remains an independent developer-only route guard path and was not changed.
- A missing local restaurant record for the logged-in backend restaurant forces the data synchronization page before table/menu screens.
- Renderer startup/session synchronization must also use `restaurant_no`; otherwise it can overwrite the login-page sync decision when local `restaurant_id` is still missing.
- When data sync is required, login skips local clock-in until after sync because local waiter/restaurant ids may not exist yet.
- Login session fields (`token`, `user`, `restaurantSetting`, `loginAccount`) must be written to the renderer store in one action so the store subscription never sees a partial "token without restaurant identity" state.
- `setRequiresDataSync` is idempotent; setting the same value should not notify subscribers and re-enter the data-sync requirement check.

## 2026-07-03: Data Sync Entry Also Requires Current Waiter

Decision:

- Online login data-sync entry also checks whether the current backend `waiter_no` exists in local `restaurant_waiter`.
- If the restaurant exists locally but the current waiter does not, the login is treated like a new-account login and enters the existing POS selection/data-sync flow.
- Login must skip local clock-in while `requiresDataSync` is true; data sync completion then hydrates the session from the newly synced local waiter.

Reason:

- A stale local database may contain the restaurant from an older account sync but not a newly created waiter.
- Restaurant presence alone is not enough for local cashier operations because clock-in, orders, reports, and permissions need local `restaurant_waiter.id`.

Impact on offline Windows cashier:

- New waiters for an already-synced restaurant no longer fail with `Login waiter id is missing.`
- The existing data-sync page remains the single refresh path for missing account/restaurant base data.

## 2026-07-07: Renderer Data Sync Entry Uses A Hook

Decision:

- Renderer nodes that need a full data sync should call `useEnterDataSync()` instead of directly mutating `requiresDataSync` and navigating.
- The hook marks `requiresDataSync = true` and navigates to `/data-sync`; the existing data-sync page still owns `syncAllInfos` and clears the flag after success.

Reason:

- Keeps the full-sync route entry reusable for login and future renderer-triggered sync nodes.
- Avoids scattering route and guard-state details across pages.

## 2026-07-09: Coupon Detail Uses Post-Payment Local Snapshot

Decision:

- Offline Windows cashier stores voucher detail in local `order_coupon_snapshot` rows keyed by `related_order = order_inner_no`.
- The snapshot is populated only after payment success by calling backend `GET /cashier-api/cashier/order/detail`, because coupon name/id/ticket/customer details are reliable only after backend write-off.
- Before calling backend order detail for this purpose, the main process checks local `food_order.coupon_code`, `food_order.coupon_amount`, and final `order_payment.coupon_amount`; orders without coupon use skip the request.
- Historical orders are not backfilled; old local data may only contain coupon amount and cannot reconstruct voucher detail.
- Order detail IPC reads `order_coupon_snapshot` and returns `coupon_snapshot_list` for renderer display under the operator field.

Reason:

- Local `food_order` / `order_payment` only retain coupon amount for some orders and do not include enough detail to match online Web order detail.
- A separate local snapshot supports future one-order-many-coupons without changing payment amount logic or order sync payloads.

## 2026-07-07: Daily Full Sync Uses Main-Process Scheduler

Decision:

- `data_sync_status.module` now includes a `FULL_SYNC` special record for the latest successful full data sync time.
- Full sync completion updates `FULL_SYNC`, `LAST_EVENT`, and every business sync module; module sync completion updates only that module and `LAST_EVENT`.
- The main process owns the daily full-sync timer and sends `sync:daily-full-sync-required` only after it determines a full sync is due.
- Renderer listens for that event and only calls `useEnterDataSync()` to enter the data sync page.
- Settings `Next Sync` displays today's `23:59:59`; this is a UI meaning rather than an exact representation of the internal timer.

## 2026-07-09: Megaworld Mall Certification Follows Windows Requirement Over Backend Gap

Decision:

- Megaworld mall certification settings default to `D:\Megaworld`, but the cashier can choose a custom save directory.
- The Mall Certification page shows the regenerate-file panel for SM, Parqal, and Megaworld, with a maximum inclusive date range of 7 days and no future dates.
- Local End-of-Day generation triggers mall certification output for both Parqal and Megaworld.
- Megaworld local generation writes S/H/D text files using backend-compatible sales/hour/discount logic, and also writes a Z-Reading SVG image file from the local End-of-Day report snapshot.

Reason:

- The corrected requirement says Megaworld defaults to `D:\Megaworld` but allows a custom save directory; every End-of-Day report should generate mall files, all supported malls need regeneration, and Megaworld needs a Z-Reading image file.
- The available backend `getOrderMegaWorldSales` source currently creates only S/H/D files, so the offline Windows cashier must fill the documented Z-Reading file requirement locally.

Reason:

- The SQLite sync-status source of truth lives in the main process, so the main process should decide whether the daily full sync is due.
- A dedicated `FULL_SYNC` record prevents single-module sync from masking the need for daily full sync.
- A single main-process timer avoids duplicate renderer timers across route changes or React remounts.

Impact on offline Windows cashier:

- If the latest full sync is not today, the scheduler notifies renderer immediately after the active session is ready.
- If today's full sync happened before `23:49:59`, the scheduler still triggers the `23:59:59` daily fallback.
- If today's full sync happened at or after `23:49:59`, the scheduler skips the same-day fallback and schedules the next day.

## 2026-07-07: Food Order Print Info Device Number Is Cloud Printer Only

Decision:

- `food_order_print_info.device_no` means the cloud printer device number, not the bound POS terminal `device_no`.
- The offline Windows cashier has no cloud printer binding, so newly generated local `food_order_print_info` rows write `device_no = NULL`.
- Existing historical dirty rows are not bulk-migrated; server-pulled rows keep the server payload value.

Reason:

- Other order/payment tables use `device_no` for the POS terminal, but this print-info table follows the backend/cloud-printer meaning.
- Writing the POS terminal number into this table creates misleading local sync data.

## 2026-07-08: Local Business Sequences Live In Local Setting

Decision:

- `food_order.order_serial_number`, `order_payment.refund_serial_no`, and `order_payment.system_transaction_no` are generated from `local_setting` sequence fields instead of scanning business tables for the latest value on every use.
- `local_setting.next_order_serial_number`, `next_refund_serial_no`, and `local_system_transaction_no` are nullable; `NULL` or empty means the current restaurant has not initialized that sequence yet.
- The main process uses a shared whitelist-based sequence helper so only known `local_setting` fields can be updated dynamically.
- Login/session setup initializes only the current restaurant's empty sequence fields. It seeds from current-restaurant local history when present, otherwise starts from `000...001`.
- Order sync advances local sequence floors when server-pulled order/refund serials are greater than the current local next value.

Reason:

- Business tables should store historical facts, not act as sequence generators.
- Local sequence fields make generation behavior consistent and avoid duplicate local numbers after old data, development data, or server-synced rows are present.
- The seed logic is safe to ship because it is idempotent and only moves next values forward.

Impact on offline Windows cashier:

- Local create-order transactions take `order_serial_number` from `local_setting.next_order_serial_number`.
- Local refund transactions take `refund_serial_no` from `local_setting.next_refund_serial_no`.
- Payment/refund receipt printing takes `system_transaction_no` from `local_setting.local_system_transaction_no`.
- Other restaurants in the same local database are not initialized or corrected until that restaurant is actually used.

## 2026-07-07: Full Sync Supports Explicit And Silent Modes

Decision:

- Renderer full sync now uses a shared `useFullDataSync` hook.
- Explicit mode is the default and powers the `/data-sync` page.
- Silent mode runs the same `syncAllInfos` and local DB write flow in the background, showing an antd notification with a spinning sync icon and total progress.
- Daily fallback full sync and pending daily sync consumption use silent mode.
- New-user/login-required base-data sync remains explicit by entering the data sync page.

Reason:

- Full sync business behavior must stay identical across visible and background entry points.
- A shared hook avoids two separate implementations for progress, session hydration, full-sync timestamp updates, and status refresh.
- Silent daily fallback should avoid taking the cashier away from their current workflow unless an explicit sync page is required.

Impact on offline Windows cashier:

- Silent sync errors keep the notification open with a red progress bar plus Cancel and Retry actions.
- Explicit sync errors keep the user on `/data-sync`, mark the total progress and failed module red, show inline error UI, and open an antd error modal with the error message.

## 2026-07-07: Full Sync Uses A Main-Process Order Write Lock

Decision:

- Full sync opens a main-process write lock while `syncAllInfos` is writing local data.
- Order flow writes and order-sync writes are registered through a guarded IPC wrapper in `orders.js`.
- Guarded order writes fail with `FULL_SYNC_IN_PROGRESS` while full sync is active.
- The main process broadcasts lock changes to renderer through `sync:full-sync-write-lock-changed`.
- Renderer stores the lock state as `isFullDataSyncing` for optional UI hints or targeted button disabling, but DB protection does not rely on UI state.

Reason:

- Local database writes ultimately happen in the main process, so the main process must be the final consistency boundary.
- A guarded IPC registration keeps the interception close to the write entry instead of scattering checks across every renderer button.
- Renderer UI can improve experience, while main-process rejection still protects data when UI paths are missed.

Impact on offline Windows cashier:

- During explicit or silent full sync, order creation, payment, cash received, status transitions, cancel/refund, single-order pull sync, print snapshot writes, and pending-order-sync task mutations are rejected.
- Read-only order queries and menu/table reads continue to work while full sync is active.

## 2026-06-09: Permission Sync Uses Server IDs

Decision:

- `sys_permission.id` must be the backend permission id.
- `sys_role_permission.permission_id` directly references `sys_permission.id`, so permission ids are not locally remapped during normal sync.
- Development databases with old local-autoincrement permission ids are disposable and should be cleared instead of migrated.

Reason:

- Permission tables are not edited locally; the server is the only permission source.
- Backend offline sync returns permission ids that are used by `sys_role_permission.permission_id`.
- Production correctness depends on storing backend permission ids from the first sync; development-only stale data should not add compatibility complexity.

Impact on offline Windows cashier:

- Switching to a new restaurant and running data sync should not fail on duplicate permission codes.
- Current restaurant role permissions can join to `sys_permission` directly through server-aligned ids.
- Existing development DBs that already contain old incorrect permission ids must clear local data before retesting sync.

## 2026-06-09: Online Payment Creation Does Not Frontend-Require Table UUID

Decision:

- BillOut no longer blocks online payment-order creation when `table_uuid` is missing.
- Online payment payloads include `table_uuid` only when the current order actually has a table uuid.

Reason:

- Queue/wait ordering flows do not have a table uuid, and renderer-side blocking prevented the payment API from deciding the correct behavior.
- Backend/API errors from `/cashier/order/payment/create` should propagate to the renderer normally instead of being replaced by a local preflight error.

Impact on offline Windows cashier:

- Table orders still send `table_uuid` to the payment-create API.
- Queue orders can reach the payment-create API without a front-end table uuid guard.

## 2026-07-01: Pending Order Server Sync Uses Restaurant-Scoped Outbox

Decision:

- Local-origin order server uploads are persisted in `pending_order_sync` before attempting `/cashier/offline/sync/order` or `/cashier/offline/sync/order/batch`.
- The outbox stores `restaurant_id`, optional `restaurant_no`, `device_no`, `order_inner_no`, and full `payload_json`.
- `payload_json` is SQLite `TEXT` and is not manually truncated, so multi-table order sync payloads can be retried intact.
- Login success adds a background "sync pending orders" node that drains only the current restaurant's pending tasks.
- Token-expired order sync failures are shown as login-expired recoverable failures; the task remains pending and is retried after login.

Reason:

- A token-expired sync is recoverable auth state, not an unrecoverable order failure.
- Keeping the full payload in a local outbox prevents sync data loss across login redirects, page unmounts, app restarts, and missed manual retries.
- Restaurant-scoped querying and upload checks prevent cross-restaurant data pollution when the same device logs into different restaurants.

Impact on offline Windows cashier:

- `useSyncOrderToServer` now enqueues first, then uploads, and deletes the outbox task only after upload succeeds.
- Table-clear batch sync also enqueues each returned `sync_data` before attempting batch upload.
- `usePendingOrderSync` is the shared renderer hook for draining current-restaurant pending order tasks, so login, manual retry, network recovery, or future triggers can call one public entrypoint.
- Batch drain groups tasks by saved `device_no`, calls the existing batch upload shape `{ restaurant_id, device_no, orders }`, deletes successful tasks, and stops after a failed page to avoid retry loops.

## 2026-07-10: Local Order Mutations Always Enter Pending Sync Queue

Decision:

- Local-origin order mutations should call `syncOrderToServer(sync_data, order_inner_no)` regardless of the current network state.
- `syncOrderToServer` is the business mutation entrypoint: it first writes the payload to `pending_order_sync`, then drains the queue only when online.
- Offline execution of `syncOrderToServer` is not treated as a sync failure after the queue write succeeds; the upload is deferred to recovery nodes.
- Network recovery calls the shared pending-order drain path, but only after a local queue existence check so empty queues do not call the server batch sync API.
- Historical Order sync first drains pending local order uploads when there are pending tasks, then pulls server historical orders.

Reason:

- If local mutations are guarded by `isOnline`, offline-created orders never enter the outbox and cannot be recovered by later pending sync.
- Pushing pending local orders before pulling historical orders prevents the server-side history snapshot from missing offline orders created on this device.

Impact on offline Windows cashier:

- Future local order creation, cash received, manual order, cancel, refund, reduce, status transitions, and table change can be recovered through `pending_order_sync`.
- Existing historical local orders that were never enqueued still require a separate scan/rebuild tool if they need backfill.

## 2026-07-01: Report Receipt Text Is Built Once And Reused Per Output Medium

Decision:

- Offline Windows cashier keeps report receipt layout construction in main-process report/order generators and reuses the same text for USB printing, Digital Copy image rendering, and E-Journal txt download.
- End-of-Shift and Summary of Products print/preview create or reuse `restaurant_report_print` rows using backend-aligned report types: `1` for End-of-Shift and `3` for Summary of Products.
- `print_count` for report rows is incremented only after USB printing succeeds.
- E-Journal download reads existing End-of-Day report snapshots and appends payment/refund order receipt text, but does not mutate order print ids, order print counts, report print counts, or order print statuses.

Reason:

- Backend `/order-print/report` and `/order-print/downloadTicketData` use the same `printHandler.printReport` report rendering path with different output media.
- Keeping one local receipt-text builder prevents Print Report, View Digital Copy, and E-Journal downloads from drifting in layout or field meaning.
- Downloading an E-Journal is a reporting/export action, not a physical print action, so it must not affect print counters.

Impact on offline Windows cashier:

- Renderer report pages call local IPC instead of backend report-print endpoints.
- Future receipt-layout corrections should be made in the shared generator path first, then verified across print, preview, and txt download.

## 2026-06-22: Pending Online Payment Disconnect Uses Manual Confirmation

Decision:

- BillOut records a pending-online-payment context after an online payment order is created and before the payment result is locally finalized, including online-created cash payments waiting for cash-received confirmation.
- If network status changes from online to offline while that context exists, the renderer opens an Ant Design modal asking the cashier to verify the customer's payment app result.
- "Payment Successful" updates local `order_payment` and `food_order` to paid, writes the normal paid/taken status change, refreshes print snapshots, and then reuses the normal success modal/printing flow.
- "Payment Failure" updates local `order_payment` and `food_order` to payment failed and writes a `PAYMENT_FAILED` status change.

Reason:

- The backend can create the payment order successfully while the payment app result is still pending; if the network drops before the cashier can query the server result, the offline Windows cashier needs a local, auditable way to finish the order state.
- The manual branch stays inside the existing local order mutation model so future sync/report/print behavior can reuse existing order tables and status history.

Impact on offline Windows cashier:

- The special confirmation path applies to online payment orders created while online, including cash channels whose payment order was created online but cash-received confirmation has not completed.
- Local confirmation prioritizes `mch_order_id` to avoid mutating an older payment attempt for the same `order_inner_no`.
- Thai and Khmer modal copy intentionally falls back to English until localized translations are available.

## 2026-06-25: Payment Receipt Uses BIR Merchant Copy Layout

Decision:

- Offline Windows cashier payment receipt generation now follows a 58mm/32-character BIR merchant-copy layout for both `View Digital Copy` payment preview and `Print Receipt -> Payment Receipt`.
- The layout is driven by the user-provided receipt photo and backend `header-en-58.vm` / `footer-en-58.vm` templates: centered restaurant/BIR header, payment table, amount section, VAT rows, fixed customer signature block, and fixed Swifood Innovation merchant-copy footer.
- Payment receipt REPRINT/TIME rows are shown only when the order-detail dropdown manually prints `Payment Receipt`; automatic payment receipt printing after cash received does not display or increment payment reprint count.
- Follow-up tuning keeps payment receipt on the backend 58mm `32`-character template and centers the whole block with a fixed left margin instead of widening to 80mm or using ESC/POS per-line centering. It also refreshes TIN/MIN from the approved `restaurant_operation_config` and mirrors backend PWD/SC customer-information rendering when a discount identity is present.

Reason:

- The previous payment receipt layout did not match the required BIR ticket content and spacing.
- Backend templates are the business/layout reference, but the local Electron app must distinguish manual reprints from automatic print triggers because both currently share the same IPC path.

## 2026-06-26: Manual Order Modal Uses Structured Order-Type Options

Decision:

- Offline Windows BillOut migrates the online web `ManualOrderModal.vue` into a React/antd `ManualOrderModal.jsx`.
- Manual order type options are stored as stable configuration with per-country availability and translation keys, then rendered through `getManualOrderTypeOptions()` instead of rebuilding mixed i18n arrays inline.
- Manual order confirm is currently a placeholder in the renderer. The final implementation should use IPC to let the main process mutate the local database, not call online backend manual-order endpoints from the renderer.

Reason:

- The online Vue helper mixed data definition, country filtering, and i18n rendering in one function. A structured option source is easier to audit and extend.
- Manual order will become a local database mutation flow, so backend amount/create calls were intentionally not wired during the UI migration.

## 2026-06-24: BillOut VAT Uses Product Amount, Not Final Payable Total

Decision:

- BillOut amount composition is centralized in `useBillOutAmount`.
- Ordinary whole-order discounts and service fee no longer change the local VAT base; local fallback VAT is calculated from product subtotal.
- Voucher binding stores backend-returned `tax_info` and BillOut uses it when a voucher is selected, because backend coupon classification can make product redemption vouchers taxable on discounted product price.
- PWD/SC continues to use backend-returned `tax_info`, including `less_vat`, VAT exemption, and PWD/SC discount fields.
- Service fee visibility/calculation now respects `service_fee_status`; closed service fee contributes `0`.

Reason:

- Backend `/tax/order/amount` treats `product_amount` as the product tax-included amount and `OrderTaxInfoGetResp.vatableSales` excludes service fee.
- The tax calculation document classifies whole-order discounts as taxable on the original price, while product redemption vouchers can be taxable on discounted product price.
- Keeping the amount model in a hook prevents the BillOut render component from accumulating more tax/discount branches.

Impact on offline Windows cashier:

- VAT rows on BillOut and payment payload tax info should stay stable when applying ordinary percentage/fixed whole-order discounts or service fee.
- Voucher scenarios with backend-calculated product-level tax now preserve the backend VAT breakdown in local payment payloads and reports.

## 2026-06-24: BillOut Disconnect Resets Pre-Payment Amount State

Decision:

- If BillOut transitions from online to offline before an online payment order enters the pending-payment flow, it clears temporary amount state: voucher, PWD/SC, ordinary/custom discount, custom service fee, received amount, and related modals.
- If the disconnect happens while payment-order creation is in flight, BillOut waits until creation finishes; it resets only when no pending online payment was registered.
- If a pending online payment exists, BillOut keeps the existing manual confirmation flow instead of resetting the amount state.

Reason:

- Voucher and PWD/SC depend on online validation, binding, and backend tax calculation. Once offline, those states no longer have a valid business premise before payment creation.
- Resetting all amount-affecting state avoids accidentally carrying server-only discounts into an offline cash payment.
- Created payment orders are a different state machine because the backend may already hold a payment attempt, so they must continue through the pending-payment recovery logic.

Impact on offline Windows cashier:

- A pre-payment network drop returns BillOut to local base amount calculation.
- Existing pending online payment recovery is preserved.

## 2026-06-22: Non-Cash Online Payment Uses QRPH Status Modal

Decision:

- Offline Windows cashier now opens an Ant Design QR/status modal after online non-cash payment-order creation succeeds.
- The modal mirrors the online Web `PaymentQRPHModal.vue` behavior: fetch payment QR code, fetch QRPH channel lists, poll `/cashier/order/payment/status/check` by `mch_order_id`, retry every 5 seconds while unpaid, show success or failure final state, and return to the table page when completed.
- Payment finalization side effects stay in BillOut: successful online payment pulls the server order into SQLite, clears the pending-online-payment fallback context, auto-prints the normal successful-payment receipts, and then lets the modal's `Complete` button navigate home. Failed online payment pulls the server failure state and clears the fallback context.

Reason:

- Online non-cash payment orders can remain pending after creation; the cashier needs the same explicit status-checking UI as the online Web cashier.
- Keeping QR/status UI inside a hook and finalization inside BillOut preserves the offline cashier's existing sync and printing architecture.

Impact on offline Windows cashier:

- The older non-cash branch no longer only shows “Online payment order has been created successfully.”
- The disconnect/manual-confirmation hook remains as a fallback if network drops before a final payment status is observed.

## 2026-06-16: Local Device Identity Is Persisted In SQLite

Decision:

## 2026-06-22: Data Sync Status Uses One SQLite Table With A Special Last-Event Record

Decision:

- Data synchronization display state is persisted in local SQLite, not renderer-only storage.
- `DATA_SYNCHRONIZATION_MODULES.LAST_EVENT` is a special status-table record for the latest successful synchronization event across any module; it is not a business sync module.
- `data_sync_status` stores one row per module/special record and uses numeric shared constants so main and renderer processes stay aligned.
- Renderer flows update sync status explicitly after the data-sync IPC finishes, then re-query the table and put the result into Zustand for UI reuse.
- `data_sync_status` is scoped by the current main-process session restaurant, using `restaurant_id` as the query/update key.
- Calling `updateDataSyncCompletedTime()` without a module means a full data-sync flow completed and all business modules should receive the same latest sync time.

Reason:

- The settings UI needs module-level last sync times and one global "Last Sync" time after app restart.
- Full data sync is represented as a batch update to all business modules instead of a separate `ALL` module, because settings UI displays module-level times.
- A single metadata table is enough for the current UI and avoids adding a second global-status table before history/audit requirements exist.
- Letting the renderer write the sync event after successful sync completion keeps UI state updates ordered: data write, sync-event write, status query, Zustand update.
- Restaurant scoping prevents different restaurant accounts on the same Windows cashier installation from sharing or overwriting each other's displayed sync times.

- Offline Windows cashier exposes `window.api.app.getDeviceIdentity()` through preload.
- Main process owns device identity creation and reads/writes a singleton `local_device_identity` table.
- `device_id` is generated from a SHA-256 hardware fingerprint using Windows fields (`Win32_ComputerSystemProduct.UUID`, `Win32_BIOS.SerialNumber`, `MachineGuid`, physical MAC) and macOS equivalents for development self-test (`IOPlatformUUID`, serial number, physical MAC).
- Once generated, `device_id` is persisted and reused; later hardware changes do not automatically rotate it.
- Renderer startup hydrates this value into zustand as `localDeviceIdentityId`; this name is intentionally separate from backend-bound `deviceNo`.
- `clearAllTableData()` preserves `local_device_identity` so data-sync cleanup does not create a second device id for the same app installation.

Reason:

- Business flows need a stable current-device identifier available to the renderer without exposing direct DB access or shell/system probes.
- Hardware fields are stable enough for practical POS identity, but persistence prevents ordinary runtime calls from drifting if system fields change.

## 2026-06-16: Developer Logs Use Local SQLite

Decision:

- Developer diagnostics logs are stored in a local SQLite `app_log` table instead of only in text files.
- The main process logger wraps `console.log`, `console.info`, `console.warn`, and `console.error`, captures `uncaughtException` and `unhandledRejection`, truncates large fields, and writes logs through a recursion guard.
- Renderer does not mirror every `console.log`; it only reports global `error` and `unhandledrejection` events plus explicit `window.api.app.logMessage` calls.
- Renderer startup installs `appLogger` on `window` and `globalThis`, so feature code can call `window.appLogger.log/info/warn/error(...)` or the global `appLogger` alias without manually wiring IPC payloads.
- Log entries include optional `tag`; main-process console wrappers and renderer `appLogger.log/info/warn/error(...)` derive it by joining all string arguments, capped to a short diagnostic string. Automatically captured system errors use `System` as the tag. The logs page supports fuzzy and exact tag filtering.
- The hidden developer logs page is reached by tapping the sidebar version text eight times and is intentionally not listed as a normal menu item.
- Business data clearing preserves `app_log`; logs are cleared explicitly from the developer logs page.

Reason:

- SQLite supports efficient filtering by date, level, source, sort order, and pagination in the in-app diagnostics page.
- Deriving `tag` from string arguments keeps existing logging calls compatible while making common identifiers searchable without extra payload boilerplate.
- Capturing all renderer console output would create noise and may store excessive business data, while renderer fatal errors are valuable in production support.
- Keeping the entry hidden and hard-coded matches the developer-only purpose with minimal product-surface impact.

## 2026-06-16: Local Device Binding Cache Avoids Rebinding Same Restaurant

Decision:

- Offline Windows cashier stores successful backend POS device binding in singleton-device scoped `local_device_binding`.
- The binding key is the local `device_id` plus current restaurant identity (`restaurant_id` and/or `restaurant_no`).
- Stored binding fields use snake_case: `local_device_identity_id`, `device_no`, `restaurant_id`, `restaurant_no`, and `restaurant_operation_config_id`.
- Login first asks the main process for a local binding for the current restaurant. If found, renderer uses the bound backend `device_no` directly and skips `/cashier/offline/sync/device/list`.
- If no local binding exists, login keeps the existing device-list selection flow; after `/cashier/offline/sync/device/bind` succeeds, main process writes `local_device_binding`.
- `deviceNo` remains the backend POS terminal number in zustand. `localDeviceIdentityId` remains the local app-device identity and must not be used as `deviceNo`.

Reason:

- A machine that has already bound one POS terminal for a restaurant should not force the cashier to choose the terminal again on every login.
- Keeping the binding in the main-process SQLite boundary lets renderer code avoid direct DB access and keeps backend device number separate from local device identity.

## 2026-07-03: POS Selection Modal Uses Exact Device Sync Fields

Decision:

- The first-login POS selection modal maps each displayed BIR field to one exact `/cashier/offline/sync/device/list` response field instead of accepting multiple legacy aliases.
- The displayed fields are `device_no`, `restaurant_address`, `vat_register_status`, `tin_number`, `taxpayer_name`, `audit_status`, `serial_number`, `min_number`, `ptu_number`, and `ptu_issue_date`.
- `Type of Sales Machine` displays `audit_status` as BIR certification type: `1 = global`, `2 = standAlone`, `3 = crm-global`.
- Login device binding also reads only `device_no` and `restaurant_operation_config_id` from the selected device row.

Reason:

- The backend device-list response is now the source of truth for this modal.
- Allowing one form field to fall back across several differently named data sources can show stale or unrelated values and makes binding harder to audit.

## 2026-06-11: Sidebar End Shift Mirrors Online Clock-Out Flow Locally

Decision:

- Offline Windows cashier sidebar end-shift now follows the online front-end sequence where local capabilities exist: show the action only when cashier clock is enabled, block clock-out while unfinished local orders exist, optionally require clock-out photo, require cash-on-hand input, write clock-out data locally, show the current cashier report, and logout after the report closes.
- Because the offline Windows cashier has no online-order page, unfinished-order routing goes to the local offline orders page.
- Clock-out photos are saved as local assets and stored in `clock_out_local_image` rather than uploaded to OSS as an online `url`.

Reason:

- The online front-end treats end shift as more than direct `clockOut`: unfinished orders, clock photo, cash-on-hand, report preview, and logout timing are all part of the business flow.
- The offline app must keep local DB as the source of truth while preserving the same user-facing checkpoints.

Impact on offline Windows cashier:

- `staff.clockOut` accepts `cash_on_hand` and updates `restaurant_waiter_allowance` for report calculations.
- `LoginCameraModal` supports cancel buttons so end-shift photo capture can be aborted cleanly.

## 2026-06-11: Local IPC Mirrors Three Online Cashier Clock APIs

Decision:

- Add main-process IPC equivalents for online `POST /restaurant/cashier/clock`, `POST /restaurant/report/openingFund/update`, and `POST /restaurant/cashier/clockReportData`.
- Login uses `staff.clock` with `waiter_clock_type: 1` and `opening_fund: 0`, then sets `updateOpenFund` so the authenticated layout opens the opening-fund modal.
- The opening-fund modal calls `staff.updateOpeningFund`.
- Sidebar end-shift calls `staff.clockReportData` after unfinished-order/photo/cash-on-hand steps, and uses the returned report for the cashier report modal.

Reason:

- These three online APIs are DB mutation/report-generation boundaries. Keeping them in the Electron main process preserves the offline app's SQLite ownership and avoids spreading report persistence across renderer pages.

Impact on offline Windows cashier:

- `restaurant_waiter_clock_record` receives clock-in/out timing, photo local asset ids, durations, and report snapshots.
- `restaurant_waiter_allowance` receives the login default opening fund, later opening-fund correction, and sign-out cash-on-hand.
- Renderer pages keep only UI sequencing and modal behavior.
- Online `working_url` / `off_url` clock photo fields are intentionally ignored in the offline app; local photos use `clock_in_local_image` / `clock_out_local_image`, and remote historical clock photos should not be cached locally.

## 2026-06-11: Camera Capture Hook Boundary

Decision:

- Shared camera capture logic is extracted into `useCameraCapture` plus `CameraCaptureModal`.
- The hook only opens the camera modal, captures/retries/cancels, saves the photo as a local asset, and returns `{ asset, photo }` to the caller.
- Login clock-in, staff clock-in/out, and sidebar end-shift keep their own business logic at the call sites.

Reason:

- These flows share camera/photo persistence mechanics but differ after capture: login completion, staff list refresh, cash-on-hand input, report display, and logout should not be hard-coded into a generic camera hook.

## 2026-06-11: Queue Order Flow Requires Paid Status

Decision:

- Queue/wait orders follow the backend wait-order flow separately from table-code orders.
- Local `orderTake` and `orderServe` must reject queue orders unless `payment_status` is paid or refund-failed.
- Renderer action rules keep the online Web visibility model; existing invalid local rows should be cleaned from the database rather than supported in UI.

Reason:

- Online Web calls `/wait/order/take`, `/wait/order/dining/out`, and `/wait/order/complete` for queue orders.
- Backend `WaitOrderBusinessImpl` requires paid/refund-failed status for wait take, dining-out, and complete.
- The previous local flow allowed unpaid queue orders to enter `AWAITING_PICKUP`, then failed later at complete with `payment is not available before payment!`.

## 2026-06-12: Mall Certification Runs From Local SQLite

Decision:

- Offline Windows cashier implements mall certification in the Electron main process instead of calling online cashier APIs.
- Settings IPC owns mall certification operations: read/save/select folder/regenerate/init.
- Mall certification configuration is stored in local `restaurant_pos_download_file_setting`, matching the backend table shape; this table is local-only and is not synced with the server.
- File generation is factored into `src/main/services/mallCertification.ts`; `restaurant-settings-nonsync.ts` exposes the IPC-facing business methods.
- SM files are generated from local order/payment/tax/detail/channel data and are initialized after login/session restore; local cash received and refund append single-order rows when SM is enabled.
- Saving Parqal settings checks approved BIR data before persisting, matching backend `saveOrUpdateDownloadFileSetting`; SM and Megaworld do not run this save-time BIR check.
- Parqal and Megaworld generation reads `restaurant_report_print.report_json` for the selected date and validates approved BIR data from `restaurant_operation_config`.

Reason:

- The requested offline behavior should not depend on backend API availability.
- Avoiding a new table keeps the current database schema stable while still persisting per-restaurant configuration.
- Keeping file generation in a reusable service avoids coupling settings UI, IPC registration, and order mutation code to CSV/XML/TXT formatting details.

Impact on offline Windows cashier:

- Missing local report/BIR data is reported through `missing_tables` and warnings instead of blocking unrelated features.
- Megaworld ending report PNG remains a known gap until a local day-report image renderer exists.

Impact on offline Windows cashier:

- Table-code order flow remains unchanged.
- Unpaid queue orders can no longer be advanced to taken or waiting-pick-up locally.
- Existing dirty unpaid queue orders in `WAITING_PICK_UP` are not specially supported and should be cleared or resynced before release testing.

## 2026-06-11: Waiter Clock Order Is Event Ownership Data

Decision:

- `waiter_clock_order` is treated as an append-only order ownership/event table for reporting.
- Local payment success, refund, and cancel flows should insert a `waiter_clock_order` row with the corresponding `record_the_order_type`.
- If the current waiter has an unfinished clock record, bind `restaurant_waiter_clock_record_id` and use real-waiter type; otherwise insert as self-service, matching backend `AddWaiterClockOrder`.

Reason:

- Backend `WaiterClockOrderBusinessImpl.addWaiterClockOrder` always saves a new `WaiterClockOrder`.
- Backend callers insert positive-order rows on successful payment/cash-received and insert refund/cancel rows on refund/cancel events.
- Shift/cashier reports use `waiter_clock_order` to find orders belonging to a clock period; missing rows make `channel_settlement_reports` and `payment_received` empty even when `food_order` and `order_payment` have data.

Impact on offline Windows cashier:

- Cashier report generation can find paid orders created during a shift.
- The table remains event-like; do not update one existing row per order as if it were order state.

## 2026-06-09: Before-Meal Bill Out Defers Food Order Creation

Decision:

- Offline Windows cashier now follows the online web before-meal table flow: selecting dishes and clicking Bill Out does not create `food_order` immediately.
- TableMenu sends a temporary before-meal order snapshot to BillOut.
- BillOut creates the food order at payment time:
  - online table before-meal: create local `food_order`, upload that local order to the server, then create the server payment order with `/cashier/order/payment/create` like after-meal settlement;
  - offline cash: create the local `food_order` just before local `order_payment`, then cashReceived returns a sync payload that includes food orders, details, detail snapshots, payment, tax, and status changes.

Reason:

- The online web source treats before-meal table Bill Out as a not-yet-created order until charge time.
- Aligning this avoids creating unpaid local/server `food_order` rows merely because the cashier entered Bill Out and then backed out or changed payment choices.

Impact on offline Windows cashier:

- After-meal table behavior remains unchanged: Order creates `food_order`, and Bill Out can create an additional order before settlement.
- Existing orders opened from table/order lists still use `order_inner_no` and `/cashier/order/payment/create`.
- Local mutation sync payloads now include order detail and detail snapshot rows so delayed-created before-meal orders can be uploaded completely after cashReceived.
- Online table before-meal intentionally no longer uses backend `/cashier/order/create/order/payment`; only the creation node differs from after-meal, while the order/payment creation ownership matches after-meal.

## 2026-06-10: Staff Clock Controls Follow Online Web

Decision:

- Login clock-in enablement uses the current waiter/user `clock_status`, matching online Web `user/isOpenClock`.
- Restaurant `clock_photo_status` still controls whether login/staff clock actions require a photo.
- Staff page no longer globally disables IN/BREAK/OUT from restaurant `clock_status`.
- Staff page renderer guards now follow online Web employee-state behavior for duplicate IN, BREAK before IN, BREAK while resting, OUT before IN, and OUT while resting.

Reason:

- Online Web has both user and restaurant clock fields, but only `userInfo.clock_status` controls whether login should clock in.
- Online Web Staff employee cards do not use restaurant `clock_status` as a global interaction disable; they rely on employee `waiter_status`.

Impact on offline Windows cashier:

- `clock_status = 2` on the logged-in waiter skips login clock-in, even if restaurant settings contain another `clock_status`.
- Staff IN/BREAK/OUT buttons remain interactive and show status-based prompts instead of being disabled by restaurant `clock_status`.
- The online Web unfinished-order check before OUT is not yet implemented in the offline renderer because no matching local IPC/API exists yet.

## 2026-06-11: Digital Copy Preview Runs In Main Process

Decision:

- Offline Windows cashier exposes `orders:view-digital-copy` / `window.api.orders.viewDigitalCopy`.
- The main process generates a base64 image data URL locally for the offline orders `View Digital Copy` button.
- The generator first uses synced `food_order_print_info.content_json`, matching backend `/order-print/preview`; if no print snapshot exists for a local offline order, it falls back to building a payment receipt model from local order/detail/payment/tax rows.

Reason:

- The backend preview endpoint returns an image for display, but offline mode cannot depend on the server.
- Synced server orders may already have backend print snapshots, while locally created offline orders may not.
- Keeping image generation in the main process keeps renderer code aligned with the online modal: call one method, receive one image string, render it.

Impact on offline Windows cashier:

- `View Digital Copy` is no longer a dead button on the offline orders page.
- The returned image is currently SVG data URL base64 generated from the same local receipt text renderer used by print services, not a byte-for-byte copy of backend PNG/JPEG rendering.

## 2026-06-12: Queue Take Food Number Assigned On Local Cash Success

Decision:

- Offline Windows cashier assigns `food_order.take_food_no` for queue orders during local `cashReceived`, not during initial unpaid order creation.
- The local sequence follows backend behavior: current business day starts at 02:00, values are three digits from `001` to `999`, and after `999` the next local value wraps to `001`.
- If an order already has `take_food_no` from server sync or a previous local mutation, local cash success preserves it.

Reason:

- Backend cashier queue orders generate the number in `cashReceived -> payCallWait`, after payment succeeds.
- Assigning the value at unpaid order creation would consume visible pickup numbers for abandoned/unpaid queue orders.

Impact on offline Windows cashier:

- Offline cash-paid queue orders now carry `take_food_no` in local DB and in the returned order sync payload.
- Table orders and server-origin orders are not affected.

## 2026-06-12: Queue Ordering Always Uses Before-Meal Creation Flow

Decision:

- Restaurant `mode` only decides table-order behavior: before-meal table orders delay `food_order` creation until payment, and after-meal table orders create `food_order` before Bill Out.
- Queue orders ignore restaurant `mode` for creation flow and always behave like before-meal orders.
- In the renderer, queue Bill Out now passes a temporary `beforeMealOrder` snapshot to BillOut instead of calling local `createOrder` immediately.
- BillOut creates the queue `food_order` only during payment-order creation and uses queue `order_channel` / `status_type` for local DB and sync payloads.

Reason:

- Backend queue-to-order flow is payment-first from the cashier perspective and assigns queue-specific fields such as `take_food_no` only after payment success.
- Creating unpaid queue `food_order` rows at Bill Out time makes queue ordering follow table after-meal behavior by mistake.

Impact on offline Windows cashier:

- Queue orders no longer create local `food_order` when the cashier merely enters Bill Out.
- Offline queue cash payment creates `food_order`, `order_payment`, tax rows, status rows, and then completes cashReceived in the same user flow.
- Online queue payment now follows the same split before-meal path as table before-meal: create local `food_order`, sync it to the server, then call `/cashier/order/payment/create`.

## 2026-06-12: Online Queue Payment Wait Endpoint Superseded

Decision:

- This earlier wait-endpoint path has been superseded by the 2026-07-10 split before-meal payment flow.
- Queue and table before-meal drafts now create the local `food_order` at Charge, sync it to the server, then use `POST /cashier/order/payment/create`; existing-order payments use the same payment endpoint.

Reason:

- Queue ordering follows before-meal semantics, so maintaining a separate online queue combined endpoint path caused table before-meal and queue before-meal to drift.

Impact on offline Windows cashier:

- Online queue checkout no longer calls `POST /wait/order/create` for combined food-order/payment-order creation.
- Offline queue cash checkout and table checkout paths still use local order/payment creation.

## 2026-06-17: Label Print Uses Main-Process Direct USB Printing

Decision:

- Offline Windows cashier generates label print messages in the main process from local `food_order_print_info.content_json`, label printer settings, and printer category settings.
- The main process directly prints generated messages through USB after intersecting current inserted USB devices with current restaurant printer settings.
- The temporary `printer:print-requested` renderer notification channel was removed; renderer state is UI-only and is not the source of truth for automatic printing.
- Automatic label printing is triggered after local non-queue `CREATE_ORDER` and after local queue `ORDER_TAKE`, matching the backend-created/auto-take and wait-take label push nodes that matter for offline local orders.
- `CASH_RECEIVED` does not trigger label printing to avoid duplicate prints for before-meal local cash flow, which creates the order before receiving cash.
- Takeout/online-order label push nodes are intentionally ignored for this offline-local implementation.

Reason:

- The USB hardware print implementation already lives in the main process, so routing main-decided automatic print events through the renderer adds an unnecessary hop.
- Current inserted USB devices and persisted printer settings are both available to the main process, so it can enforce "inserted and configured" before printing.
- Renderer-initiated manual printing should only ask the main process to print; the renderer should not fetch print data and then send it back to the main process.

Impact on offline Windows cashier:

- Manual Label Receipt uses `orders:print-label`, and manual order/bill/payment/kitchen receipt printing uses `orders:print-receipt`; both now generate and print in the main process.
- Automatic label printing skips silently when no inserted configured label printer is available; manual printing still returns an error when no configured USB printer is connected.
- USB printer matching accepts exact `mac_id` matches and same VID/PID matches, because the current low-level `makePrint` implementation also finds devices by VID/PID and test printing can succeed when the generated MAC suffix differs.
- When a print message has a target `mac_id`, the target printer setting must match exactly; VID/PID compatibility is used only to determine whether that configured printer is currently connected.
- USB label settings are deduped by VID/PID before generating label messages because the low-level USB print path cannot distinguish two same-model physical printers.
- Queue order creation writes pending status from the start, and queue cash-received follows backend auto-accept semantics by moving the order to taken. Table cash-received keeps the current order status, and completion remains a separate action.
- Renderer-owned business nodes now trigger automatic local prints after success: cash-received prints payment receipt, queue/before-meal auto-accept also prints order receipt, kitchen receipt, and label receipt; manual queue Take prints order receipt, kitchen receipt, and label receipt.
- Online-compatible payload fields are still generated internally: `data_type`, `mac_id`, `message_no`, `print_info`, `print_language`, `print_size_type`, and `print_type`.
- Real USB label hardware remains required for final physical print validation.

## 2026-06-22: BIR Info Loads After System Entry

Decision:

- `GET_BIR_INFO` belongs to the SETTINGS IPC module and reads local `restaurant_operation_config` from the main process.
- The query derives restaurant identity from `getCurrentSession()` and prefers the current bound POS `device_no` before falling back to the latest restaurant record.
- The renderer calls `GET_BIR_INFO` from `AppLayout`, after auth and data-sync guards allow entry into the system.
- The returned payload removes `id` and `*_id` fields before crossing to the renderer.
- Zustand stores the data in `bir_info`, persists it with the same sensitivity as `user`, and clears it through the existing logout reset.

Reason:

- First login may require selecting and binding a POS device before the correct device-specific BIR row can be known.
- Loading from the system layout avoids fetching BIR while the user is still in login, data sync, or device-selection flows.

Impact on offline Windows cashier:

- Persisted sessions keep `bir_info` like `user`.
- Logging out clears `bir_info`.
- Screens can read BIR data from `useStore((state) => state.bir_info)` without querying SQLite directly.

## 2026-06-24: Tax Amount Calls Preserve Zero Custom Service Fee

Decision:

- BillOut builds shared `/tax/order/amount` custom service fee parameters when the restaurant service fee type is CUSTOM.
- PWD/SC and voucher amount-binding requests include `custom_service_fee`, including explicit `0`.
- Percentage custom service fee is converted from the renderer's local ratio form to the backend basis-point style value and sent with `custom_service_fee_type`.

Reason:

- Backend validation rejects missing/null `custom_service_fee` in CUSTOM service fee table-order scenarios with `The custom service fee cannot be empty`.
- The online front-end already falls back to `serviceFee || 0` for the backend `custom_service_fee` field.

Impact on offline Windows cashier:

- Selecting PWD/SC or voucher while custom service fee is enabled and currently 0 should no longer fail at `/tax/order/amount`.
- The endpoint continues to use `custom_service_fee`; `service_fee` remains for other order/payment payloads.

## 2026-06-24: Shift Auto-Calculate Buttons Match Online Semantics

Decision:

- Opening Fund modal shows Auto-Calculate and Confirm. Auto-Calculate submits `opening_fund = 0` through the same local `updateOpeningFund` path.
- Cash on Hand modal shows Auto-Calculate and Confirm. Confirm submits the entered `cash_on_hand`; Auto-Calculate calls `clockReportData` without a `cash_on_hand` field.

Reason:

- Online Web cash-on-hand Auto-Calculate calls `clockOut(null)`, which omits `cash_on_hand` and lets report logic derive the value.
- Online opening-fund default/auto behavior uses zero opening fund.

Impact on offline Windows cashier:

- Auto cash-on-hand must not pass `0`, because `0` means the cashier explicitly entered zero cash and changes short/over behavior.
- Local report generation continues to derive cash on hand from opening fund, cash payments, withdrawals, and cash refunds when the field is omitted.

## 2026-06-25: Payment Receipt Discount Copies And Tax Fallback

Decision:

- Discounted payment receipts print merchant and customer copies, separated by an internal ESC/POS cut marker. Non-discounted payment receipts print one copy and omit copy-label text.
- Coupon amounts are printed under `Promo Discount`; PWD/SC uses `pwd_discount` from `order_payment_tax` when available and falls back to 20% of VAT-exempt sales.
- If final payment tax fields are missing or all zero for a VAT-registered BIR receipt, the local receipt generator derives VAT fields from gross item amount using the 12% VAT-inclusive rule documented for payment receipts.
- Payment receipt content remains a 32-character BIR block, but the left margin is calculated from receipt printer paper width instead of a fixed four spaces.

Reason:

- Feishu receipt rules and backend templates require discounted transactions to produce both customer and merchant copies.
- Existing local snapshots can predate the final `order_payment_tax` values, causing receipt tax rows to show `0.00`.

Impact on offline Windows cashier:

- Payment receipt rendering now refreshes tax fields from `order_payment_tax` before printing or previewing, while keeping the 32-character BIR content block.
- Receipt printer paper width is read dynamically: 58mm uses a 32-column printable area; 80mm uses a 48-column printable area and centers the 32-character BIR block inside it.

## 2026-06-25: Refund Receipt Reuses Payment BIR Layout

Decision:

- Payment and refund receipts share the same BIR-style 32-character receipt body, amount rows, tax rows, customer information, and fixed Swifood footer.
- Payment receipt header uses `SI#` from `food_order.order_serial_number` and `TRANS#` from `order_payment.system_transaction_no`.
- Refund receipt header changes only the required payment fields: `SI#` becomes `ORIG.SI#`, adds `REFUND#` from `order_payment.refund_serial_no`, changes `ORDER TIME` to `REFUND TIME`, and changes the section title to `***** REFUND *****`.

Reason:

- Refund receipt requirements are defined as payment receipt layout plus a small set of header/title differences.

Impact on offline Windows cashier:

- Future payment/refund receipt layout changes should be made in the shared payment-like receipt generator unless the behavior is explicitly receipt-type-specific.

## 2026-07-01: Order Receipt Uses Payment-Like BIR Template With Order-Specific Sections

Decision:

- Offline Orders `Order Receipt` reuses the payment-like centered BIR receipt template and dynamic receipt-printer paper width. A manual print after an earlier successful Order Receipt print shows the backend-compatible `REPRINT n` header; first-time and automatic printing omit it. The receipt still suppresses `SI#`, `TRANS#`, tax rows, customer information, and merchant/customer copy labels.
- Its `ORDER ID` uses `food_order.order_serial_number`, matching the historical order receipt field and target print sample.
- The footer statement is `This does not serve as INVOICE.`.

Impact on offline Windows cashier:

- Future receipt alignment changes should prefer the shared payment-like generator, while keeping order-specific visibility flags separate from payment/refund invoice behavior.

## 2026-07-01: Bill Receipt Is A Standalone Short Template

Decision:

- Bill receipt generation no longer uses the legacy long receipt shape with BIR header, order id, tax, customer, note, or company footer fields.
- The template is standalone: merchant display name, `******* BILL ******`, cashier, print time, order-style item table, order-style amount summary, `This does not serve as INVOICE.`, and `Powered by Swifood`.
- Bill receipts read the receipt printer paper width and language configuration for centering and bilingual labels.

Impact on offline Windows cashier:

- Bill Out `Print Bill Receipt` continues to use the existing print receipt IPC, but the main process now formats bill content using receipt printer settings before dispatch.

## 2026-07-02: End-Of-Day Popup State And Upload State Are Separate

Decision:

- `restaurant_report_print.push_status` keeps the backend meaning for automatic End-of-Day reports: whether the auto-generated report has already been shown to the cashier.
- The offline Windows cashier adds local-only `restaurant_report_print.sync_status` for upload state: whether the local report snapshot has been pushed to the backend sync endpoint.
- Manual report rows use `push_status = 1`; automatic EOD rows use `push_status = 2` until the startup popup is confirmed.

Reason:

- Reusing `push_status` for both popup notification and local upload would make confirming the popup mark a report as synced, or uploading a report mark it as already shown. The two workflows need independent state.

Impact on offline Windows cashier:

- Startup can mark automatic reports as notified without losing pending upload work.
- Pending EOD report upload reads `sync_status = 2` and sends backend-compatible report fields to `/cashier/offline/sync/report/batch`.

## 2026-07-03: Receipt Paper Width Means Content Width

Decision:

- Receipt-printer paper width selection controls the generated receipt content block.
- 58mm prints a 32-column content body centered within a 48-column 80mm paper width.
- 80mm prints a 48-column content body.
- The app should not left-align a 32-column 58mm body on 80mm output, and should not force 80mm output to stay at 32 columns.

Reason:

- The printer setting represents the intended receipt content width. If the cashier selects 80mm, the receipt content should span the full 80mm paper. If the cashier selects 58mm, a narrower receipt body should remain centered on physically wider paper.

Impact on offline Windows cashier:

- Payment, refund, order, bill, kitchen, End-of-Day, End-of-Shift, Summary of Products, and withdrawal report receipt text should all derive their text width from the configured receipt/kitchen printer paper width.

## 2026-07-03: Label Print Trigger Moves To Food Order Creation

Decision:

- Renderer order-creation flows now silently trigger Label Receipt printing immediately after local `food_order` creation succeeds.
- The shared renderer helper catches missing/unconnected label-printer failures and logs them without showing cashier-facing errors.
- Bill Out no longer includes Label Receipt in the cash-received auto-print list for before-meal draft and queue flows, because those labels are already triggered at local `food_order` creation.

Reason:

- The label should be printed from the actual `food_order` created in the order flow, not delayed until payment/cash-received.
- Missing label hardware should not block or alarm the cashier during order creation.

Impact on offline Windows cashier:

- `TableMenu` local order creation covers table, queue, before-meal, and after-meal create-order paths that create `food_order` immediately.
- `BillOut` local before-meal/queue draft payment flow triggers label printing right after it creates the previously delayed `food_order`.
- Main-process label message generation and USB dispatch remain unchanged.

## 2026-07-03: Payment Failed Remains Payable Table Order

Decision:

- Local queries that find a table's pending/payable order treat `payment_status = FAILED` the same as `UNPAY`.
- Processing-master lookup, empty-cart Bill Out lookup, cancellable-order table lists, and table-clear blocking checks all include failed payments as unpaid-like orders.

Reason:

- Manual confirmation of an interrupted online payment failure intentionally changes only payment state; the order remains on the table and must be payable again.
- A failed online payment should also block table clear like an unpaid order.

Impact on offline Windows cashier:

- After a QRPH/online payment is manually confirmed as failed, re-entering the same taken table and clicking Bill Out finds the existing order instead of showing "当前桌子上没有订单".
- Table clear will not complete a taken order whose latest payment state is failed.

## 2026-07-03: End Of Shift Payment Received Uses Payment Channels

Decision:

- End of Shift receipt printing maps `PAYMENTS RECEIVED` rows from `channelSettlementReports`, the same data shown in the cashier report Payment Type table.
- Row labels use `payment_channel.name` through the existing channel report aggregation, falling back to the channel code only when no name is available.

Reason:

- `paymentSummaries` is grouped by `order_payment.payment_platform`, which can collapse multiple payment channels into a generic value such as `PayCools`.
- The printed receipt should match the cashier report table and display actual payment type/channel names.

Impact on offline Windows cashier:

- End of Shift print/preview now lists each payment channel amount under `PAYMENTS RECEIVED` instead of a single platform label.
- The underlying report aggregation and UI table remain unchanged.

## 2026-07-03: Shift Reports Require Local Waiter Clock Order Attribution

Decision:

- Successful local payment, manual order, online-payment confirmation, refund, and cancel flows write `waiter_clock_order` through a helper that resolves the current local waiter by `waiter_no` before finding the active clock record.
- Batch and single-order server pull responses do not contain `waiter_clock_order`; neither synchronization path may delete, insert, update, or otherwise replace local waiter-clock-order rows.
- The generic synchronized-order child cleanup excludes `waiter_clock_order`; only local payment, refund, and cancel business events may write this append-only attribution table.
- Cashier report settlement queries include a narrow compatibility path for historical local rows whose `waiter_clock_order.restaurant_waiter_clock_record_id` contains a server clock id rather than the local clock record id.

Reason:

- Backend `restaurant/report/settlement/query` new-report logic reads orders through `waiter_clock_order.restaurant_waiter_clock_record_id`, not directly from paid `food_order` rows.
- Renderer/main session user ids can come from backend data, while local clock records are keyed by local `restaurant_waiter.id`; resolving by `waiter_no` keeps the join stable.
- Order pull sync cannot reconstruct local shift attribution because its response contract excludes `waiter_clock_order`; deleting those rows makes current end-of-shift and product reports empty after synchronization.
- Existing local data showed this exact mismatch: the current local shift had clock record id `19`, while the latest paid order's waiter-clock row referenced server-style clock id `2414`.

Impact on offline Windows cashier:

- Current-shift cashier reports can find newly paid orders after clock-out/clock-in cycles.
- Local shift attribution is preserved unchanged across both batch and single-order pull synchronization.

## 2026-07-06: Summary Of Products Uses Shift Attribution

Decision:

- Summary of Products now resolves selected waiter shifts through local `restaurant_waiter_clock_record.id` and `waiter_clock_order.record_the_order_type = POSITIVE_ORDER`, matching backend `restaurant/report/summary/query`.
- The query formats request times as local SQLite `YYYY-MM-DD HH:mm:ss` strings instead of ISO strings.
- Historical rows whose `waiter_clock_order.restaurant_waiter_clock_record_id` contains a server clock id are still included only when the matching `food_order.waiter_no` and shift time range match the selected waiter.
- Summary detail and category filters now use named SQL bindings consistently, including SKU ids for category-specific product summaries.

Reason:

- Backend `handSummaryOrder` uses waiter-clock-order attribution before reading product details.
- The previous local Summary query filtered only by `waiter_type`, which could miss the current shift or mix waiter data, and ISO timestamps did not match local SQLite datetime storage.

Impact on offline Windows cashier:

- Current-shift Summary of Products can show products from newly completed orders after clock-out/clock-in cycles.
- Historical bad waiter-clock rows from earlier single-order syncs remain reportable without broadening the query to unrelated waiters.

## Decision Template

```md
## YYYY-MM-DD: <short title>

Decision:

- ...

Reason:

- ...

Alternatives considered:

- ...

Impact on offline Windows cashier:

- ...

Open follow-up:

- ...
```
## 2026-06-26: Manual Order Confirmation Uses Local SI/OR IPC

- Added `window.api.orders.authManualOrderSerialNumber`, backed by main-process SQLite query logic that mirrors backend `authSerialNumber`: max 20 characters, reject 20-digit numeric values, and reject duplicates within the same country.
- Bill Out keeps a `manualOrder` renderer state after successful validation. It switches payment-channel lookup to `manual_order: true`, displays the entered manual-order information, and disables regular discount, service-fee, reduce-order, cash-input, and Charge flows.
- Deliberately did not implement the later `/cashier/order/create/manual/order` transaction in this change. That operation must be a dedicated local transaction for `food_order`, `order_payment`, tax, status history, print snapshots, shift ownership, and sync payloads; routing it through the ordinary payment IPC would produce incorrect data.

## 2026-06-30: Local Refund Uses Append-Only Payment Rows

- Local refund now mirrors backend `/cashier/order/refund`: create a new refund `order_payment` and copied `order_payment_tax`, keep the original successful payment row unchanged, and point `food_order.refund_payment_id` to the new refund payment.
- Refund payment rows use `transaction_status = REFUNDED` and `final_payment_status = YES`, matching backend reporting and refund receipt queries.
- Any local query that needs the original positive payment must explicitly filter `transaction_status = PAY_SUCCESS`; `final_payment_status = YES` alone can include both positive and refund rows after a refund.
- Successful local refund also completes unfinished food orders and records both `INITIATE_A_REFUND` and `REFUND_SUCCESSFUL` status changes, matching the backend transaction shape.

## 2026-06-30: Mall Certification Regeneration Mirrors Backend Files

- Parqal and Megaworld regeneration in the offline Windows cashier now treats backend `WaitOrderBusinessImpl` as the file contract source.
- Local generation reads `restaurant_report_print.report_json`, `order_payment`, `order_payment_tax`, `food_order`, `order_detail`, `order_detail_snap`, `payment_channel`, `restaurant_setting`, and `order_summary` to reproduce backend fields instead of emitting simplified summary-only files.
- BIR/report prerequisites use the currently bound POS `device_no`; offline Windows cashier must not use a default POS terminal id for local snapshots or certification generation.
- Megaworld no longer emits the previous local PNG warning because the referenced backend endpoint returns three sales TXT files, not a local PNG artifact.

## 2026-07-07: Order Payment Stores Bound POS Device No

Decision:

- `order_payment.device_no` is a required local field and uses the currently bound POS terminal `device_no`, not the local application device identity.
- Local payment creation, manual-order payment creation, and refund payment creation write this POS number when inserting `order_payment`.
- Server order pull sync preserves server-provided `order_payment.device_no`; missing or empty values are treated as invalid instead of falling back to a local device number.
- Online payment-order creation sends `device_no` in the payment request so server-created payment rows can satisfy the new backend field.

Reason:

- Backend `order_payment.device_no` is now NOT NULL and represents the bound POS terminal.
- Local reports and mall certification already filter `order_payment` by device number, so payment rows must carry the same POS identity as local order/report flows.

## 2026-07-07: Data Sync Completion Runs Login Clock-In For New Waiters

Decision:

- Login clock-in logic is centralized in `useLoginClockInFlow()`.
- Normal login and first/new-waiter data-sync completion both use the same rules: current waiter `clock_status` controls whether login clock-in is required, restaurant `clock_photo_status` controls whether a login photo is required, and an existing local active clock record skips duplicate clock-in.
- Explicit `/data-sync` completion now waits for cashier confirmation, then runs the login clock-in flow before navigating to the home page.

Reason:

- New waiters cannot clock in before data sync because the local `restaurant_waiter.id` may not exist yet.
- After sync hydration the local waiter exists, so the app can safely create the local clock record and set the opening-fund prompt before entering the cashier screens.

Impact on offline Windows cashier:

- Existing non-sync login behavior keeps the same clock-in rules.
- New-user/new-waiter login no longer enters the system without an active shift when clock-in is enabled.

Impact on offline Windows cashier:

- Existing SQLite databases remove historical `device_no` column defaults on startup; new writes must provide a real bound POS device number or fail.
- New local and synced payment rows should be attributable to the correct POS terminal for reports, End-of-Day, and mall certification.

## 2026-07-07: Persisted EOD Triggers Parqal Generation

Decision:

- When an End-of-Day report is persisted locally and Mall Certification is configured as Parqal, the offline Windows cashier generates the Parqal XML file immediately after the `restaurant_report_print` snapshot is saved.
- The hook lives in the main-process EOD generation path, so both manual End Your Day and automatic missing-EOD generation use it.
- Parqal file generation failures are logged but do not abort EOD snapshot creation or printing.

Reason:

- Parqal generation depends on the saved EOD `restaurant_report_print.report_json`, so the correct trigger point is after EOD persistence.
- Automatic EOD generation should not be blocked by folder/BIR/file-write issues; the cashier can still regenerate the certification file from Settings after fixing configuration.

Impact on offline Windows cashier:

- Settings > Mall Certification > Regenerate remains available for backfill or retries.
- SM continues to use its existing transaction CSV append/init flow; this change only adds the missing Parqal EOD side effect.

## 2026-07-08: Local Payment Receipt No Uses Local Setting Sequence

Decision:

- `order_payment.receipt_no` is now generated from `local_setting.next_receipt_no` for local automatic payment/refund rows.
- `next_receipt_no` follows the same nullable, current-restaurant initialization model as `local_system_transaction_no`, `next_order_serial_number`, and `next_refund_serial_no`.
- Initialization migrates from the current restaurant's existing 20-digit numeric `order_payment.receipt_no`; if none exists, it starts from `00000000000000000001`.
- Manual-order cashier-entered SI/OR remains authoritative and does not advance the local receipt sequence.
- Renderer and main-process manual-order validation reject pure numeric SI/OR values whose length equals the system `receipt_no` length, so handwritten invoice numbers cannot collide with automatically generated receipt numbers.
- Server order sync advances `next_receipt_no` past synced `receipt_no` values.

Reason:

- `receipt_no` is also a local incrementing number and should not depend on SQLite row ids.
- Keeping it in `local_setting` makes generation consistent, restaurant-scoped, and safer after reinstall or data migration.
- Handwritten invoice numbers are user-provided external numbers, so they must stay separate from the system automatic receipt sequence.

## 2026-07-10: Before-Meal Voucher/PWD Amount Revalidation Uses Real Order No

Superseded on 2026-08-07 for PWD/SC: the revalidation described below now applies only to vouchers. PWD/SC always uses the local calculation and local ID check.

Decision:

- In online BillOut payment, all before-meal drafts, including table ordering and queue ordering, create the local `food_order` first, sync it to the server, and then create the server payment order through `POST /cashier/order/payment/create`.
- Queue before-meal no longer uses `POST /wait/order/create` for combined food-order/payment-order creation.
- Before-meal drafts that use voucher or PWD/SC call `POST /tax/order/amount` again after local order creation and server sync, using the newly returned `order_inner_no`, before creating the payment order.
- The second amount request preserves the original discount-specific parameters: voucher sends `coupon_code`, `sku_no_list`, and `discount_type = 6`; PWD/SC sends `discount_type`, `discount_id`, `discount_number`, and `order_number`.

Reason:

- Queue ordering follows before-meal semantics, so table before-meal and queue before-meal should share the same creation ownership model.
- The initial voucher/PWD/SC amount call can happen before a before-meal `food_order` exists, so it cannot bind or validate against `order_inner_no`.
- The payment order should only be created after the backend has successfully revalidated the selected voucher or PWD/SC discount against the real order number.

## 2026-07-10: Queue Food Order Restaurant Type Is Always Before-Meal

Decision:

- Local SQLite food-order creation now assigns `food_order.restaurant_type` from `restaurant_setting.mode` only for table ordering.
- Queue ordering always writes `restaurant_type = BEFORE_MEAL (1)` and also forces the local create-order branch to before-meal mode before inserting `food_order`.

Reason:

- Backend queue order creation writes `RestaurantTypeEnum.BEFORE_MEAL` regardless of the restaurant payment mode.
- Restaurant `mode` represents the table-order payment model; queue ordering follows before-meal semantics even when the restaurant is configured as after-meal.

## 2026-07-16: End Your Day Allows Missing Receipt Printer

Decision:

- The initial End Your Day flow persists and closes the End-of-Day period even when no configured USB receipt printer is connected.
- Missing printer hardware is silently skipped only for that initial flow; an actual print attempt against a connected printer may still fail normally.
- Reprint Receipt continues to require a connected configured receipt printer and reports the existing printer-not-connected error when none is available.
- `restaurant_report_print.print_count` increases only after an actual successful print, not after a skipped initial print.

Reason:

- End-of-Day persistence is a business operation and must not be blocked by optional receipt hardware.
- Reprint Receipt is explicitly a printing action, so failure to locate a printer must remain visible to the cashier.

## 2026-08-07: Local PWD/SC Is Authoritative In Every Network State

Decision:

- The offline Windows cashier calculates PWD/SC locally for both online and offline payments, including manual orders.
- Local restaurant tax settings and the current POS's local BIR VAT registration state are authoritative; `/tax/order/amount` is not used for PWD/SC preview or before-meal revalidation.
- The current POS rejects reuse of the same normalized ID within PWD types `1/3` or within SC types `4/5` on the same natural day, including after refund. PWD and SC are independent ID namespaces.

Reason:

- Server and local BIR enablement can differ. Using the server amount endpoint could return NON-VAT results while the physical POS is configured for BIR VAT calculation.
- A single local path keeps online and offline receipts, payment tax snapshots, and reports consistent.
