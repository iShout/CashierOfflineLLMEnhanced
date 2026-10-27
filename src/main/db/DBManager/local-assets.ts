import { app } from "electron";
import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { getDB } from "../index";
import { localPathToAssetUrl } from "@main/protocol/local-assets";

export type LocalAssetSourceType = "remote" | "camera" | "upload";
export type LocalAssetSyncStatus = "pending" | "ready" | "failed" | "uploaded";

export interface LocalAssetRecord {
  id: string;
  asset_type: string;
  source_type: LocalAssetSourceType;
  source_url: string | null;
  source_key: string | null;
  local_path: string;
  mime_type: string | null;
  size: number;
  sha256: string | null;
  sync_status: LocalAssetSyncStatus;
  created_at: string;
  updated_at: string;
}

interface CreateLocalAssetPayload {
  id?: string;
  assetType?: string;
  sourceType: LocalAssetSourceType;
  sourceUrl?: string | null;
  sourceKey?: string | null;
  localPath: string;
  mimeType?: string | null;
  size?: number;
  sha256?: string | null;
  syncStatus?: LocalAssetSyncStatus;
}

interface SaveImageFromDataUrlPayload {
  dataUrl: string;
  sourceType?: LocalAssetSourceType;
  sourceUrl?: string | null;
  sourceKey?: string | null;
  syncStatus?: LocalAssetSyncStatus;
}

interface SaveImageBufferPayload {
  id?: string;
  buffer: Buffer;
  extension: string;
  mimeType: string;
  sourceType: LocalAssetSourceType;
  sourceUrl?: string | null;
  sourceKey?: string | null;
  syncStatus?: LocalAssetSyncStatus;
}

type LocalAssetResponse = LocalAssetRecord & {
  fullPath: string;
  fileUrl: string;
  assetUrl: string;
};

const USER_DATA_ASSET_ROOT = "local-assets";
const IMAGE_ASSET_ROOT = path.join(USER_DATA_ASSET_ROOT, "images");

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// 获取应用运行时数据目录，所有本地资源都放在该目录下，避免和源码静态资源混在一起。
const getUserDataPath = () => app.getPath("userData");

// 将数据库中保存的相对路径转换为本机绝对路径。
const getAssetFullPath = (localPath: string) => path.join(getUserDataPath(), localPath);

// 给资源记录补充前端可直接使用的应用内资源地址。
const withLocalFileUrl = (asset: LocalAssetRecord): LocalAssetResponse => {
  const fullPath = getAssetFullPath(asset.local_path);
  const assetUrl = localPathToAssetUrl(asset.local_path);

  return {
    ...asset,
    fullPath,
    fileUrl: assetUrl,
    assetUrl,
  };
};

// 解析摄像头或 canvas 生成的 data URL，得到可落盘的图片二进制。
const parseImageDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const extension = MIME_EXTENSION_MAP[mimeType];

  if (!extension) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  return {
    buffer: Buffer.from(base64, "base64"),
    extension,
    mimeType,
  };
};

// 统一保存图片二进制：打卡 data URL 和服务器图片下载后都走这里落盘并写入 local_asset。
const saveImageBufferToLocalAsset = (payload: SaveImageBufferPayload): LocalAssetResponse => {
  const sha256 = createHash("sha256").update(payload.buffer).digest("hex");
  const id = payload.id || randomUUID();
  // 使用 hash 前缀分层，避免单个目录下文件数量过多。
  const localPath = path.join(
    IMAGE_ASSET_ROOT,
    payload.sourceType,
    sha256.slice(0, 2),
    sha256.slice(2, 4),
    `${id}.${payload.extension}`,
  );
  const fullPath = getAssetFullPath(localPath);

  // 写文件成功后再写数据库，避免出现数据库有记录但文件不存在。
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, payload.buffer);

  const asset = createLocalAsset({
    id,
    sourceType: payload.sourceType,
    sourceUrl: payload.sourceUrl,
    sourceKey: payload.sourceKey,
    localPath,
    mimeType: payload.mimeType,
    size: payload.buffer.length,
    sha256,
    syncStatus: payload.syncStatus || "ready",
  });

  return withLocalFileUrl(asset);
};

// 创建或更新本地资源记录；远程资源用 source_url 做唯一缓存。
const createLocalAsset = (payload: CreateLocalAssetPayload): LocalAssetRecord => {
  const db = getDB();
  const now = new Date().toISOString();
  const id = payload.id || randomUUID();

  const record = {
    id,
    asset_type: payload.assetType || "image",
    source_type: payload.sourceType,
    source_url: payload.sourceUrl ?? null,
    source_key: payload.sourceKey ?? null,
    local_path: payload.localPath,
    mime_type: payload.mimeType ?? null,
    size: payload.size ?? 0,
    sha256: payload.sha256 ?? null,
    sync_status: payload.syncStatus || "ready",
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `
      INSERT INTO local_asset (
        id,
        asset_type,
        source_type,
        source_url,
        source_key,
        local_path,
        mime_type,
        size,
        sha256,
        sync_status,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @asset_type,
        @source_type,
        @source_url,
        @source_key,
        @local_path,
        @mime_type,
        @size,
        @sha256,
        @sync_status,
        @created_at,
        @updated_at
      )
      ON CONFLICT(source_url) DO UPDATE SET
        asset_type = excluded.asset_type,
        source_type = excluded.source_type,
        source_key = excluded.source_key,
        local_path = excluded.local_path,
        mime_type = excluded.mime_type,
        size = excluded.size,
        sha256 = excluded.sha256,
        sync_status = excluded.sync_status,
        updated_at = excluded.updated_at
    `,
  ).run(record);

  if (record.source_url) {
    return getLocalAssetBySourceUrl(record.source_url) || record;
  }

  return getLocalAssetById(id) || record;
};

// 根据本地资源ID查询资源元信息。
const getLocalAssetById = (id: string): LocalAssetRecord | null => {
  const db = getDB();

  return (
    (db
      .prepare(
        `
          SELECT *
          FROM local_asset
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(id) as LocalAssetRecord | undefined) || null
  );
};

// 根据远程URL查询本地缓存记录，用于离线展示服务器图片。
const getLocalAssetBySourceUrl = (sourceUrl: string): LocalAssetRecord | null => {
  const db = getDB();

  return (
    (db
      .prepare(
        `
          SELECT *
          FROM local_asset
          WHERE source_url = ?
          LIMIT 1
        `,
      )
      .get(sourceUrl) as LocalAssetRecord | undefined) || null
  );
};

// 根据本地资源ID返回前端可直接放进 img src 的应用内资源地址。
const getLocalAssetFileUrl = (id: string): string | null => {
  const asset = getLocalAssetById(id);

  if (!asset) {
    return null;
  }

  return withLocalFileUrl(asset).fileUrl;
};

// 保存 data URL 图片到 userData/local-assets/images，并写入 local_asset 表。
const saveImageFromDataUrl = (payload: SaveImageFromDataUrlPayload): LocalAssetResponse => {
  const { buffer, extension, mimeType } = parseImageDataUrl(payload.dataUrl);

  return saveImageBufferToLocalAsset({
    buffer,
    extension,
    mimeType,
    sourceType: payload.sourceType || "camera",
    sourceUrl: payload.sourceUrl,
    sourceKey: payload.sourceKey,
    syncStatus: payload.syncStatus || "ready",
  });
};

// 下载服务器图片；拿到图片二进制后复用统一本地保存链路。

export {
  createLocalAsset,
  getAssetFullPath,
  getLocalAssetById,
  getLocalAssetBySourceUrl,
  getLocalAssetFileUrl,
  saveImageFromDataUrl,
  withLocalFileUrl,
};
