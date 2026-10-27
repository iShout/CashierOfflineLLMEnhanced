# Preload Structure

这个目录专门管理 Electron `preload` 层，目标是把“暴露什么给 renderer”和“这些能力按什么业务拆分”分开，后续扩展时不需要一直把逻辑堆在 `index.js`。

现在也补上了一套标准的 `preload + ipcMain` 写法，你后面可以直接照着复制。

纯离线版只暴露本地业务 API。`network`、`sync`、`printer`、`usb` 模块及对应 IPC 已移除，不应重新引入在线请求或硬件打印。

## 目录说明

### `index.js`

preload 的主入口。

- 只做启动和组装
- 不直接写复杂业务逻辑
- 方便以后替换或补充初始化逻辑

### `bridge/`

管理把能力挂到 `window` 上的过程。

- `bridge/expose.js`
  - 统一处理 `contextBridge.exposeInMainWorld`
  - 兼容 `contextIsolation` 开启和关闭两种情况
  - 这样后面如果要调整暴露策略，只改这一层

### `modules/`

按功能组织你想暴露给 renderer 的 API。

- `modules/index.js`
  - 所有 preload 模块的统一出口
  - 后续新增模块时，在这里汇总即可
- `modules/core.js`
  - 放通用、基础、项目级别的 preload API
  - 目前主要暴露共享的 IPC channel
- `modules/app.js`
  - 一个可直接照抄的标准示例模块
  - 同时演示了：
    - `ipcRenderer.invoke(...)`
    - `ipcRenderer.send(...)`
    - 将 API 挂到 `window.api.app`

后续你可以继续加：

- `modules/db.js`
- `modules/system.js`
- `modules/window.js`

然后在 `modules/index.js` 里统一合并导出。

### 共享 channel

共享的 IPC channel 已经抽到项目级目录：

- `/src/shared/ipc/channels.js`
  - 由 main 和 preload 共用
  - 集中管理 channel 名称
  - 避免两边复制字符串

## 标准写法

### 1. 有返回值时：`invoke` + `handle`

适合：

- 读取配置
- 获取版本号
- 读取数据库
- 调用后需要结果

preload:

```js
getVersion() {
  return ipcRenderer.invoke(IPC_CHANNELS.APP.GET_VERSION)
}
```

main:

```js
ipcMain.handle(IPC_CHANNELS.APP.GET_VERSION, () => {
  return app.getVersion()
})
```

### 2. 单向通知时：`send` + `on`

适合：

- 打日志
- 通知主进程执行一个动作
- 不关心返回值

preload:

```js
logMessage(message) {
  ipcRenderer.send(IPC_CHANNELS.APP.LOG_MESSAGE, { message })
}
```

main:

```js
ipcMain.on(IPC_CHANNELS.APP.LOG_MESSAGE, (_event, payload) => {
  console.log(payload)
})
```

## 推荐复制模板

如果你以后要新增一个模块，比如 `printer`，建议照这个结构抄：

1. 新建 `/src/shared/ipc/channels.js` 里的 `PRINTER` channel
2. 新建 `src/main/ipc/modules/printer.js`
3. 在里面写 `registerPrinterHandlers()`
4. 在 `src/main/ipc/index.js` 中注册它
5. 新建 `src/preload/modules/printer.js`
6. 在 `src/preload/modules/index.js` 中把它挂到 `customApi`

例如：

```js
// src/preload/modules/printer.js
import { ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc/channels'

export const printerApi = {
  printTestPage() {
    return ipcRenderer.invoke(IPC_CHANNELS.PRINTER.PRINT_TEST_PAGE)
  }
}
```

```js
// src/main/ipc/modules/printer.js
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc/channels'

export function registerPrinterHandlers() {
  ipcMain.handle(IPC_CHANNELS.PRINTER.PRINT_TEST_PAGE, async () => {
    return { success: true }
  })
}
```

## 推荐扩展方式

如果后续你要新增一个业务模块，比如打印：

1. 在共享 channels 里先定义名字
2. 在 main 的 `ipc/modules/` 下写 handler
3. 在 preload 的 `modules/` 下写调用封装
4. 在各自入口统一注册/导出

## 当前暴露结果

renderer 里仍然可以继续通过以下方式访问：

- `window.electron`
- `window.api`

目前你还可以直接这样用：

```js
await window.api.app.getVersion()
await window.api.app.getEnv()
window.api.app.logMessage('hello from renderer')
```

也就是说，这次调整主要是整理结构，不改变现有对外入口。
