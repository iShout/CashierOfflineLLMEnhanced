export function exposePreloadApis({
  contextBridge,
  electronAPI,
  customApi,
  isContextIsolated,
}) {
  if (isContextIsolated) {
    try {
      contextBridge.exposeInMainWorld("electron", electronAPI);
      contextBridge.exposeInMainWorld("api", customApi);
    } catch (error) {
      console.error(error);
    }

    return;
  }

  window.electron = electronAPI;
  window.api = customApi;
}
