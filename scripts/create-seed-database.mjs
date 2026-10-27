import bcrypt from "bcrypt";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.resolve(projectRoot, process.argv[2] || "resources/database.db");
const targetPath = path.resolve(projectRoot, "resources/database.seed.db");
const temporaryPath = `${targetPath}.tmp`;

const SOURCE_ACCOUNT = "cq@swifood.com";
const DEMO_ACCOUNT = "admin";
const DEMO_PASSWORD = "123456";
const DEMO_PASSWORD_HASH = "$2b$10$u1wFe1DdB.imUOuxAMitMei636DAS0g54zD4c9GoXPoZ9tuHm9k7a";
const SEEDED_AT = "2026-01-01 00:00:00";

const quoteIdentifier = (identifier) => `"${String(identifier).replaceAll('"', '""')}"`;

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Source database does not exist: ${sourcePath}`);
}

if (sourcePath === targetPath) {
  throw new Error("Source database and seed database must be different files.");
}

fs.rmSync(temporaryPath, { force: true });

const source = new Database(sourcePath, { readonly: true });
const sourceIntegrity = source.pragma("integrity_check", { simple: true });
if (sourceIntegrity !== "ok") {
  source.close();
  throw new Error(`Source database integrity check failed: ${sourceIntegrity}`);
}

const targetWaiter = source
  .prepare(
    `
      SELECT id, restaurant_id
      FROM restaurant_waiter
      WHERE lower(account) = lower(?)
      LIMIT 1
    `,
  )
  .get(SOURCE_ACCOUNT);

if (!targetWaiter) {
  source.close();
  throw new Error(`Seed source account was not found: ${SOURCE_ACCOUNT}`);
}

const schemaRows = source
  .prepare(
    `
      SELECT type, name, sql
      FROM sqlite_master
      WHERE sql IS NOT NULL
        AND name NOT LIKE 'sqlite_%'
        AND type IN ('table', 'index', 'trigger', 'view')
      ORDER BY CASE type
        WHEN 'table' THEN 1
        WHEN 'view' THEN 2
        WHEN 'index' THEN 3
        WHEN 'trigger' THEN 4
      END,
      name
    `,
  )
  .all();
const userVersion = source.pragma("user_version", { simple: true });
source.close();

const seed = new Database(temporaryPath);
seed.pragma("journal_mode = DELETE");
seed.pragma("foreign_keys = OFF");
seed.pragma("secure_delete = ON");

// 先复制完整表结构，确保 seed 与当前迁移后的运行库保持一致。
for (const schema of schemaRows.filter(({ type }) => type === "table")) {
  seed.exec(schema.sql);
}

seed.prepare("ATTACH DATABASE ? AS source").run(sourcePath);

const copyRows = (tableName, whereClause = "", parameters = {}) => {
  const table = quoteIdentifier(tableName);
  const where = whereClause ? ` WHERE ${whereClause}` : "";
  seed.prepare(`INSERT INTO main.${table} SELECT * FROM source.${table}${where}`).run(parameters);
};

const restaurantParameters = { restaurantId: targetWaiter.restaurant_id };

seed.transaction(() => {
  // 全局字典只保留离线运行必需且不含业务流水的数据。
  copyRows("country");
  copyRows("restaurant", "id = @restaurantId", restaurantParameters);
  copyRows("dish_category", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows("dish_product", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows("dish_product_sku", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows(
    "dish_product_spec",
    `product_id IN (
      SELECT id FROM source.dish_product WHERE restaurant_id = @restaurantId
    )`,
    restaurantParameters,
  );
  copyRows(
    "dish_product_spec_item",
    `spec_id IN (
      SELECT spec.id
      FROM source.dish_product_spec AS spec
      INNER JOIN source.dish_product AS product ON product.id = spec.product_id
      WHERE product.restaurant_id = @restaurantId
    )`,
    restaurantParameters,
  );
  copyRows(
    "product_option_item",
    `product_id IN (
      SELECT id FROM source.dish_product WHERE restaurant_id = @restaurantId
    )`,
    restaurantParameters,
  );
  copyRows("restaurant_area", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows("restaurant_table", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows("restaurant_channel_setting", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows("restaurant_setting", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows("restaurant_wait_setting", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows("restaurant_option", "restaurant_id = @restaurantId", restaurantParameters);
  copyRows(
    "restaurant_option_item",
    `option_id IN (
      SELECT id FROM source.restaurant_option WHERE restaurant_id = @restaurantId
    )`,
    restaurantParameters,
  );
  copyRows("payment_channel", "restaurant_id = @restaurantId", restaurantParameters);

  // BIR 配置保留功能开关，但用公开演示值替换真实税务和地址信息。
  seed
    .prepare(
      `
        INSERT INTO restaurant_operation_config (
          id,
          restaurant_id,
          tin_number,
          restaurant_address,
          create_time,
          update_time,
          vat_register_status,
          ptu_number,
          ptu_issue_date,
          min_number,
          taxpayer_name,
          operator_id,
          submit_time,
          audit_time,
          audit_status,
          auth_type,
          serial_number,
          trade_name,
          device_no
        )
        SELECT
          id,
          restaurant_id,
          '000-000-000-000',
          'Demo Restaurant Address',
          @seededAt,
          @seededAt,
          vat_register_status,
          'DEMO-PTU',
          '2026-01-01',
          'DEMO-MIN',
          'Swifood Demo Taxpayer',
          0,
          NULL,
          NULL,
          audit_status,
          auth_type,
          'DEMO-SERIAL',
          'Swifood BIR Demo',
          NULL
        FROM source.restaurant_operation_config
        WHERE restaurant_id = @restaurantId
      `,
    )
    .run({
      restaurantId: targetWaiter.restaurant_id,
      seededAt: SEEDED_AT,
    });

  // 演示库只创建一个全权限账号，不复制原账号密码、令牌或登录痕迹。
  seed
    .prepare(
      `
        INSERT INTO restaurant_waiter (
          id,
          waiter_no,
          restaurant_id,
          name,
          account,
          password,
          on_off,
          last_device,
          last_login_time,
          creator,
          fcm_token,
          cashier_mode,
          create_time,
          update_time,
          clock_status,
          self_order_mode
        )
        SELECT
          id,
          'DEMO_ADMIN',
          restaurant_id,
          'Admin',
          @demoAccount,
          @passwordHash,
          1,
          NULL,
          NULL,
          0,
          NULL,
          cashier_mode,
          @seededAt,
          @seededAt,
          clock_status,
          self_order_mode
        FROM source.restaurant_waiter
        WHERE id = @waiterId
      `,
    )
    .run({
      demoAccount: DEMO_ACCOUNT,
      passwordHash: DEMO_PASSWORD_HASH,
      seededAt: SEEDED_AT,
      waiterId: targetWaiter.id,
    });

  copyRows("sys_user_role", "user_id = @waiterId", { waiterId: targetWaiter.id });
  copyRows(
    "sys_role",
    `id IN (
      SELECT role_id FROM source.sys_user_role WHERE user_id = @waiterId
    )`,
    { waiterId: targetWaiter.id },
  );
  copyRows(
    "sys_role_permission",
    `role_id IN (
      SELECT role_id FROM source.sys_user_role WHERE user_id = @waiterId
    )`,
    { waiterId: targetWaiter.id },
  );
  copyRows(
    "sys_permission",
    `id IN (
      SELECT permission_id
      FROM source.sys_role_permission
      WHERE role_id IN (
        SELECT role_id FROM source.sys_user_role WHERE user_id = @waiterId
      )
    )`,
    { waiterId: targetWaiter.id },
  );

  // 图片 URL 无法在纯离线环境稳定使用，seed 仅保留菜单文字和价格数据。
  seed.exec(`
    UPDATE dish_category SET img_url = NULL;
    UPDATE dish_product SET menu_img_url = NULL, detail_img_url = NULL;
    UPDATE payment_channel SET logo = NULL;
  `);

  // 单餐厅演示库不继承线上组织层级和真实商户标识。
  seed
    .prepare(
      `
        UPDATE restaurant
        SET merchant_no = NULL,
            merchant_name = 'Swifood Demo',
            manager_id = 0,
            father_rest_id = 0,
            father_rest_id_list = '',
            update_time = @seededAt
        WHERE id = @restaurantId
      `,
    )
    .run({
      restaurantId: targetWaiter.restaurant_id,
      seededAt: SEEDED_AT,
    });
})();

seed.exec("DETACH DATABASE source");

// 数据写入后再创建索引和触发器，避免复制过程中重复维护索引。
for (const schema of schemaRows.filter(({ type }) => type !== "table")) {
  seed.exec(schema.sql);
}

seed.pragma(`user_version = ${Number(userVersion) || 0}`);
seed.exec("VACUUM");

const integrity = seed.pragma("integrity_check", { simple: true });
if (integrity !== "ok") {
  seed.close();
  fs.rmSync(temporaryPath, { force: true });
  throw new Error(`Seed database integrity check failed: ${integrity}`);
}

const demoWaiter = seed.prepare("SELECT account, password FROM restaurant_waiter").get();
if (
  seed.prepare("SELECT COUNT(*) FROM restaurant_waiter").pluck().get() !== 1 ||
  demoWaiter?.account !== DEMO_ACCOUNT ||
  !bcrypt.compareSync(DEMO_PASSWORD, demoWaiter.password)
) {
  seed.close();
  fs.rmSync(temporaryPath, { force: true });
  throw new Error("Seed demo account validation failed.");
}

const dynamicTables = [
  "app_log",
  "data_sync_status",
  "food_order",
  "food_order_print_info",
  "local_asset",
  "local_device_identity",
  "local_setting",
  "order_coupon_snapshot",
  "order_detail",
  "order_detail_snap",
  "order_payment",
  "order_payment_info",
  "order_payment_tax",
  "order_status_change",
  "order_summary",
  "pending_clock_sync",
  "pending_order_sync",
  "restaurant_label_printer_setting",
  "restaurant_pos_download_file_setting",
  "restaurant_printer_category",
  "restaurant_report_print",
  "restaurant_waiter_allowance",
  "restaurant_waiter_blue_tooth_setting",
  "restaurant_waiter_clock_record",
  "scheduled_order_task",
  "settings",
  "waiter_clock_order",
  "withdrawal_record",
];

for (const tableName of dynamicTables) {
  const count = seed
    .prepare(`SELECT COUNT(*) FROM ${quoteIdentifier(tableName)}`)
    .pluck()
    .get();
  if (count !== 0) {
    seed.close();
    fs.rmSync(temporaryPath, { force: true });
    throw new Error(`Seed dynamic table is not empty: ${tableName}`);
  }
}

const summary = {
  restaurantId: targetWaiter.restaurant_id,
  account: DEMO_ACCOUNT,
  categories: seed.prepare("SELECT COUNT(*) FROM dish_category").pluck().get(),
  products: seed.prepare("SELECT COUNT(*) FROM dish_product").pluck().get(),
  skus: seed.prepare("SELECT COUNT(*) FROM dish_product_sku").pluck().get(),
  tables: seed.prepare("SELECT COUNT(*) FROM restaurant_table").pluck().get(),
  permissions: seed.prepare("SELECT COUNT(*) FROM sys_permission").pluck().get(),
};
seed.close();

fs.copyFileSync(temporaryPath, targetPath);
fs.rmSync(temporaryPath, { force: true });

console.log(`Seed database created: ${targetPath}`);
console.log(JSON.stringify(summary, null, 2));
