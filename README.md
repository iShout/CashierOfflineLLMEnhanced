# Swifood Cashier Offline

基于 Electron、React 和 SQLite 的离线 Windows 收银项目，包含可选的联网 Agent 功能模块。

## 运行范围

- 保留本地账号登录与权限、桌台/排队点餐、现金收款、手工录单、自定义/PWD/SC 折扣、订单取消/退款/清台、员工打卡与交接班、报表、电子凭证预览和本地文件导出。
- 不再提供服务器登录、POS 在线绑定、在线支付、优惠券核销、数据同步、网络状态探测或后台上传。
- 不再提供打印机设置、USB/标签/厨房/小票打印、自动打印或通过打印机开启钱箱。日终报告仍生成并保存本地快照，支持电子预览及导出。
- 收银页面禁止外网资源请求；开发模式仅放行本机 Vite/热更新连接。可选 Agent 在 Node 侧请求 DeepSeek，不改变收银业务的离线运行方式。安装依赖和制作安装包仍可能需要下载开发工具。

## 本地数据

开发时使用 `resources/database.db`；安装包使用 Electron `app.getPath("userData")` 目录下的 `database.db`，图片等本地文件位于同目录的 `local-assets/`。

新环境首次启动时，如果对应的运行数据库不存在，应用会从版本库中的脱敏种子库 `resources/database.seed.db` 复制一份独立运行库。已有数据库不会被 seed 覆盖。种子库仅保留 Demo 餐厅的菜单、桌台、权限和必要配置，不包含订单、支付、退款、打卡、日志、同步队列、真实账号密码或税务身份信息。

演示登录账号：

```text
账号：admin
密码：123456
```

维护人员需要从本机完整数据库重新生成脱敏 seed 时，可在应用关闭后执行 `npm run db:seed:build`。覆盖 `resources/database.seed.db`；提交前应检查生成脚本的校验结果。

登录验证只读取本地账号及密码。首次使用必须已有准备好的本地账号、餐厅设置和菜单数据；本项目没有新增空库初始化或管理后台。需要迁移时，应在应用关闭后准备本地数据库及关联图片文件。已有业务数据不会因模块精简被清空。

登录不再展示、恢复或执行 BIR/POS 绑定，账号会话只关联本地餐厅。订单、折扣、定时任务、打卡、报表、BIR 和商场文件查询均按餐厅处理，不再用 `device_no` 隔离；旧数据库中的该字段仅作为可空历史元数据保留。进入系统时静默补齐历史日报，不再展示日报提示弹窗；报表页面功能保留。

本次精简保留了兼容历史数据库所需的表和字段，以及电子凭证使用的票据快照/文本生成器；它们不再连接硬件或同步服务器。

## Agent 功能模块

`agent/` 是本项目的功能模块，源码直接放在 `agent/` 下。

开发配置仍使用 `agent/.env` 中的 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL`，已有配置无需移动。没有配置时可参考 `agent/.env.example`；不要提交 API Key。

以下命令均在项目根目录执行：

```bash
npm run agent:check
npm run agent:dev -- "今天营业额多少？"
```

应用主进程已注册 `agent:ask`，登录后可通过全局悬浮 Smart Assistant 对话框提问，或直接调用 `window.api.agent.ask(question)` 获取 `{ answer, trace }`。模型代码按需加载，应用启动不会调用模型；安装包从 `userData/agent.env` 或进程环境变量读取模型配置，开发机的 `.env` 不进入安装包。

当前 Agent 已接入真实订单详情工具，直接复用收银业务方法和现有 SQLite 数据库，并按登录餐厅控制读取范围；不会新建数据库或复制业务查询逻辑。当前 IPC 仍为一次请求一次响应，流式回答尚未接入。

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## 开发者日志

应用内置了一个隐藏的开发者日志页面，主要用于上线后快速排查问题。日志会写入本地 SQLite 的 `app_log` 表，可以在应用内查看，不需要打开 DevTools。

### 打开日志页面

1. 打开左侧菜单。
2. 连续点击 `Swifood Cashier Offline Version 1.0.4` 八次。
3. 应用会打开隐藏页面 `/developer-logs`。

### 自动收集的日志

- 主进程的 `console.log`、`console.info`、`console.warn`、`console.error`。
- 主进程的 `uncaughtException` 和 `unhandledRejection`。
- 渲染进程全局 `window.error` 和 `window.unhandledrejection`。
- 渲染进程通过 `window.appLogger` 主动写入的日志。

渲染进程的普通 `console.log` 不会自动写入数据库。如果希望渲染进程日志持久化，请使用 `window.appLogger`。

### 渲染进程用法

```js
window.appLogger.log("loaded table area", { restaurantId }, "table");
window.appLogger.info("order saved", { orderInnerNo }, "order");
window.appLogger.warn("local setting missing", { restaurantId }, "setting");
window.appLogger.error("payment failed", error, { orderInnerNo }, "payment");
```

`window.appLogger` 也会作为全局变量 `appLogger` 暴露，但为了代码可读性，推荐优先使用 `window.appLogger`。

### 主进程用法

主进程代码可以继续使用普通 `console` 方法：

```js
console.log("order saved", payload);
console.warn("local configuration warning", error);
console.error("payment failed", error);
```

这些日志会在应用启动并执行 `initAppLogger()` 之后被自动捕获。

### Tag 规则

`tag` 是可选字段，用于在日志页面快速筛选和分类日志。

- 开发者主动调用 `console` 或 `window.appLogger.log/info/warn/error(...)` 时，所有字符串参数会用空格拼接成 `tag`。
- 系统自动捕获的错误日志，`tag` 固定为 `System`。
- 没有 `tag` 时，日志页面会显示 `-`。

示例：

```js
window.appLogger.log("loaded table area", { restaurantId }, "table");
```

会写入：

- `message`: `loaded table area`
- `tag`: `loaded table area table`
- `context`: `{ restaurantId }`

### 日志页面功能

- 按日期范围筛选。
- 按等级筛选：`log`、`info`、`warn`、`error`。
- 按来源筛选：`main`、`renderer`、`process`、`ipc`。
- 按 `tag` 筛选，支持模糊匹配和精确匹配。
- 支持按时间正序或倒序排序。
- 点击 `message` 可以查看完整 message、stack 和 context。
- 支持复制当前页日志或单条日志详情。
- 支持清空本地 `app_log` 表。

### 注意事项

- 业务数据清理会保留 `app_log`，如需清空日志，请使用日志页面的清空按钮。
- 日志结构变更时，历史旧日志不会自动补齐新字段。
- 除非排查问题确实需要，否则不要记录敏感的客户信息或支付信息。
