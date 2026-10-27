import { app, protocol } from "electron";
import fs from "fs";
import path from "path";

export const LOCAL_ASSET_PROTOCOL = "swifood-asset";

const USER_DATA_ASSET_ROOT = "local-assets";

const MIME_TYPE_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// 必须在 app ready 前注册 scheme 权限，Chromium 才会把它当成安全资源协议。
export function registerLocalAssetProtocolScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_ASSET_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

const getAssetRoot = () =>
  path.resolve(app.getPath("userData"), USER_DATA_ASSET_ROOT);

const getMimeType = (filePath) =>
  MIME_TYPE_MAP[path.extname(filePath).toLowerCase()] ||
  "application/octet-stream";

// local_path 是相对 userData 的路径，这里转换成 renderer 可用的应用内 URL。
export function localPathToAssetUrl(localPath) {
  const normalizedPath = localPath.split(path.sep).join("/");
  const encodedPath = normalizedPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${LOCAL_ASSET_PROTOCOL}://${encodedPath}`;
}

export function registerLocalAssetProtocolHandler() {
  protocol.handle(LOCAL_ASSET_PROTOCOL, async (request) => {
    const assetUrl = new URL(request.url);
    const relativePath = decodeURIComponent(
      `${assetUrl.hostname}${assetUrl.pathname}`,
    );
    const assetRoot = getAssetRoot();
    const fullPath = path.resolve(app.getPath("userData"), relativePath);

    // 只允许访问 userData/local-assets，避免 renderer 借协议读取任意本机文件。
    if (!fullPath.startsWith(`${assetRoot}${path.sep}`)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const data = await fs.promises.readFile(fullPath);

      return new Response(data, {
        headers: {
          "content-type": getMimeType(fullPath),
        },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}
