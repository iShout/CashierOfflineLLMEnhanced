# Online Front-End Summary: `swifood-cashier-ipad-h5`

## Ordering Feature Switch Navigation

Source checked on 2026-08-07:

- `src/store/modules/food.js`
- `src/components/SideBar/index.vue`
- `src/permission.js`

Stable behavior:

- `merchantInfo.table_order_status === 1` enables Table Ordering, and `merchantInfo.wait_order_status === 1` enables Queue Ordering.
- The sidebar hides Table Management or Queue Ordering when its respective switch is disabled.
- Login routing opens the only enabled ordering mode when exactly one switch is on. When both modes are enabled, `cashier_mode = 1` selects Table Ordering and `cashier_mode = 3` selects Queue Ordering.
- If both modes are disabled, login falls back to an order-list page allowed by the cashier's permissions.

Source path:

`/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5`

Alias: 在线前端源码

This is the online cashier front-end reference. Use it to understand existing front-end flows, UI behavior, state transitions, request payloads, response handling, and naming conventions that the offline Windows cashier may need to mirror.

## Sidebar Logout During Clock-Enabled Shifts

Source checked on 2026-08-05:

- `src/components/SideBar/index.vue`
- `src/store/modules/user.js`

Stable behavior:

- When shift attendance is enabled, Sidebar Logout opens the translated `tips.click_logout_tips_*` warning.
- Choosing `Proceed to logging out` clears the user/log state and returns to Login without clocking out.
- Choosing `Proceed to ending my shift` dismisses the warning and leaves the session active; the online user then uses the visible End Your Shift action.
- End Your Shift separately checks unfinished orders, optionally captures a clock-out photo, requests Cash on Hand, submits `clockReportData`, and displays the cashier report before logout.

Offline Windows cashier impact:

- The offline warning is gated by the actual local active clock record rather than the attendance feature flag alone.
- Its ending-shift button directly invokes the already shared local End Shift flow, preserving the online intent without requiring a second sidebar click.

## Verified Source Snapshot

Checked on 2026-06-02.

- `package.json`: Vue 2.6, Vue Router 3, Vuex 3, Element UI 2, Axios 0.18, vue-i18n, lodash, dayjs, dsbridge, `utils-for-paycools`, `paycools-components`.
- Build scripts: `npm run dev`, `npm run build:prod`, `npm run build:stage`, `npm run lint`, `npm run test:unit`.
- Main source areas:
  - `src/api`: API wrappers by domain.
  - `src/views/table-manage`: table, menu, bill-out, and order-list cashier screens.
  - `src/views/order`: order history and online order screens.
  - `src/views/printer`: Bluetooth, USB, and cloud printer settings.
  - `src/views/report`: cashier/day reports.
  - `src/views/secondary-screen`: customer-facing display.
  - `src/store/modules`: user, food, staff, permission, log.
  - `src/utils`: request wrapper, bridge, websocket, printer helpers, order helpers, math, daily report manager.

## Request And Response Conventions

Source checked:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/utils/request.js`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/user.js`

Stable behavior:

- `request()` defaults `serviceUrl` to `/cashier-api`.
- Request URL is assembled as `serviceUrl + url` through `path.join`.
- Auth header is set from `getAuthHeader()` when a token exists.
- Device/environment header is set through `Accept-Env: getDeviceHeader()`.
- `request-version` comes from `VUE_APP_REQUEST_VERSION`.
- Non-production requests may include `route-version`.
- Successful business response code is `10000`.
- Code `20001` triggers logout and redirect to `/login`.
- Code `20011` prompts reload for version mismatch.
- Codes `20112`, `20113`, and `20118` have special handling around daily reports and PWD/SC discount validation.
- Other non-success codes show Element UI messages.
- Axios transport errors also show Element UI error messages in the response error interceptor, using `error.response.data.message` for 403 and `error.message` otherwise.

Offline Windows cashier impact:

- Keep API payloads and responses in snake_case unless this repository already normalizes them internally.
- Preserve special error-code handling when mirroring online cashier behavior.
- When adding a new backend call, default to `/cashier-api` unless the source explicitly uses another service.

## Routing And Major Screens

Source checked:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/router/index.js`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/bill-out.vue`

Stable behavior:

- Default route redirects to `/tableManage`.
- Main cashier flow includes `/tableManage`, `/tableMenu`, `/counterMenu`, `/billOut`, `/orderList`, `/secondaryScreen`, printer, report, setting, staff, order, and online order routes.
- `bill-out.vue` is a central settlement/payment screen. It handles discount selection, voucher, PWD/SC discount, custom service fee, payment channel selection, manual order state, order summary edits, payment creation, and payment confirmation.
- In `bill-out.vue`, clicking the voucher discount opens a `Clip Vouchers` dialog with three voucher lookup modes: phone number/email, voucher code, and scan QR code. Phone/email mode can open a voucher list modal; voucher-code and scan modes bind a selected coupon code and then refresh amount/tax calculations.
- Phone/email voucher lookup normalizes Philippine phone numbers by adding a leading `0` for matching 8/9-prefixed 10-digit numbers, then calls `POST /cashier/user/coupon/user/page` with `sku_nos`, amount/tax, `restaurant_no`, `user_phone_no`, and `order_channel`. The voucher list modal renders `coupons_list` as two-column voucher cards and toggles selected `coupon_code` before submit.
- Voucher list submit, manual voucher-code entry, and scan-code entry all converge on `selectVoucher(coupon_code)`, which calls `POST /tax/order/amount` with `discount_type: 6`, `coupon_code`, `sku_no_list`, and `order_inner_no`. The frontend then stores `selectedCouponCode` and backend-returned `discount_amount` as `couponAmount`.
- In Electron/cashier context, `Scan QR Code` voucher mode does not render a voucher-code input. Submit opens `WaitingScanModal` with type `VOUCHER`, sets the app scan-ready flag, and waits for the global scanner keyboard buffer to finish on Enter. The scanned string is stripped to alphanumeric characters before calling `selectVoucher(coupon_code)`.
- `WaitingScanModal` is shared by voucher, GCash CPM, and customer-balance scans. It shows `waiting_scan.jpg` plus one of three tips: voucher code, GCash QR, or customer balance QR.
- The global scanner path in `App.vue` treats scanner input as fast keyboard events: if the second key arrives within 20ms, subsequent keys are buffered until Enter, then `scanContent` is set and `scanCount` increments. BillOut listens to `scanCount` and routes handling by scan-ready flags.
- For online payment, GCash CPM scan writes the scanned value to `auth_code` before creating the payment order. Customer-balance scan calls `GET /user/scanUserQrCode` with `key`, validates balance against the bill total, then writes returned `user_no` into the payment request.
- In billing details, selected vouchers render as a separate clickable `Voucher` row with the discount amount and a right-arrow indicator. If the voucher came from phone/email lookup, a `Voucher Phone` row is shown below it. Clicking the voucher row reopens the voucher list for phone/email vouchers and allows switching or clearing the selection.
- PWD/SC discount selection opens a discount-info modal. The cashier enters `discounter_name`, `discount_nos`, `discount_validity_period`, and `discountNumber`. The frontend maps PWD/SC to full-order or per-person discount types by comparing `discountNumber` with guest count, then calls `POST /tax/order/amount` with `discount_type`, `discount_id`, `discount_number`, `order_number`, `product_amount` when needed, and `order_channel`.
- PWD/SC amount rendering uses backend amount fields: `discount_amount` updates the discount amount and `tax_info` updates VAT/PWD breakdown; the online frontend treats PWD and SC as mutually exclusive with normal/custom/voucher discounts.
- Manual order submit also calls `POST /tax/order/amount` before final payment. The online `getAmounts` helper always sends `product_amount`: it uses an explicit value for not-yet-created orders, otherwise derives it from the loaded order amount. When manual order includes PWD/SC, it also sends `total_amount`, `is_manual_order: true`, `discount_type`, `discount_id`, `discount_number`, and `order_number`; for manual order, `discount_number` is set to the guest count so PWD/SC is treated like whole-order discount. The returned `tax_info` is used for Billing Details and VAT Breakdown, including `pwd_discount` and `less_vat`.
- Backend manual-order PWD/SC calculation reverse-computes the PWD/SC pre-discount base from `total_amount` and rejects requests when that base is lower than `product_amount` with code `20118`. Per the manual-order requirement document, this low-amount PWD/SC case must be rejected instead of converted into mixed promo + PWD/SC discounts; show `tips.manual_order_amount_tips` and keep the cashier in the manual-order form.
- Manual-order `order_channel` uses the shared `orderTypeMap` data: `1 Table Ordering`, `2 Online Ordering`, `3 Counter Ordering`, `0 All`, `4 Grab`, `5 Foodpanda`, `6 ShopeeFood`, `7 GoFood`, `99 Others`. The manual-order modal filters these by country, while order detail displays `order_channel` through `orderTypeMap(value).label` rather than the ordinary table/takeout/wait channel map.

Offline Windows cashier impact:

- For order settlement behavior, compare against `src/views/table-manage/bill-out.vue` before changing this repository's bill-out/payment screen.
- For menu/order creation behavior, compare against `src/views/table-manage/menu.vue` and `src/views/table-manage/counter-menu.vue`.

## Store-Level Business State

Source checked:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/store/modules/user.js`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/store/modules/food.js`

Stable behavior:

- Login encrypts account/password with `cryptoJSAesEncrypt`.
- Login stores token as JSON `{ value: data.token }`.
- Logout removes token, resets router, resets `user`, `food`, and `permission` modules, unbinds native websocket via `dsBridge`, refreshes the secondary display broadcast, and closes websocket.
- `food` module stores `merchantInfo`, pending table-order list, pending online-order list, pop-up flags, and secondary display settings.
- Useful derived flags include service fee status/type, VAT status, tax fee switch, before-meal mode, PWD discount switch, inventory switch/type, takeout switch, clock photo switch, table-order switch, and wait-order switch.

Offline Windows cashier impact:

- When implementing offline equivalents, keep the same business flags visible in local state if screens depend on them.
- Secondary display and websocket behavior may need repository-specific equivalents because this project is Electron/offline oriented.

## Cashier API Wrapper Map

Source checked:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/table-manage/order.js`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/table-manage/table-manage.js`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/order/order.js`

Important endpoints used by the online front-end:

- Login/session:
  - `POST /restaurant/cashier/login`
  - `GET /cashier/user`
  - `POST /restaurant/cashier/logout`
  - `GET /cashier/restaurant/restaurantInfo`
- Table/menu:
  - `GET /cashier/order/tableOrders`
  - `POST /cashier/product/list`
  - `POST /cashier/product/productDetail`
- Order:
  - `POST /cashier/order/create`
  - `POST /cashier/order/create/order/payment`
  - `POST /cashier/order/payment/create`
  - `POST /cashier/order/cashReceived`
  - `POST /cashier/order/complete`
  - `POST /cashier/order/cancelOrder`
  - `POST /cashier/order/cancelOrderByOrderInnerNo`
  - `POST /cashier/order/reduceOrder`
  - `POST /cashier/order/tableOrderDetail`
  - `POST /cashier/order/query`
  - `POST /cashier/order/table/clear`
  - `POST /cashier/order/customer/add`
  - `GET /cashier/order/customer/get`
  - `POST /cashier/order/table/change`
- Payment/tax:
  - `GET /cashier/order/payment/channel/get`
  - `GET /cashier/order/payment/status/check`
  - `GET /cashier/order/payment/qrcode/get`
  - `GET /tax/get`
  - `GET /tax/order/get`
  - `GET /tax/discount/get`
  - `GET /app-api/order/qrph/channel/get` via explicit `serviceUrl: 'app-api'`
- Printing:
  - `GET /order-print/kitchen`
  - `GET /order-print/table/kitchen`
  - `GET /order-print/bill`
  - `GET /order-print/payment`
  - `GET /order-print/order/orderInnerNo`
  - `POST /order-print/takeout/print`
  - `GET /order-print/refund/orderNo`
  - `GET /order-print/label`
  - `POST /order-print/downloadTicketData`
- Online/takeout:
  - `GET /cashier/takeout/order/pending/all`
  - `POST /cashier/takeout/order/page`

## Future Summary Targets

Good next domains to summarize:

- Exact order-create payload built by `menu.vue`.
- Exact payment-create payload built by `bill-out.vue`.
- Discount/PWD/SC validation and amount calculation.
- Printer data and print-trigger behavior.
- Online-order/takeout notice and acceptance flow.

## Login Clock-In And Sidebar End-Shift

Source checked on 2026-06-11:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/login/index.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/index.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/counter-menu.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/components/SideBar/index.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/attendance/index.js`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/report/report.js`

Stable behavior:

- Login clock-in calls `POST /restaurant/cashier/clock` with `waiter_clock_type: 1`, `opening_fund: 0`, and optional photo `url`.
- If login created a clock-in record, Vuex `updateOpenFund` is set so the first table/counter screen opens an opening-fund modal after entering the system.
- Opening-fund submit calls `POST /restaurant/report/openingFund/update` with `waiter_no` and `opening_fund` in minor units.
- Sidebar end-shift first checks unfinished orders with `GET /cashier/order/isOrderNotCompleted`; unfinished orders block sign-out and route to order handling.
- If clock photo is enabled, end-shift captures/uploads a sign-out photo before cash-on-hand input.
- Cash-on-hand submit calls `POST /restaurant/cashier/clockReportData` with `waiter_clock_type: 2`, `cash_on_hand` in minor units, and optional photo `url`; the returned cashier report is shown before logout.
- Cash-on-hand Auto-Calculate uses the same clock-out report endpoint but calls `clockOut(null)`, so `cash_on_hand` is omitted and the backend derives it from the shift report data.
- Opening-fund auto/default behavior submits `0` for `opening_fund`.

Offline Windows cashier impact:

- The offline main process should own the local equivalents of `clock`, `openingFund/update`, and `clockReportData` because they mutate SQLite and generate reports.
- Renderer code should keep the online sequence: login clock-in -> enter system -> opening-fund modal, and end-shift -> unfinished-order check -> optional photo -> cash-on-hand -> cashier report -> logout.

## Login Language Selector

Source checked on 2026-07-03:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/login/components/LangSelect.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/assets/img/EN.png`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/assets/img/CN.png`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/assets/img/TH.png`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/assets/img/KM.png`

Stable behavior:

- Online login language selector displays a 21px flag icon plus language label.
- Language labels are `English`, `中文`, `ภาษาไทย`, and `ភាសាខ្មែរ`.
- Offline Windows cashier copied these four small PNG flag assets into `src/renderer/src/assets/language-flags/` for its login/settings language selectors.

## Cashier Menu Product Availability

Source checked on 2026-07-08:

- Online menu product list uses `POST /cashier/product/list`; the Vue menu page does not directly inspect `valid_status`.
- Backend `waiterRestaurantProduct()` filters product summaries to `valid_status = VALID(1)` and removes categories whose product list is empty.
- Product detail uses `POST /cashier/product/productDetail`; backend can reject products whose product record is not valid or whose category is invalid, but the offline Windows cashier currently keeps detail loading simple and relies on list rendering to hide invalid products.
- Online `DishItem.vue` and `DishDetailModal.vue` have `sold_out` controls, but the offline Windows cashier currently treats `sold_out` as an ineffective field and should not migrate that behavior unless the product requirement changes.

Offline Windows cashier impact:

- Local menu list queries should apply the backend-equivalent `valid_status = 1` and `del_status = 1` filters for categories/products, and should omit categories with no effective products.
- Local product detail does not need an extra `valid_status` gate after the menu list has hidden invalid products; `sold_out` should remain non-controlling in this project version.

## Offline Orders Button Visibility

Source checked on 2026-06-08:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/order/index.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/components/Modal/OrderNoticeModal.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/components/TableItem.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/utils/common.js`

Stable behavior:

- In the offline orders detail action area, `View Digital Copy` is shown only for Philippines orders with `payment_status` paid or refunded, and hidden for manual orders (`order_app = 7`).
- `View Digital Copy` opens `ReceiptPreviewModal` with `type` `['payment']` or `['payment', 'refund']` when the order is refunded. The modal calls `POST /order-print/preview` with `preview_type = 5` for payment, `preview_type = 4` for refund, and `is_download = false`, then renders the returned base64 image directly in an `<img>`.
- `Refund` is shown only when the cashier has `AUTH_CASHIER_REFUND` and `payment_status` is paid or refund-failed.
- `Edit Order` is shown when at least one edit action is available: take, cancel, serve, complete, or bill out.
- `Cancel` edit action:
  - non-wait order, before-meal mode: unpaid or pay-failed and order status pending, not refunding/refund-pending;
  - non-wait order, after-meal mode: unpaid or pay-failed and order status pending or taken, not refunding/refund-pending;
  - wait order: unpaid or pay-failed and order status pending, not refunding/refund-pending.
- `Bill Out` edit action is hidden for wait orders. For non-wait orders it is shown when the order is payable and not previously paid; before-meal mode requires pending status, after-meal mode requires taken status.
- `Complete` edit action is hidden while refunding/refund-pending. For wait orders it requires waiting-pick-up status; for non-wait orders it requires taken status and paid/refund-failed payment status.
- `Print Receipt` is shown when order status is taken, waiting-pick-up, or complete; before-meal paid pending orders also show it.
- Print dropdown item visibility:
  - refund receipt: refunded and not manual order;
  - order receipt: taken, waiting-pick-up, or complete;
  - payment receipt: any paid/refund-process/refund-failed status and not manual order;
  - kitchen receipt: taken, waiting-pick-up, or complete;
  - label receipt: non-pending orders in cashier/electron context.
- The pending table/wait order notice modal uses a `btnOptions` matrix rather than fixed buttons:
  - wait order pending + unpaid: Cancel;
  - wait order pending + paid/refund-failed: Refund, Take;
  - wait order taken: Refund, Serve;
  - wait order waiting-pick-up: Refund, Complete;
  - table order before-meal pending + unpaid: Cancel, Bill Out;
  - table order before-meal pending + paid/refund-failed: Refund, Take;
  - table order before-meal taken + paid/refund-failed: Refund, Complete;
  - table order after-meal pending: Cancel, Take;
  - table order after-meal taken + unpaid/pay-failed: Cancel, Bill Out;
  - table order after-meal taken + paid/refund-failed: Refund, Complete.
- Table management table cards render up to two order status tags. Pending orders are prioritized at the top. If any order is pending, the card uses the pending style; if every displayed active order is taken and paid, the card uses the complete/clearable style. The card's complete action calls table clear (`PostTableClear`) rather than single-order complete.

## Before-Meal Table Order Creation Flow

Source checked on 2026-06-09:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/menu.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/bill-out.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/table-manage/order.js`

Stable behavior:

- In table menu, before-meal mode hides the standalone `Order` button; after-meal mode shows it and calls `POST /cashier/order/create`.
- For before-meal table Bill Out with selected dishes, `menu.vue` does not call `POST /cashier/order/create`. It pushes a temporary order payload through router params to `Bill_Out`, including `customer_num`, `table_uuid`, `order_list`, `customer_dining_style`, and `remark`.
- `bill-out.vue` treats a missing `order_inner_no` as `isNotCreateOrder`. It renders and edits the temporary `order_list`, and for amount APIs passes `product_amount` because no server order exists yet.
- On charge in before-meal mode, `bill-out.vue` builds `{ order_req, payment_req }` and calls `POST /cashier/order/create/order/payment` (`PostOrderPaymentCreate`) for table orders. That endpoint creates the food order and payment order together, then returns `order_inner_no` and `mch_order_id`.
- Cash payment in this flow opens the cash receive modal with the returned `order_inner_no`; online payment/status flows also use the returned order id for subsequent status handling.
- Queue ordering is not sent to the table before-meal endpoint. `menu.vue` may create a queue food order first with `POST /wait/order/order/create`; when Bill Out needs to create order and payment together, `bill-out.vue` chooses `POST /wait/order/create` instead of `POST /cashier/order/create/order/payment`.

## Bill Out Non-Cash QRPH Payment Modal

Source checked on 2026-06-22:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/bill-out.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/components/Modal/PaymentStatus.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/components/Modal/PaymentQRPHModal.vue`

Stable behavior:

- `bill-out.vue` mounts payment status modals after online payment order creation.
- `PaymentQRPHModal` is a centered 762px modal that cannot be closed by mask click. It shows the payment channel name as title.
- On open, `PaymentQRPHModal` checks payment status, fetches QR code from `GET /cashier/order/payment/qrcode/get`, and fetches QRPH channel lists from `app-api /order/qrph/channel/get`.
- The QR page shows scan/pay instructions, a 166px QR image, amount, optional transaction fee, four recommended channel logos for QRPH, a `See More...` channel-list switch, and a 300px `Check Status` button.
- Manual `Check Status` sets submitting state; if still unpaid it warns `tips.not_paid_successfully`.
- Status polling treats missing data or `transaction_status = UNPAY` as pending and retries after 5 seconds.
- `transaction_status = PAY_SUCCESS` switches the modal to the success icon/title/description, resets LED display to `0.00`, and tells the secondary screen to show the default page.
- `transaction_status = PAY_FAIL` switches the modal to the failure icon/title/description.
- Once success or failure is shown, the footer displays one 96px `Complete` button. Closing/completing the modal navigates back one route.

Offline Windows cashier impact:

- Non-cash online payment creation should not stop at a success toast. It should open an equivalent QR/status-check modal, poll by `mch_order_id`, and run local sync/printing side effects only after the payment reaches a final success/failure state.
- Electron-specific secondary display/LED behavior should use this repository's existing equivalent if present; otherwise preserve payment status polling and order finalization behavior.

## Staff Clock-In Rendering Rules

Source checked on 2026-06-10:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/login/index.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/staff/index.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/components/StaffEmployeeItem.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/store/modules/user.js`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/store/modules/food.js`

Stable behavior:

- Login decides whether to run clock-in from `user/isOpenClock`, which reads `userInfo.clock_status === CLOCK_STATUS.ON` from `GET /cashier/user`.
- Login also requires `user.isNeedClock`, set when `userInfo.waiter_status === OUTED`, before automatically clocking in.
- Clock photo enablement comes from `food/isOpenClockPhoto`, which reads `merchantInfo.clock_photo_status === ON` from restaurant info.
- Staff employee cards do not globally disable IN/BREAK/OUT using restaurant `clock_status`.
- Staff IN: if `waiter_status === WORKING`, show "you have punched in" and do not submit; otherwise continue to photo/default-image flow and clock.
- Staff BREAK: if `waiter_status` is missing, show "please punch in"; if `WORKING`, call rest then navigate to break page; if `RESTING`, navigate to break page; if `OUTED`, no operation.
- Staff OUT: requires `waiter_status === WORKING`; otherwise show punch-in error. Before clocking out, online web checks unfinished orders with `GetIsOrderNotCompleted` and routes to order pages if needed.
- For current logged-in staff, online web opens amount input modals for opening fund on IN and cash on hand on OUT; for other staff it clocks directly.

## Sidebar End Shift Flow

Source checked on 2026-06-11:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/components/SideBar/index.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/components/CashierReportModal.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/attendance/index.js`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/order/order.js`

Stable behavior:

- The sidebar shows `End your shift` only when `user/isOpenClock` is enabled.
- Clicking `End your shift` first calls `GET /cashier/order/isOrderNotCompleted`.
- If unfinished offline or online orders exist, the sidebar closes and a warning confirm routes the cashier to the relevant orders page; it does not clock out.
- If there are no unfinished orders, the flow continues to clock-out.
- When `food/isOpenClockPhoto` is enabled, the online web opens camera, uploads the photo with business `WAITER_CLOCK_PHOTO`, and sends the returned relative path as `url`.
- When clock photo is disabled or the native cashier context is used, the online web uses the default clock image path `phpay-food/waiter/clock/swifood_default_clock.jpg`.
- Before submitting clock-out, the online web opens a cash input modal and sends `cash_on_hand` in cents plus `waiter_clock_type: 2` to `POST /restaurant/cashier/clockReportData`.
- Successful clock-out displays `CashierReportModal`; closing that report logs the user out and returns to `/login`.
- Cashier Reports renders `Withdrawal Report` when the queried settlement report has `withdrawal_record.length > 0`. Less Withdrawal submit immediately opens the Cash on Hand input, and the page refreshes report data after Cash on Hand submit/cancel, so the button appears from the refreshed `withdrawal_record`.
- `Withdrawal Report` calls `POST /order-print/print/lessWithdrawal` with the same report time params as the selected shift.

## Source Reading Notes

When source-level reference is needed, read only the relevant files from `swifood-cashier-ipad-h5`. Do not modify that source.

## Bill Out Manual Order Modal

Source checked on 2026-06-26:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/bill-out.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/table-manage/components/Modal/ManualOrderModal.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/table-manage/order.js`

Stable behavior:

- The `Payment Channel` header renders the manual order button in `bill-out.vue`; clicking it calls `onClickManualOrder()`.
- `bill-out.vue` registers the dialog as `ManualOrderModal: () => import('./components/Modal/ManualOrderModal.vue')`, renders `<ManualOrderModal ref="manualOrderModal" @submit="onSubmitManualOrder" />`, and opens it through `this.$refs.manualOrderModal.showModal()`.
- `ManualOrderModal.vue` owns the Element UI `el-dialog`, form validation, optional serial-number validation, and emits `submit` back to `bill-out.vue`.
- Final manual-order payment creation uses `PostCreateManualOrder` in `src/api/table-manage/order.js`, which posts to `/cashier/order/create/manual/order`.

## Z-Reading End-Of-Day Generation

Source checked on 2026-06-23:

- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/views/report/day.vue`
- `/Users/wayne/paycools/swifood/front-end/swifood-cashier-ipad-h5/src/api/report/report.js`

Stable behavior:

- The Z-Reading page checks whether a day report has already been generated by calling `POST /order-print/check/day/report` with the same report time params used for report query/printing. The boolean response updates `isGeneratedDayReport`.
- The End-of-Day button text is `report.print_day_report` (`End Your Day`) when `isGeneratedDayReport` is false, and `report.print_history_day_report` (`Reprint Receipt`) when true.
- Clicking print first shows a confirmation dialog only when `isGeneratedDayReport` is false. Confirm continues to `POST /order-print/report` with `type = 2`; cancel stops the flow.
- After print/report generation succeeds, the online frontend sets `isGeneratedDayReport = true`, so revisiting or continuing on the page shows the reprint state.

Offline Windows cashier impact:

- The offline equivalent should check local `restaurant_report_print` for the same restaurant, device, print type, and report start/end time used when persisting the end-of-day report snapshot.

## Label Printer Flow

Source checked on 2026-06-17:

- `D:/Paycools/swifood-cashier-ipad-h5/src/App.vue`
- `D:/Paycools/swifood-cashier-ipad-h5/src/views/table-manage/order-list.vue`
- `D:/Paycools/swifood-cashier-ipad-h5/src/api/order/order.js`

Stable behavior:

- `GET /order-print/label` is the manual Label Receipt endpoint. `order-list.vue` calls it with `order_inner_no`; the backend then pushes the actual print message.
- Label Receipt is shown for non-pending cashier orders.
- The online app consumes print pushes through the same USB print bus shape: `triggerUSBPrinter(base64Data, assignedPrinterTypes, targetUsbDeviceID)`.
- For labels, the pushed message has `print_type = 6`, `data_type = 2`, `print_info` as a JSON string, optional `mac_id`, and label-specific fields such as `print_size_type` and `print_language`.
- Android uses `jsapi.printLabel({ data: base64Data.print_info, deviceName })`; Windows/Electron sends the parsed label object through USB printing, where the local layer converts it to label-printer commands.

## USB Printer Configuration

Source checked on 2026-07-06:

- The online USB printer configuration modal uses `category_resp_list` to prefill selected categories, then writes their ids into `category_ids`.
- For label printers, the modal maps `paper_width` to `print_size_type`, sends `mac_id`, `nick_name`, `old_printer_type_id`, and posts through `SaveLabelPrinterSettings` to `/order-print/label/save`.
- The USB printer list normalizes missing `category_resp_list` to `[]`, and label/kitchen category tags are removed by updating the same selected category array before save.

## Offline Order Detail Amount Fields

Source checked on 2026-07-08:

- `src/views/order/index.vue` shows `Discount Amount` when `orderDetail.discount_amount` is present and no `coupon_code` is bound.
- It shows `Voucher` when `orderDetail.coupon_amount` is present.
- It shows `Less VAT` when `orderDetail.tax_info.less_vat` is present.
- In Other Info, Philippine orders show a text discount type (`PWD`, `SC`, or `Custom`), append discount number for PWD/SC per-person discount types, and show PWD/SC identity fields plus voucher name/id/ticket fields when present.

Offline Windows cashier impact:

- The offline orders detail page should not gate discount display only on `discount_type = CUSTOM`; it must also render voucher and Less VAT rows from the detail response.

## Bill Out Cash Receive Confirmation Fields

Source checked on 2026-08-04:

- `src/views/table-manage/components/Modal/CashReceiveModal.vue`

Stable behavior:

- The cash confirmation Billing Details lists Sub-total, optional Discount, configured Service Fee, optional Voucher, Total, and Cash Received before showing Change.
- Discount and Voucher amounts are displayed as negative values.

Offline Windows cashier impact:

- The offline requirement intentionally keeps Service Fee visible even when its value is zero.
- The Total `incl. VAT` suffix follows the offline restaurant setting `vat_included`, matching the main Bill Out Billing Details block.
