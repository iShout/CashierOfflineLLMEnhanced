export const IPC_CHANNELS = {
  AGENT: {
    ASK: "agent:ask",
  },
  APP: {
    GET_VERSION: "app:get-version",
    GET_ENV: "app:get-env",
    GET_DEVICE_IDENTITY: "app:get-device-identity",
    GET_LOCAL_HARDWARES: "app:get-local-hardwares",
    LOG_MESSAGE: "app:log-message",
  },
  LOGS: {
    GET_ENTRIES: "logs:get-entries",
    CLEAR: "logs:clear",
  },

  AUTH: {
    SET_SESSION: "auth:set-session",
    CLEAR_SESSION: "auth:clear-session",
  },
  LOGIN: {
    VALIDATE: "login:validate",

    GET_LOCAL_WAITER_BY_ACCOUNT: "login:get-local-waiter-by-account",
    GET_SAVED_CREDENTIAL: "login:get-saved-credential",
    SAVE_CREDENTIAL: "login:save-credential",
    CLEAR_SAVED_CREDENTIAL: "login:clear-saved-credential",
  },

  ORDERS: {
    GET_DISH_PRODUCT_LIST: "orders:get-dish-product-list",
    GET_TABLE_AREA_LIST: "orders:get-table-area-list",
    GET_PRODUCT_DETAIL_BY_PRODUCT_NO: "orders:get-product-detail-by-product-no",
    CREATE_ORDER: "orders:create-order",
    AUTH_MANUAL_ORDER_SERIAL_NUMBER: "orders:auth-manual-order-serial-number",
    CHECK_PWD_SC_DISCOUNT_ID_AVAILABLE: "orders:check-pwd-sc-discount-id-available",
    CREATE_MANUAL_ORDER: "orders:create-manual-order",
    GET_ORDER_LIST_BY_ORDER_INNER_NO: "orders:get-order-list-by-order-inner-no",

    CREATE_PAYMENT_ORDER: "orders:create-payment-order",
    CASH_RECEIVED: "orders:cash-received",

    ORDER_TAKE: "orders:order-take",
    ORDER_SERVE: "orders:order-serve",
    ORDER_COMPLETE: "orders:order-complete",
    REDUCE_ORDER: "orders:reduce-order",
    TABLE_CLEAR: "orders:table-clear",
    CHANGE_TABLE: "orders:change-table",
    GET_ORDER_LIST: "orders:get-order-list",
    // 查询当前餐厅所有未完成订单，用于 pending orders 弹窗
    GET_UNCOMPLETE_ORDERS: "orders:get-uncomplete-orders",
    GET_UNCOMPLETE_ORDERS_BY_TABLE: "orders:get-uncomplete-orders-by-table",
    GET_UNCOMPLETE_ORDER_COUNT: "orders:get-uncomplete-order-count",
    UNCOMPLETE_ORDER_COUNT_CHANGED: "orders:uncomplete-order-count-changed",
    SCHEDULED_TASK_EXECUTED: "orders:scheduled-task-executed",
    GET_PENDING_ORDER_BY_TABLE: "orders:get-pending-order-by-table",
    GET_ORDER_DETAIL_BY_INNER_NO: "order:get-order-detail-by-inner-no",
    // 订单详情右侧 View Digital Copy，返回可直接展示的 base64 图片。
    VIEW_DIGITAL_COPY: "orders:view-digital-copy",
    // 订单打印：生成可直接发送 USB 的小票 base64，并更新本地打印快照。

    // 餐前 BillOut 尚未建单时，直接打印页面组装的当前 Bill 快照。

    GET_ORDER_HISTORY: "order:get-order-history",
    ORDER_REFUND: "order:order-refund",
    ORDER_CANCEL: "order-order-cancel",
    GET_CANCELLABLE_ORDERS_BY_TABLE: "order:get-cancellable-orders",
    GET_CANCELLABLE_ORDER_DETAIL: "order:get-cancellable-order-detail",
  },
  SETTINGS: {
    GET_RESTAURANT_SETTINGS_BY_ID: "settings:get-restaurant-settings-by-id",
    GET_BIR_INFO: "settings:get-bir-info",

    // 商场认证：获取当前餐厅本地认证设置。
    GET_MALL_CERTIFICATION_SETTINGS: "settings:get-mall-certification-settings",
    // 商场认证：保存当前餐厅本地认证设置。
    SAVE_MALL_CERTIFICATION_SETTINGS: "settings:save-mall-certification-settings",
    // 商场认证：选择认证文件保存目录。
    SELECT_MALL_CERTIFICATION_FOLDER: "settings:select-mall-certification-folder",
    // 商场认证：按日期范围补生成认证文件。
    REGENERATE_MALL_CERTIFICATION_FILES: "settings:regenerate-mall-certification-files",
    // 商场认证：初始化 SM 最近 30 天 CSV。
    INITIALIZE_MALL_CERTIFICATION_FILES: "settings:initialize-mall-certification-files",
  },

  ASSETS: {
    SAVE_IMAGE_FROM_DATA_URL: "assets:save-image-from-data-url",
    GET_LOCAL_ASSET_BY_ID: "assets:get-local-asset-by-id",
    GET_LOCAL_ASSET_BY_SOURCE_URL: "assets:get-local-asset-by-source-url",
    GET_LOCAL_ASSET_FILE_URL: "assets:get-local-asset-file-url",
  },
  FILE: {
    SELECT_FOLDER: "file:select-folder",
  },
  STAFF: {
    GET_STAFF_CLOCK_RECORD: "staff:get-staff-clock-record", // 获取该员工最近的一条打卡数据（正在上班或下班后最近的一条）
    CLOCK: "staff:clock",
    CLOCK_IN: "staff:clock-in",
    TAKE_BREAK: "staff:take-break",
    CLOCK_OUT: "staff:clock-out",
    CLOCK_REPORT_DATA: "staff:clock-report-data",
    UPDATE_OPENING_FUND: "staff:update-opening-fund",
    ADD_LESS_WITHDRAWAL: "staff:add-less-withdrawal",
    UPDATE_CASH_ON_HAND: "staff:update-cash-on-hand",
    GET_STAFF_LIST: "staff:get-staff-list",
    GET_STAFF_CLOCK_STATE: "staff:get-staff-clock-state",
    GET_CLOCK_RECORD_BY_WAITER_NO: "staff:get-clock-record-by-waiter-no",
    GET_STAFF_ALL_CLOCK_LIST: "staff:get-staff-all-clock", // 获取该员工下全部的打卡数据（包括正在上班和历史已下班的数据）
    GET_CASHIER_REPORT_BY_WAITER: "staff:get-cashier-report-by-waiter", // 根据员工获取收银员报告
  },
  REPORT: {
    GET_PRODUCT_SUMMARY_REPORT: "report:get-product-summary-report",
    AUTO_GENERATE_EOD_REPORTS: "report:auto-generate-eod-reports", // 自动补生成缺失的日终报告
    // 上传本地未同步的日终报告快照
    GET_EOS_REPORT: "report:get-eos-report", // 获取日终报告数据
    CHECK_EOS_REPORT_GENERATED: "report:check-eos-report-generated", // 检查当前周期是否已生成日终报告
    // 补打已生成的日终报告
    PREVIEW_EOS_REPORT: "report:preview-eos-report", // 日终报告 Digital Copy 图片预览
    // 打印提现报告
    // 打印 End-of-Shift / Summary of Products 报告
    PREVIEW_CASHIER_REPORT: "report:preview-cashier-report", // End-of-Shift / Summary of Products Digital Copy
    DOWNLOAD_TICKET_DATA: "report:download-ticket-data", // E-Journal 文本数据下载
    DOWNLOAD_BIR_REPORT: "report:download-bir-report", // BIR xlsx 报表下载
  },
  DISH: {
    GET_CATEGORY_LIST: "dish:get-category-list",
  },
};
