# Backend API Summary: `phpay-food`

## Mall Certification, End-of-Day, And BIR Report Refresh

Source checked on 2026-08-07:

- `WaitOrderBusinessImpl.getOrderSMTransactionsList/getOrderSMTransactionsDetailList/getOrderParqalSales/getOrderMegaWorldSales`
- `RestaurantReportBusinessImpl.queryCycleReport/downloadBirReport`

Stable behavior:

- SM transaction exports use payment transaction timestamps, `SM01`, numeric refund flags, tax snapshot discount fields, and zero sales/tax/discount fields on refunds; SM detail rows use SKU/category/option snapshots and allocate Promo/PWD/SC discounts per item.
- Parqal accumulated VAT subtracts the VAT portion of prior promo discounts; discounted current transactions also recalculate VAT from the discount or coupon amount.
- Megaworld S/H/D filenames no longer append `.txt`; CREDIT, DEBIT, and CHARGE all contribute to the credit-card amount.
- At backend commit `8192e5634a8da03eb053a7568625fc604fed9da5`, `WaitOrderBusinessImpl.getOrderMegaWorldSales` still derives Megaworld S-file item 16 as net minus credit-card amount minus cash plus service fee; it does not directly sum non-CASH/non-CREDIT/non-DEBIT settlement channels. The offline cashier intentionally uses the latter testing-required rule.
- End-of-Day cycles are attributed by final payment `transaction_return_time`, include surcharge in sales/refund arithmetic, and carry accumulated sales from the previous valid EOD report snapshot.
- BIR E-1 rows read monetary data from each saved EOD snapshot. Receipt ranges use snapshot fields for new reports, refund adjustment fields map separately, and E-2/E-3 select successful PWD/SC payments by transaction completion time.

## BillOut Percentage Service Fee Tax Base

Source checked on 2026-08-05:

- `order-inner/order-provider/.../TaxBusinessImpl.java`

Stable behavior:

- For an approved VAT-registered restaurant, `/tax/order/amount` first removes included 12% VAT from `product_amount`, then uses that unrounded-to-major-unit integer `VATable Sales` amount as the percentage service-fee base.
- Fixed service fees are not affected; when VAT calculation is disabled, percentage service fees use the product amount directly.

## PWD/SC Amount Rules Used By The Offline Cashier

Source checked on 2026-08-07:

- `order-inner/order-provider/.../TaxBusinessImpl.java`

Stable behavior:

- VAT PWD/SC first rounds `product_amount / 1.12` to the VATable sales amount. Whole-order discount exempts all VATable sales and removes all included VAT; per-person discount allocates VAT-exempt sales, VAT exemption, and the 20% discount by `discount_number / order_number`, rounding each amount half-up.
- NON-VAT PWD/SC applies a 20% discount to the whole product amount or the eligible-person proportion and does not calculate Less VAT.
- Manual-order PWD/SC reverse-calculates the pre-discount product amount from the entered final amount, rejects a result below the system product amount, records any excess as surcharge, and then calculates the same VAT/20% breakdown.

Offline Windows cashier impact:

- These formulas are implemented locally for both online and offline PWD/SC because local BIR configuration is authoritative. Backend ID verification and `/tax/order/amount` are not used by the local PWD/SC flow.

Source path:

`/Users/wayne/paycools/swifood/back-end/phpay-food`

Alias: 后端接口源码

This is the backend API and business-rule reference. Use it to understand endpoint behavior, request/response contracts, validation rules, persistence semantics, and server-side business logic that the offline Windows cashier must respect.

## Verified Source Snapshot

Checked on 2026-06-02.

- Root `pom.xml`: Java 11, Spring Boot 2.7.3, Spring Cloud 2021.0.5, Spring Cloud Alibaba 2021.0.4.0, MapStruct 1.5.2, MyBatis Plus, Redisson, Seata, XXL Job, Lombok.
- Repository is a Maven multi-module backend, not a PHP codebase despite the `phpay` name.
- Main modules include:
  - `gateway`: request routing/filtering.
  - `cashier-api`: cashier-facing API layer.
  - `app-api`: customer app API layer.
  - `waiter-api`: waiter-facing API layer.
  - `merchant-api`: merchant/admin API layer.
  - `open-api`: external/open order API.
  - `order-inner`: order SPI/provider, request/response DTOs, constants, SQL docs.
  - `merchant-inner`: merchant/product/restaurant SPI/provider and DTOs.
  - `auth-inner`: auth and waiter/cashier login logic.
  - `clouddevice-inner`, `im-inner`, `commons`, `components`.

## Backend Development Rules

Source checked:

- `/Users/wayne/paycools/swifood/back-end/phpay-food/README.MD`
- `/Users/wayne/paycools/swifood/back-end/phpay-food/cashier-api/src/main/java/com/paycools/phpay/food/cashier/api/config/SnakeWebConfig.java`

Stable behavior:

- `inner` layers return concrete objects directly.
- `api` layers wrap responses as `Resp<T>`/`ApiResponse<T>`.
- A client normally talks to one API layer, which forwards to inner/SPI layers.
- Controllers should not directly perform business updates; they may supplement queries and delegate business logic to SPI/services.
- Database enums live under SPI `constant` directories and implement `BaseEnum` for request parsing and DB value mapping.
- API DTO conversion uses MapStruct structs in `struct` directories.
- Merchant/manager/cashier API layers use snake_case request/response naming for front-end compatibility.
- `cashier-api` config converts JSON to/from snake_case and converts query parameters from lower_underscore to lowerCamel before controller binding.
- Date/time formats include `yyyy-MM-dd HH:mm:ss`, `yyyy-MM-dd`, and configured local time pattern.

Offline Windows cashier impact:

- Treat backend API field names as snake_case at the HTTP boundary.
- Preserve `ApiResponse` semantics and success code handling from the online front-end.
- When mapping to local offline models, keep a clear boundary between local camelCase state and backend snake_case payloads.

## Non-Label Printer Language Selection

Source checked on 2026-08-05:

- `order-inner/order-provider/.../PrintBusinessImpl.java`
- `order-inner/order-provider/.../PrintHandlerChineseImpl.java`
- `order-inner/order-provider/src/main/resources/template/print/*-cn*.vm`

Stable behavior:

- Backend selects `PrintHandlerChineseImpl` per Receipt/Kitchen printer when `PrinterLanguage.CHINESE` is configured and sets `PrintOrderBo.chinese = true`.
- The Chinese handler covers Order, Bill, Payment, Refund, Takeout, and Kitchen receipts for 58mm/80mm Bluetooth printing.
- Chinese templates translate business labels such as table/customer count, waiter, print time, item headers, quantities, fees, discounts, change, notes, and customer information.
- Regulated identifiers and tax wording such as VAT/NON-VAT TIN, MIN, SERIAL, ORDER ID, SI, REFUND, TRANS, tax breakdown labels, receipt titles, legal statements, and the company footer remain English.
- `PrintHandlerChineseImpl` does not override report generation; End-of-Shift, End-of-Day, and Summary-of-Products continue to use the common English report templates.

Offline Windows cashier impact:

- Current printer language must be applied at receipt generation time instead of trusting the historical print snapshot language.
- Do not translate the backend-retained English regulatory fields when adding the offline Chinese receipt template.

## Offline Sync Endpoint Availability

Stable project fact:

- Cashier offline synchronization endpoints under paths such as `/cashier-api/cashier/offline/sync/**` are not expected to appear in the currently available backend source checkout.
- When implementing or verifying offline sync behavior in the offline Windows cashier, treat user-provided API documentation, screenshots, and observed runtime responses as the source of truth for these sync endpoints.

Offline Windows cashier impact:

- Do not treat missing `/cashier/offline/sync/**` controller/service code in `phpay-food` as evidence that a sync endpoint does not exist.
- For sync endpoint contracts, prefer this repository's existing sync implementation plus user/API documentation over backend source search.

## Cashier API Modules And Endpoints

Source checked:

- `cashier-api/src/main/java/com/paycools/phpay/food/cashier/api/controller/**`

Important endpoint groups:

- Login/account:
  - `POST /restaurant/cashier/login`
  - `POST /restaurant/cashier/crm/login`
  - `POST /restaurant/cashier/logout`
  - `POST /restaurant/cashier/modifyCashierMode`
- User/permission:
  - `GET /cashier/user`
  - `GET /user/scanUserQrCode`
- Restaurant/table/settings:
  - `GET /cashier/restaurant/restaurantInfo`
  - `GET /cashier/restaurant/areaTableInfo`
  - `GET /cashier/restaurant/table/leisure/list`
  - `POST /cashier/restaurant/waiter/list`
  - `GET /cashier/restaurant/secondary/display/setting/info`
  - `POST /cashier/restaurant/secondary/display/setting/save`
- Product/menu:
  - `POST /cashier/product/list`
  - `POST /cashier/product/productDetail`
  - `POST /cashier/product/productSearch`
  - `POST /cashier/product/category/list`
- Order:
  - `POST /cashier/order/page`
  - `GET /cashier/order/detail`
  - `GET /cashier/order/tableOrders`
  - `POST /cashier/order/tableOrderDetail`
  - `POST /cashier/order/cashier/pendingOrders`
  - `POST /cashier/order/take`
  - `POST /cashier/order/complete`
  - `POST /cashier/order/cashReceived`
  - `POST /cashier/order/cancelOrder`
  - `POST /cashier/order/cancelOrderByOrderInnerNo`
  - `POST /cashier/order/payment/create`
  - `POST /cashier/order/create`
  - `POST /cashier/order/create/order/payment`
  - `POST /cashier/order/create/manual/order`
  - `POST /cashier/order/reduceOrder`
  - `POST /cashier/order/table/clear`
  - `POST /cashier/order/customer/add`
  - `GET /cashier/order/customer/get`
  - `POST /cashier/order/customer/update`
  - `POST /cashier/order/table/change`
  - `POST /cashier/order/refund`
  - `GET /cashier/order/isRefundStatus`
  - `GET /cashier/order/isOrderNotCompleted`
- Payment/tax:
  - `GET /cashier/order/payment/channel/get`
  - `GET /cashier/order/payment/qrcode/get`
  - `GET /cashier/order/payment/status/check`
  - `GET /tax/get`
  - `GET /tax/order/get`
  - `GET /tax/discount/get`
  - `POST /tax/discount/info/verification`
  - `POST /tax/order/amount`
- Takeout/online order:
  - `POST /cashier/takeout/order/page`
  - `GET /cashier/takeout/order/pending/all`
  - `POST /cashier/order/takeout/take`
  - `POST /cashier/order/takeout/arrived`
  - `POST /cashier/order/takeout/start/delivery`
  - `POST /cashier/order/takeout/cancel`
  - `GET /cashier/order/takeout/order/status/change`
- Printer:
  - `GET /order-print/payment`
  - `GET /order-print/kitchen`
  - `GET /order-print/table/kitchen`
  - `GET /order-print/bill`
  - `GET /order-print/order`
  - `GET /order-print/order/orderInnerNo`
  - `POST /order-print/takeout/print`
  - `GET /order-print/refund/orderNo`
  - `POST /order-print/report`
  - `GET /order-print/label`
  - `POST /order-print/preview`
  - `POST /order-print/downloadTicketData`
  - `POST /order-print/label/save`
  - `GET /order-print/label/query`
- Inventory/report/staff/printer setup:
  - `GET /restaurant/inventory/ingredient/page`
  - `POST /restaurant/inventory/ingredient/update`
  - `GET /restaurant/inventory/page`
  - `POST /restaurant/inventory/update`
  - `POST /restaurant/cashier/clock`
  - `POST /restaurant/cashier/rest`
  - `GET /restaurant/report/settlement/query`
  - `GET /restaurant/report/summary/query`
  - `GET /restaurant/report/end-day/query`
  - `POST /bluetooth/printer/save`
  - `POST /bluetooth/printer/list`
  - `POST /bluetooth/printer/update`
  - `POST /cloud/printer/bind`
  - `GET /cloud/printer/list`

## Cashier Order Detail Coupon Fields

Source checked on 2026-07-09:

- `cashier-api/.../controller/order/OrderCashierController.java`
- `order-inner/.../entity/resp/OrderDetailResp.java`

Stable behavior:

- `GET /cashier/order/detail` accepts query parameter `order_inner_no` from the cashier front end; backend binds it to `orderInnerNo`.
- `OrderDetailResp` returns voucher fields at the top level: `couponCode`, `couponAmount`, `couponName`, and `couponBatchNo`.
- It also returns customer identity fields `userNo` and `userName`.

Offline Windows cashier impact:

- When storing post-payment voucher display snapshots, use `order_inner_no` as the request parameter and map the JSON snake-case response to local `coupon_code`, `coupon_amount`, `coupon_name`, `coupon_batch_no`, `user_no`, and `user_name`.

## Cashier Product Options

Source checked on 2026-06-24:

- `cashier-api/.../ProductController.java`
- `merchant-inner/.../ProductBusinessImpl.java`
- `merchant-inner/.../OptionBusinessImpl.java`
- `merchant-inner/.../OptionResp.java`
- `merchant-inner/.../OptionItemResp.java`

Stable behavior:

- `POST /cashier/product/list` delegates to `productSpi.waiterRestaurantProduct()` and returns menu categories plus product summaries. It queries category, product, SKU price range, inventory/warning/sold-out state, then clears the internal product `id`; it does not populate product option/small-item data.
- `POST /cashier/product/productDetail` is the cashier endpoint that populates `option_list`. It loads the product by `product_no`, queries specs, then queries `product_option_item` by product id.
- Product option response assembly treats `product_option_item` as a relation table only. It extracts `option_id` and `option_item_id`, loads not-deleted `restaurant_option` rows and matching `restaurant_option_item` rows, then builds `OptionResp.option_item_list` with option item name, price, sort, `product_option_item_no`, and `recommended_status`.
- If a `product_option_item` row points to a missing/deleted `restaurant_option` or missing `restaurant_option_item`, the backend cannot build a visible option item for the cashier response.

Offline Windows cashier impact:

- Local product detail should not treat rows from `product_option_item` alone as complete small-item data; it must join the option and option item master tables to get displayable names, prices, choice/required rules, and deletion filtering.

## Order Detail And Detail Snap Option JSON

Source checked on 2026-07-10:

- `order-inner/.../entity/resp/OrderOptionQueryResp.java`
- `order-inner/.../entity/req/OrderSkuOptionReq.java`
- `order-inner/.../entity/req/OrderSkuOptionItemReq.java`
- `order-inner/.../business/impl/OrderBaseBusinessImpl.java`

Stable behavior:

- `OrderBaseBusinessImpl` persists `JSON.toJSONString(sku.getOptionList())` into `order_detail.detail_snapshot`, then copies that exact value into `order_detail_snap.option_item_json`.
- FastJSON uses the Java DTO property names, so both database fields store camelCase keys: `optionNo`, `optionName`, `optionItemList`; item keys are `optionItemNo`, `productOptionItemNo`, `optionItemName`, and `price`.
- The fields contain only the selected option list, not the full cashier product/cart object.

Offline Windows cashier impact:

- Local persistence must write the camelCase backend database shape to both fields; local UI boundaries may convert it back to snake_case.
- Startup migration should repair the historical full-product `detail_snapshot` and snake_case/name option variants.

## Cashier Clock And Allowance Persistence

Source checked on 2026-06-11:

- `cashier-api/.../RestaurantCashierClockController.java`
- `cashier-api/.../RestaurantReportController.java`
- `merchant-inner/.../RestaurantWaiterClockRecordBusinessImpl.java`
- `merchant-inner/.../RestaurantReportBusinessImpl.java`
- `merchant-inner/.../RestaurantWaiterClockReq.java`
- `merchant-inner/.../RestaurantAddAllowanceReq.java`

Stable behavior:

- `POST /restaurant/cashier/clock` fills `restaurantId` and default `restaurantWaiterId` from the logged-in cashier context, then delegates to `restaurantWaiterClockRecordSpi.clock(req)`.
- Clock-in (`waiter_clock_type = 1`) inserts a `restaurant_waiter_clock_record` with working time, working URL, status `WORKING`, the clocking waiter id, zero durations, and a new report flag. It also inserts a `restaurant_waiter_allowance` row with the requested `opening_fund` (login sends `0`) and `allowanceType = OPENING_FUND`.
- Clock-out (`waiter_clock_type = 2`) updates the active clock record with off time, off URL, completed status, working duration, and rest duration. If `cash_on_hand` is present, it adds/updates the allowance row with `cash_on_hand` and `end_recording_time`.
- `POST /restaurant/report/openingFund/update` validates `opening_fund` and `waiter_no`, resolves the waiter id, marks the request as `allowanceType = OPENING_FUND` and `isUpdateOpeningFund = true`, then updates the latest allowance for that waiter with `opening_fund` and `opening_time`, binding it to the latest clock record. If there is no latest clock record, it returns success without writing.
- `POST /restaurant/cashier/clockReportData` first performs clock-out through the same `clock(req)` path, then queries the settlement report for the just-finished working/off-time range, saves the JSON report snapshot into `restaurant_waiter_clock_record.report_json` when the serialized value is below the backend length guard, and returns the report.
- Settlement report calculation reads `restaurant_waiter_allowance.opening_fund`, `cash_on_hand`, `less_withdrawal`, and `end_recording_time`; when cash-on-hand has not been recorded it derives expected cash from cash payments/refunds plus opening fund minus less withdrawal.

Source checked on 2026-06-30:

- `POST /restaurant/report/less-withdrawal/add` uses `RestaurantAddAllowanceReq` with `waiter_no`, `less_withdrawal`, and `less_remark`.
- The cashier API fills `restaurant_id` from the logged-in waiter context, sets `allowance_type = LESS`, requires `waiter_no` and `less_remark`, resolves `waiter_id` by `waiter_no`, then delegates to `RestaurantReportBusinessImpl.addAllowance`.
- Backend `addAllowance` finds the latest valid clock record for the waiter and latest allowance record. For LESS it increments `restaurant_waiter_allowance.less_withdrawal` by the request amount.
- If `cash_on_hand` was already recorded, backend subtracts the new `less_withdrawal` amount from `cash_on_hand` and refreshes `end_recording_time`.
- Backend inserts a `withdrawal_record` row with restaurant id, clock id, allowance id, `once_less_withdrawal`, remark, and waiter id. Settlement report withdrawal details read from this table.
- `POST /order-print/print/lessWithdrawal` fills restaurant id from the logged-in waiter, re-queries the settlement report, and throws `"The report you want to print does not exist"` when the report or `withdrawal_record` is empty. It prints opening fund, total less withdrawal, CASH-channel received amount, cash on hand, and each withdrawal remark/amount as `***** WITHDRAWAL REPORT *****`.

Offline Windows cashier impact:

- Local IPC equivalents should mutate `restaurant_waiter_clock_record` and `restaurant_waiter_allowance` using the same sequence, but clock photos are local-only assets.
- Do not upload, cache, or otherwise preserve remote `working_url` / `off_url` clock photos for the offline Windows cashier. Server-synced historical clock photos may be ignored because stale clock photos are not meaningful in local UI and would waste disk space.
- Amounts remain integer minor units.

## Settlement Report Order Attribution

Source checked on 2026-07-03:

- `cashier-api/.../RestaurantReportController.java`
- `merchant-inner/.../RestaurantReportBusinessImpl.java`
- `order-inner/.../WaiterClockOrderBusinessImpl.java`
- `order-inner/.../OrderBusinessImpl.java`

Stable behavior:

- `GET /restaurant/report/settlement/query` uses `waiter_clock_order` for new-report settlement data.
- For a real waiter shift, the report resolves `waiter_no` to `restaurant_waiter.id`, finds the matching `restaurant_waiter_clock_record`, then reads `waiter_clock_order` rows by `restaurant_waiter_clock_record_id`.
- Positive payment totals use `record_the_order_type = POSITIVE_ORDER`; refund and cancel rows use their own record types.
- Backend payment success and cash-received flows call `addWaiterClockOrder` so paid orders are attached to the active waiter clock record. If no active waiter record exists, the row is marked as self-service.

Offline Windows cashier impact:

- Local successful payment flows must write `waiter_clock_order` against the current local `restaurant_waiter_clock_record.id`; otherwise end-of-shift reports for a selected waiter/shift will show zero orders even when `food_order` and `order_payment` are paid.
- When the renderer session may contain backend waiter ids, resolve local waiter identity through `waiter_no` before searching active clock records.

## Summary Of Products Report Attribution

Source checked on 2026-07-06:

- `cashier-api/.../RestaurantReportController.java`
- `merchant-inner/.../RestaurantReportBusinessImpl.java`

Stable behavior:

- `GET /restaurant/report/summary/query` delegates to `querySummaryReport`.
- `querySummaryReport` calls `handSummaryOrder` before aggregating product rows.
- For new-report waiter shifts, `handSummaryOrder` resolves `waiter_no` to `restaurant_waiter.id`, finds the waiter clock record with `working_time = request start_time`, then reads `waiter_clock_order` rows by `restaurant_waiter_clock_record_id` and `record_the_order_type = POSITIVE_ORDER`.
- Product rows are then read from `order_detail` for those `food_order` ids with `detail_type = INCREASE`; payment totals are read from the related `order_payment` rows.

Offline Windows cashier impact:

- Local Summary of Products must use the same waiter-clock-order attribution as End-of-Shift reports for a selected waiter shift.
- Using only `waiter_type = REAL_WAITER` or ISO-formatted timestamps can make current-shift product summaries empty or inaccurate.

## Report Printing And E-Journal

Source checked on 2026-07-01:

- `cashier-api/.../printer/OrderPrintController.java`
- `order-inner/.../ReportTypeEnum.java`
- `order-inner/.../ReportPrintReq.java`
- `order-inner/.../DownloadTicketDataReq.java`
- `order-inner/.../PrintBusinessImpl.java`
- `order-inner/.../PrintHandlerImpl.java`
- `order-inner/.../template/print/end-of-shift-report.vm`
- `order-inner/.../template/print/end-of-day-report.vm`

Stable behavior:

- `POST /order-print/report` accepts `ReportPrintReq`: `type`, `waiter_no`, `start_time`, `end_time`, `is_current`.
- Backend `ReportTypeEnum`: `END_OF_SHIFT = 1`, `END_OF_DAY = 2`, `SUMMARY_OF_PRODUCT = 3`, `REFUND = 4`, `PAYMENT = 5`.
- `printReport` builds a `PrintReportBo`, queries settlement/day/product report data, creates or reuses `restaurant_report_print`, assigns a 20-digit `receipt_id`, and increments `print_count` only after print success.
- End-of-Shift requires waiter context except self-service (`waiter_no = "0"`). Summary of Products supports All by omitting waiter filtering.
- `POST /order-print/downloadTicketData` accepts `begin_time` and `end_time`; cashier API fills `restaurant_id` from the logged-in waiter.
- Backend E-Journal returns `DownloadTicketDataResp` with `data` as hex-encoded GBK text chunks, `txt_name`, `data_cut_off_date`, `restaurant_no`, and `new_data_flag`.
- E-Journal output is capped to a 31-day range and includes generated End-of-Day report text plus payment/refund receipt text for orders in each report period.

Offline Windows cashier impact:

- Local report IPC should mirror these request/response shapes but generate from SQLite and existing local print generators.
- End-of-Shift print, End-of-Shift Digital Copy, Summary of Products print/preview, End-of-Day preview/print, and E-Journal txt download should share receipt text builders so layout changes do not drift.
- Summary of Products uses the End-of-Shift-style report header/footer path but selects `summary-of-product-header(.vm)` and `summary-of-product-footer(.vm)`. The printed product table columns are `QTY`, `ITEM`, `PRICE`, and `AMOUNT`; footer totals are `QTY OF ITEMS`, `SUB TOTAL`, `PROMO DISCOUNT`, `VOUCHERS DISCOUNT`, optional PWD/SC/LESS VAT in backend templates, and `TOTAL AMOUNT`.

## Megaworld Mall Certification

Source checked on 2026-07-09:

- `cashier-api/.../OrderCashierController.java`
- `order-inner/.../WaitOrderBusinessImpl.java`
- `order-inner/.../OrderMegaWorldSalesReq.java`
- `order-inner/.../OrderMegaWorldSalesResp.java`
- `order-inner/.../MegaWorldFileGenerateRecord.java`

Stable behavior:

- `POST /cashier/order/getOrderMegaWorldSales` accepts `download_date_time`; cashier API fills `restaurant_id` from the logged-in waiter context and delegates to `orderPaymentSpi.getOrderMegaWorldSales`.
- Backend defaults a missing `download_date_time` to today, requires approved BIR config, requires Megaworld `restaurant_pos_download_file_setting`, and requires an End-of-Day `restaurant_report_print` for the date.
- Generated S/H/D file names use mall partner ID first 4 chars, POS ID last 2 chars, generation count `1`, and month code `1-9/A-C` plus day. The backend persists generated paths in `mega_world_file_generate_record`; repeated calls for the same date increment `download_count` but return the stored paths.
- S and H data are built from the End-of-Day report snapshot plus final `order_payment` rows. Refund rows subtract order count, customer count, service fee, and hourly net amount. Discount rows include PROMO, SC, and PWD when corresponding report amounts are non-zero.

Offline Windows cashier impact:

- Local Megaworld generation should use the local End-of-Day report snapshot as the reporting source, and should recompute hourly/order/customer/service-fee figures from local final payment rows to match backend behavior.
- The user requirement document additionally requires the local Windows app to write a Z-Reading image file beside S/H/D files; the backend source currently generates only S/H/D text files.

## Order And Payment Contracts

Source checked:

- `cashier-api/.../OrderCashierController.java`
- `order-inner/order-spi/.../OrderCreateOrderReq.java`
- `order-inner/order-spi/.../OrderCreatePaymentReq.java`
- `order-inner/order-spi/.../OrderCreateOrderAndPaymentReq.java`

## Cashier Order Detail Amount Fields

Source checked on 2026-07-09:

- `cashier-api/.../OrderCashierController.java`
- `order-inner/.../OrderBusinessImpl.java`
- `order-inner/.../OrderDetailResp.java`

Stable behavior:

- `GET /cashier/order/detail` returns `OrderDetailResp.amount` as the amount the order detail page should display.
- For paid/refund-state orders, backend sets `amount` from the final `order_payment.real_amount`; a fully voucher-paid order can therefore have `amount = 0`.
- `total_amount` is the pre-payment order total from `food_order`; it must not be used as the displayed final total after voucher/PWD/SC/payment discounts.
- `sub_total_amount` is calculated from the displayed order item rows, while `coupon_amount`, `discount_amount`, `surcharge`, and `tax_info` come from the final payment/tax records when present.

Offline Windows cashier impact:

- Order detail UI should render top and bottom Total Amount from `amount`, not `total_amount`.
- Renderer fallback checks must preserve zero values; avoid truthy checks for payment amounts such as `real_amount`.
- `order-inner/order-spi/.../OrderWaiterCashReceivedReq.java`

Stable behavior:

- `POST /cashier/order/create` creates a cashier order and sets `orderApp = CASHIER` plus restaurant number from logged-in waiter/restaurant context.
- `POST /cashier/order/create/order/payment` creates order and payment together. It sets `orderReq.orderApp = CASHIER`, sets restaurant number on both order and payment requests, and sets payment waiter id from logged-in user context.
- `POST /cashier/order/payment/create` sets restaurant number and waiter id before delegating to order SPI.
- `POST /cashier/order/cashReceived` sets restaurant id and waiter id from login context before confirming offline payment.
- `POST /tax/order/amount` can bind a voucher to an existing order when called with `discount_type = VOUCHER`, `coupon_code`, and `order_inner_no`. The backend validates the coupon and writes `food_order.coupon_code` / `food_order.coupon_amount` through `UserCouponsBusiness.useCoupons()`.
- `POST /tax/order/amount` also validates and calculates PWD/SC discounts. For PWD/SC types it requires `discount_id` unless `pwd_sc_preview` is true; per-person PWD/SC types also require `discount_number` and `order_number`. Backend `real_amount` subtracts both `discount_amount` and `tax_info.less_vat`, and `tax_info.pwd_discount` is populated for PWD/SC types.
- Backend PWD/SC duplicate-use validation checks `discount_id` plus `discount_type` against same-day payments and active orders, excluding the current `order_inner_no` when present. Payment creation repeats this validation from `discount_nos[0]`, `discounter_name`, `discount_validity_period`, `order_inner_no`, and `discount_type`.
- `POST /cashier/order/payment/create` rejects payment requests with `tax_info.promo_discount` or `tax_info.pwd_discount` when top-level `discount_type` is missing, unless a nonzero `coupon_amount` identifies a voucher payment. Ordinary promo/custom discounts must send `discount_type = 2` (`CUSTOM`), while PWD/SC payments must send the backend PWD/SC type returned by the discount flow.
- Voucher write-off is not a separate cashier-front-end call. Payment success/cash-received backend flows call `UserCouponsBusiness.writeOffCoupons()`, which marks `user_coupons.status` as used, sets `usage_time`, records the used restaurant, and increments the coupon batch `used_quantity`.
- `OrderCreateOrderReq` contains `restaurantNo`, `orderApp`, `userNo`, `tableUuid`, `totalAmount`, `serviceFee`, `customerNum`, `remark`, `skuList`, `couponCode`, `couponAmount`.
- `OrderCreatePaymentReq` contains `restaurantNo`, `restaurantId`, `orderChannel`, `realServiceFee`, `realTaxAmount`, `tableUuid`, `userNo`, `totalAmount`, `orderInnerNo`, `paymentWay`, `redirectUrl`, `payProductType`, `channelCode`, `paymentPlatform`, `token`, `realAmount`, discount fields, `taxInfo`, `cashReceiptAmount`, coupon fields, `isTopUpOrder`, `waiterId`, `realCustomerNum`.
- `OrderWaiterCashReceivedReq` requires `orderInnerNo`, `mchOrderId`, and `name`; backend fills `restaurantId` and `waiterId`.

Offline Windows cashier impact:

- For offline-created orders that later sync, preserve enough fields to build `OrderCreateOrderReq`, `OrderCreatePaymentReq`, or the combined request.
- Do not trust local restaurant id/user id if backend will derive them from auth context; keep local values for offline operation but reconcile with backend rules during sync.
- Amounts are integer minor units in these DTOs.

## Tax Order Amount Calculation

Source checked on 2026-06-24:

- `cashier-api/.../TaxCashierController.java`
- `order-inner/order-provider/.../TaxBusinessImpl.java`
- `order-inner/order-spi/.../OrderTaxAmountReq.java`
- `order-inner/order-spi/.../OrderTaxAmountResp.java`
- `order-inner/order-spi/.../OrderTaxInfoGetResp.java`

Stable behavior:

- `POST /tax/order/amount` receives `product_amount` as the order product tax-included amount. It does not use the final payable amount as the normal VAT base.
- `OrderTaxInfoGetResp.vatable_sales` is the pre-tax amount for taxable products and explicitly excludes service fee. `tax_amount` is derived from the taxable product/package/delivery amount, not from `real_amount`.
- Normal/custom whole-order discounts calculate `discount_amount`, but tax remains based on the original product amount.
- Voucher discounts delegate to `UserCouponsBusiness.queryDiscountAmount()`. If the backend classifies the coupon as a voucher/product redemption and the discounted product amount is nonzero, `calculation_tax_amount` becomes `product_amount - discount_amount`, so VAT is based on the discounted product price. Zero-price redemption keeps the original product amount as the VAT base.
- PWD/SC whole-order and per-person discounts replace the normal VAT breakdown with VAT-exempt sales/exemption and `less_vat`; `real_amount` subtracts both `discount_amount` and `less_vat`.
- Service fee is calculated separately and added to `real_amount`. For table/customer orders, custom service fee must be supplied when the restaurant setting is custom.

Offline Windows cashier impact:

- BillOut VAT should not be recalculated from final payable total after service fee and whole-order discounts.
- Local ordinary discount tax fallback should use product subtotal as the VAT base.
- Voucher and PWD/SC flows should preserve backend-returned `tax_info` because those flows can change the VAT base or VAT-exempt breakdown according to backend-only coupon/PWD rules.

## Order Status And Constants

Source checked:

- `order-inner/order-spi/src/main/java/com/paycools/phpay/food/order/constant/OrderStatusEnum.java`
- `order-inner/order-spi/src/main/java/com/paycools/phpay/food/order/constant/*.java`

Known order statuses:

- `PROCESSING = 1`: Pending.
- `RECEIVED = 2`: Taken.
- `COMPLETED = 3`: Completed.
- `CANCEL = 4`: Cancelled.
- `AWAITING_PICKUP = 5`: Ready for Take-out.

## Cashier Order Complete And Table Clear

Source checked on 2026-06-08:

- `cashier-api/.../OrderCashierController.java`
- `order-inner/order-spi/.../OrderWaiterCompleteReq.java`
- `order-inner/order-spi/.../TableOrderClearReq.java`
- `order-inner/order-provider/.../OrderBusinessImpl.java`
- `order-inner/order-provider/.../CashierOrderBusinessImpl.java`

Stable behavior:

- `POST /cashier/order/complete` accepts `order_inner_no` only. Backend finds non-cancel orders for the current restaurant/default online device and returns false if none exist.
- Complete requires every non-cancel order in the group to be `RECEIVED`; otherwise it throws `Orders that are not in the status of [RECEIVED] orders cannot be [COMPLETE]`.
- Complete rejects refunding/refund-pending orders and requires payment status `SUCCESS` or `REFUND_FAIL`.
- Complete updates matching non-cancel `food_order` rows to `COMPLETED`, sets `complete_time` and `update_time`, and emits one `OrderStatusChangeEnum.COMPLETED` status change for the master order.
- `POST /cashier/order/table/clear` accepts `table_uuid` only. Backend resolves the table for the current restaurant and valid table status.
- Table clear first checks recent 3-day table orders that are pending or unpaid and not completed/cancelled; if such orders belong to an order group with a master order, it throws `You have orders that have not been completed ,please complete these orders first.`
- Table clear then completes recent 3-day orders on the table that are not completed/cancelled, not refunding/refund-pending, and are either `RECEIVED` or paid. It updates `food_order.order_status`, `complete_time`, `update_time`, and emits completed status changes for master orders.

## Cashier Reduce Order

Source checked on 2026-06-23:

- `POST /cashier/order/reduceOrder` accepts `OrderWaiterReduceReq`: `order_inner_no`, optional `order_no_list`, optional `remark`, and `order_detail_list`.
- Each reduce item contains `order_detail_id` plus the new remaining `count`; it is not a delta amount.
- Backend allows editing only normal/increase order details and only unpaid orders whose food-order status is `PROCESSING` or `RECEIVED`.
- Paid, refunding, refund-pending, refund-failed, and refund-cancel orders reject reduce with `The order had been paid!`.
- When a detail count becomes `0`, backend removes the original increase detail and snap, then creates or accumulates a cancel detail (`detail_type = CANCEL`) with a snap copied from the original.
- When a detail remains above `0`, backend updates the original detail count, option amount, and snap count, and also creates/accumulates the cancel detail for the reduced quantity.
- After details change, backend recalculates each `food_order` total count, product amount, tax, ratio service fee, and total amount. A food order with no remaining increase details becomes `CANCEL`.
- If the original master order is cancelled but other active sibling orders remain, backend re-elects the earliest non-cancelled `PROCESSING` or `RECEIVED` order as master.
- If the master order is cancelled and no active same-table order remains, backend emits a delivery-failed/cancel status change and clears customer table cache.
- Online frontend calls `POST /cashier/order/query` after reduce; the returned `order_list` includes updated increase details and cancel details for display.

## Queue Order Take Food Number

Source checked on 2026-06-12:

- `order-inner/order-provider/.../OrderBusinessImpl.java`
- `order-inner/order-provider/.../OpenOrderBusinessImpl.java`

Stable behavior:

- Cashier queue orders (`OrderChannelEnum.QUEUE_TO_ORDER`) do not receive `food_order.take_food_no` at initial order creation.
- `take_food_no` is assigned when payment succeeds. For offline/cash payment this happens in `cashReceived()`, which delegates queue orders to `payCallWait()`.
- The number uses Redis key `RESTAURANT_USER_MEAL_CODE_NO_DATE` by `restaurant_no` and business date.
- Business date rule: if current hour is before 02:00, use the previous calendar day; otherwise use the current day.
- The value increments with a 24-hour expiry, is formatted as three digits (`001`, `002`, ...), and when the increment reaches `1000` the Redis key is deleted and the sequence restarts from `001`.
- Online cashier queue order/payment creation uses `POST /wait/order/create`, whose request body is `CreateWaitFoodOrderReq` with top-level `restaurant_no`, `user_no`, plus `order_req` and `payment_req`. The table before-meal combined endpoint `POST /cashier/order/create/order/payment` resolves `table_uuid` and is not suitable for queue orders.

## Order Print Preview

Source checked on 2026-06-11:

- `cashier-api/.../controller/printer/OrderPrintController.java`
- `order-inner/order-spi/.../PrintPreviewReq.java`
- `order-inner/order-provider/.../PrintBusinessImpl.java`

Stable behavior:

- `POST /order-print/preview` accepts `PrintPreviewReq`, including `order_inner_no`, `preview_type`, and required `is_download`.
- For `preview_type = PAYMENT` or `REFUND`, the cashier API checks the order exists and rejects unpaid non-cancel orders.
- Backend adjusts `order_inner_no` before printing: after-meal orders use `food_order.order_inner_no`; before-meal orders use `food_order.order_no`.
- Payment/refund preview reads `food_order_print_info.content_json` where `print_type` is `PAYMENT` or `ALL`, rebuilds the print business object, generates receipt content, and when `is_download = false` converts the receipt text into an image base64 string.
- `ReportTypeEnum` values used by the online receipt preview modal are: `REFUND = 4`, `PAYMENT = 5`.
- `PrintOrderBo.Item.price` is not an integer minor-unit field. Backend order assembly writes it with `AmountFormatUtil.amountIntToSting(...)`, so it is a formatted major-unit string such as `1245.00`; receipt templates print this string directly. Other `PrintOrderBo` totals and tax fields remain integer minor units.

Important constant families:

- `OrderStatusEnum`, `PaymentStatusEnum`, `PaymentWayEnum`, `OrderChannelEnum`, `OrderTypeEnum`, `OrderAppEnum`.
- `DiscountTypeEnum`, `DiscountAllTypeEnum`, `CustomServiceFeeType`, `TaxRateConstant`.
- `PrinterTypeEnum`, `PrintType`, `PrintStatusEnum`, `TakeOutPrintType`.
- `DeliveryStatusEnum`, `TakeOutOrderEnum`, `OrderProductStatusEnum`.

## Open API Notes

Source checked:

- `open-api/src/main/java/com/paycools/phpay/food/openapi/controller/OrderApiController.java`

Important endpoints:

- `POST /order/jt/create`
- `POST /order/create`
- `POST /order/jt/refund`
- `POST /order/refund`
- `POST /order/print`
- `POST /order/tax/calculate`
- `POST /order/query`
- `POST /order/jt/query`

Use `open-api` as reference when this repository needs third-party/open-order integration behavior rather than cashier UI behavior.

## Future Summary Targets

Good next domains to summarize:

- Exact backend validation for `OrderSkuReq`, discount DTOs, tax DTOs, refund DTOs, and print DTOs.
- Sync/idempotency behavior for offline orders if such endpoints exist.
- Payment status transitions and payment final status rules.
- Report/end-of-day contracts used by the cashier.

## Source Reading Notes

When source-level reference is needed, read only the relevant files from `phpay-food`. Do not modify that source.

## Tax Order Amount Custom Service Fee

Source checked on 2026-06-24:

- `order-inner/order-spi/.../OrderTaxAmountReq.java`
- `order-inner/order-provider/.../TaxBusinessImpl.java`

Stable behavior:

- `POST /tax/order/amount` accepts `custom_service_fee` and `custom_service_fee_type`; the DTO fields are `customServiceFee` and `customServiceFeeType`.
- When service fee is enabled, order channel is table/customer, and restaurant service fee type is CUSTOM, `TaxBusinessImpl.calculationServiceFeeAmount()` requires `custom_service_fee` to be non-empty.
- A missing or null `custom_service_fee` throws `The custom service fee cannot be empty`; zero must therefore be sent explicitly when the custom service fee amount is 0.
- For percentage custom service fees, `custom_service_fee_type = RATIO` makes the backend treat `custom_service_fee` as a basis-point style value and calculate against the product/tax base.

Offline Windows cashier impact:

- Any `/tax/order/amount` call used from BillOut for PWD/SC, voucher, or discount recalculation must include `custom_service_fee: 0` when the current restaurant uses CUSTOM service fee and no fee has been entered.
- The field is `custom_service_fee`, not `service_fee`, for this endpoint.

## Label Print Push

Source checked on 2026-06-17:

- `D:/Paycools/phpay-food/order-inner/order-provider/.../FcmPrintBusinessImpl.java`
- `D:/Paycools/phpay-food/order-inner/order-provider/.../PrintHandlerImpl.java`
- `D:/Paycools/phpay-food/order-inner/order-provider/.../PrintBusinessImpl.java`
- `D:/Paycools/phpay-food/order-inner/order-provider/.../OrderPrintController.java`
- `D:/Paycools/phpay-food/order-inner/order-spi/.../LabelPrintBo.java`

Stable behavior:

- Current backend checkout branch was confirmed from `.git/HEAD` as `dev_1.3.0_not_network`; `git branch` itself was blocked by Git safe-directory ownership protection.
- `FcmPrintBusinessImpl.pushLabelPrintInfo` is the automatic label print push node. It chooses USB label settings with `mac_id` first; if none exist it falls back to legacy settings without `mac_id`.
- Label push payload includes `data_type = 2`, `print_type = 6`, `message_no = PM...`, optional `mac_id`, `print_size_type`, `print_language`, and `print_info = JSON.stringify(LabelPrintBo)`.
- `PrintBusinessImpl.printLabel` builds `LabelPrintBo` from `FoodOrder`, `PrintOrderBo`, `RestaurantLabelPrinterSetting`, and `restaurant_printer_category` rows where `print_type = LABEL`. Empty category config means all products print.
- `LabelPrintBo.productBoList` groups product rows and following option rows from `PrintOrderBo.itemList`; product rows are identified by non-empty `number` and `price`.
- Manual `GET /order-print/label` calls `fcmPrintBusiness.pushLabelPrintInfo` and also returns a combined `LabelPrintBo`.

## Label Printer Settings

Source checked on 2026-07-06:

- `POST /order-print/label/save` accepts `LabelPrintSaveReq`; cashier API fills `restaurant_id` from the logged-in waiter context before delegating to `RestaurantPrinterBusinessImpl.updateLabel`.
- Request fields include required `category_ids`/`categoryIds`, `print_size_type`, `print_language`, `mac_id`, `nick_name`, `remark`, and `old_printer_type_id`.
- Saving a USB label printer removes an existing receipt/kitchen USB setting for the same restaurant and `mac_id` when the old printer type was receipt or kitchen.
- The backend upserts `restaurant_label_printer_setting` by restaurant plus `mac_id` when `mac_id` is present; legacy non-USB label settings use `mac_id IS NULL`.
- The backend removes existing `restaurant_printer_category` rows for the same restaurant plus `mac_id`/`mac_id IS NULL`, then recreates rows from `category_ids` with `print_type = LABEL`. An empty category list means labels print all categories.
- USB printer list response includes label printers from `restaurant_label_printer_setting` and populates each label printer's `category_resp_list` from `restaurant_printer_category` plus `dish_category`.

## Kitchen Receipt Print Layout

Source checked on 2026-06-25:

- Backend kitchen receipt generation uses `PrintBusinessImpl.printKitchen`, `PrintHandlerImpl.printKitchen`, `PrintHandlerChineseImpl.printKitchen`, `KitchenItem.toString2`, and `template/print/kitchen-*.vm`.
- Manual kitchen printing reads `food_order_print_info.content_json`, sets `PrintType.KITCHEN`, and applies the target kitchen printer's `language` and `printer_font_size`.
- `language = 1` means Chinese and `language = 2` means English. `printer_font_size = 1` means Regular and `2` means Large.
- 58mm kitchen layout uses 32 columns. The header prints optional reprint content/time, restaurant name, `ORDER ID`, and `PRINT TIME`/`打印时间` using `yyyy/MM/dd HH:mm:ss`.
- The body prints table number plus `items:n`, or pickup/dining style plus `items:n`, or `Delivery items:n`. Product names remove the trailing `@price` fragment before printing. Each product group starts with a separator line, prints item name left and `xqty` right, and the final group ends with a separator line.
- Large kitchen font wraps the kitchen body with ESC/POS bold on plus `1D2101`; the header remains default size.
## 2026-06-26: Manual Order SI/OR Validation

- `POST /cashier/order/auth/serial/number` delegates to `OrderBusinessImpl.authSerialNumber`.
- It returns `false` when receipt number length exceeds 20, when it is exactly 20 numeric characters, or when the same receipt number already exists for any restaurant in the same country; otherwise it returns `true`.
- The online Manual Order modal calls this endpoint only when confirming a tax-enabled manual order. Actual order/payment creation happens later through `/cashier/order/create/manual/order` after the cashier presses Charge.

## 2026-06-26: Manual Order Creation

- `POST /cashier/order/create/manual/order` sets `restaurantId`, `waiterId`, and `orderApp = MANUAL_ORDER` in `OrderCashierController`, then delegates to `OrderBusinessImpl.createManualOrder`.
- Backend amount validation requires `totalAmount == realAmount - surcharge + taxInfo.pwdDiscount + taxInfo.lessVat + taxInfo.promoDiscount`; supplied SI/OR is revalidated with `authSerialNumber`.
- If `orderInnerNo` is missing, backend creates a new before-meal master `food_order`, saves details/print snapshot, and records PLACE_ORDER. If `orderInnerNo` exists, it reuses that order group.
- Backend rejects already-paid manual target orders. On success it creates a successful `order_payment`, writes `order_payment_tax`, marks matching `food_order` rows as `orderApp = MANUAL_ORDER`, paid, and completed, writes waiter-clock order ownership, and emits PAID plus COMPLETED status changes.
- After commit, new manual orders trigger order, kitchen, and label print nodes. Payment receipt printing is not part of this manual-order creation flow.

## 2026-06-30: Cashier Refund Persistence

- `POST /cashier/order/refund` fills `restaurantId` and `waiterId` from the cashier login context, then delegates to `OrderBusinessImpl.refund`.
- Backend refund is append-only for `order_payment`: it queries the final successful payment (`transaction_status = SUCCESS`, `final_payment_status = YES`), clones it with a new id and new `mch_order_id`, then saves a new refund payment row. The original success payment row is not changed to refunded.
- Offline/cash refund sets the new payment row to `transaction_status = REFUNDED`, keeps `final_payment_status = YES`, clears `system_transaction_no`, sets `transaction_return_time`, `refund_remark`, and a restaurant refund serial number.
- Backend clones `order_payment_tax` to a new row whose `order_payment_id` points to the refund payment row.
- On refund success, backend updates matching `food_order` rows to `payment_status = REFUNDED`, sets `refund_time`, `refund_payment_id` to the new refund payment id, and `refund_waiter_no`. If an order is not already completed, it also sets `order_status = COMPLETED` and `complete_time = refund_time`.
- Backend records waiter-clock ownership for `REFUND_ORDER` and emits status changes for `INITIATE_A_REFUND` and `REFUND_SUCCESSFUL`.
- Backend refund receipts and reports query refund payments with `transaction_status = REFUNDED` and `final_payment_status = YES`; report mappers join `food_order.refund_payment_id` to the refund `order_payment`.

## 2026-06-30: Mall Certification Parqal And Megaworld Files

- `POST /cashier/order/downloadOrderOrderParqalSales` and `/getOrderMegaWorldSales` delegate to `WaitOrderBusinessImpl` in `order-inner`.
- Offline Windows cashier runs these flows against the currently bound POS `device_no`; the local implementation must not substitute a default POS terminal id when looking up BIR configuration or End-of-Day snapshots.
- Parqal output root is `<root>`, with `<id>` fields `tenantid`, `key`, `tmid`, `doc=SALES_EOD`, a full `<sales>` section, repeated `<trx>` rows, repeated `<line>` rows, and `<master>/<product>` rows. The filename is `sales_{externalId}_{posId}_{last5ReceiptId}.xml`.
- Parqal uses `order_summary` from BIR audit date through the prior day for previous NRGT/tax/taxable/non-taxable accumulators, then uses success/refund `order_payment` rows from the End-of-Day `orderNos/refundOrderNos` to build transaction totals.
- Megaworld creates three TXT files named `S/H/D + first4ExternalId + last2PosId + 1 + "." + monthCode + dd + ".txt"`, where month code is `1..9,A,B,C`.
- Megaworld day/hour files use numeric line prefixes (`01` etc.) and raw cents strings for amount lines (`000` for zero/null). Discount files use rows such as `PROMO, PROMO DISCOUNT, 1.23`.

## 2026-07-02: End-Of-Day Automatic Report Flow

- Backend automatic End-of-Day generation is implemented by `SwiMoveDayReportJob`, which selects valid subscribed restaurants, skips restaurants that already have an EOD `restaurant_report_print` for the target day, and calls report preview generation with `previewType = END_OF_DAY`, `current = true`, `isDownload = true`, and `autoGenerated = true`.
- Cashier API exposes `POST /restaurant/report/auto/report/list`; it returns automatic EOD rows where `print_type = END_OF_DAY`, `build_type = AUTOMATIC`, and `push_status = NOT_PUSHED`, mapped as dates plus report type.
- After `/auto/report/list` returns the rows, backend updates those rows to `push_status = PUSHED`, so the cashier popup is shown once.
- Cashier offline sync exposes `POST /cashier/offline/sync/report/query` for server-to-device report print rows and `POST /cashier/offline/sync/report/batch` for device-to-server report print rows. The batch item fields consumed by backend are waiter no, print start/end time, print type, receipt id, print count, create/update time, report JSON, build type, and push status; restaurant id and device no come from the top-level request/context.

## 2026-07-02: BIR XLSX Report Download

- Online cashier calls `POST /cashier/order/javaDownloadBirReport` with `begin_time` and `end_time`; cashier API fills `restaurant_id`, `user_id`, and waiter platform, then delegates to `restaurantReportSpi.downloadBirReport`.
- Backend rejects download when the restaurant has no approved BIR `restaurant_operation_config`. If the requested end time is before BIR audit time it rejects; if begin time is before audit time it clamps begin time to audit time.
- Header fields come from approved BIR config: taxpayer name, restaurant address, TIN, MIN, serial number, VAT/non-VAT register label, display device `001`, download time, and cashier name.
- XLSX output uses `xlsxTemplate/BIRReports.xlsx` for VAT-registered stores and `xlsxTemplate/BIRNotVatReports.xlsx` otherwise. It fills sheets `E-1` through `E-5`, populating sales summary in `E-1`, SC detail in `E-2`, PWD detail in `E-3`, and header-only `E-4`/`E-5`, then protects each sheet with password `{restaurant_no}A3B8D2F1`.
- `E-1` is driven by generated End-of-Day/Z-Reading `restaurant_report_print` records in the selected period. Each row parses `report_json`; missing report JSON raises the end-of-day-not-generated error.
- BIR sales summary combines End-of-Day accumulated sales fields, completed success/refund-state orders, refunded orders, final success payments, payment tax rows, manual-order receipt numbers, and refund VAT adjustment rows.
- PWD/SC detail sheets query completed paid/refund-state orders in range, then final payments whose discount types match PWD (`PWD_SC_ALL`, `PWD_SC_PEOPLE`) or SC (`SC_ALL`, `SC_PEOPLE`). Rows include transaction return time, discounter name/id, TIN, receipt number, sales net of service fee, VAT/tax fields, discount, and real amount.

## 2026-07-08: Cashier Order Detail Discount Fields

- `GET /cashier/order/detail` in `OrderCashierController` fills the cashier restaurant id and delegates to `orderSpi.detailOrder(orderInnerNo, restaurantId)`.
- `OrderBusinessImpl.detailOrder` sets top-level `coupon_code` and `coupon_amount` from `food_order`, then for paid/refund-state orders enriches detail data from the final `order_payment`.
- The final payment supplies top-level `amount` (real payment amount), `discount_amount`, `surcharge`, `discount_type`, `discount_nos`, `discounter_name`, `discount_validity_period`, `discounter_serial_no`, and `channel_reference_no`.
- The backend loads `order_payment_tax` into top-level `tax_info`, including `less_vat`, `pwd_discount`, and `promo_discount`.
- If a `coupon_code` exists, backend also resolves coupon display fields `coupon_name` and `coupon_batch_no`.

Offline Windows cashier impact:

- Local `getOrderDetailByInnerNo` should shape its response like this backend DTO, even though coupon metadata may be unavailable locally unless sync provides it.

## 2026-07-31: End-of-Day Accumulated Sales Definitions

- `GET /restaurant/report/end-day/query` delegates to `RestaurantReportBusinessImpl.queryCycleReport`.
- `salesOfTheDay` is finalized as `grossAmount`; `pastAccumulatedSales` is then calculated as `presentAccumulatedSales - salesOfTheDay`.
- `presentAccumulatedSales` combines historical `order_summary` rows for the online default device and `ALL` channel with the report end day's qualifying orders for the requested POS.
- Each historical summary contributes `totalAmount + lessVat + pwdDiscount + promoDiscount - serviceFee`; each directly queried order contributes `totalAmount - serviceFee`.
- With an approved BIR operation config, summary accumulation starts at the beginning of the day after `auditTime`, while orders from `auditTime` through the end of the audit day are added directly. Without an approved config, all summaries through the day before the report end date are included.
- Completed/refund-in-progress/refund-pending/refund-failed/refund-cancelled orders qualify for accumulated sales; fully refunded orders are handled separately in the report's refund and gross-sales calculations.
- Backend `handlePresentSales` excludes fully refunded orders while `grossAmount` adds their original sales back through `refund`; this can make `pastAccumulatedSales = presentAccumulatedSales - salesOfTheDay` negative when the period contains a refund and has no sufficient prior balance.

Offline Windows cashier impact (superseded by the 2026-10-27 restaurant-scope decision):

- The backend POS conditions are reference behavior only. The standalone offline cashier has no account/device binding, so historical summaries, current-day orders, BIR config and generated reports are scoped by restaurant and do not filter on `device_no`.
- The local application does not run the backend job that maintains `order_summary`, so accumulated Gross Sales must be calculated from the restaurant's completed `food_order` rows. Fully refunded orders retain their original sale in accumulated Gross Sales, while the refund remains separately reported under `Less Refund`.

## 2026-08-05: Backend End-of-Day Service Fee Fields

- `RestaurantReportBusinessImpl.handleEndOfDayReportSuccessOrder` subtracts `food_order.service_fee` from `salesOfTheDay`, then assigns the summed fee to both `serviceFee` and `totalServiceFee`; `serviceFeeTax` keeps its response default of zero.
- VAT fields are populated separately from `order_payment_tax`. The NON-VAT subtotal path explicitly subtracts service fee, packaging fee, and delivery fee before calculating percentage tax.
- The offline Windows cashier follows this structure: Service Charge Amount and Total Service Charge retain the actual fee, Service Charge Tax is zero, and Gross/NET/accumulated sales exclude the separately reported fee.
- The offline EOD intentionally differs from backend `cancelled`/`lessCancelled` aggregation: both fields are fixed at zero and cancelled orders are omitted from the report amount calculation.
