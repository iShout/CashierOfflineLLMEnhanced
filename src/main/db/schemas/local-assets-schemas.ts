export const CREATE_LOCAL_ASSET_TABLE = `
-- 本地资源表：图片文件存放在 userData/local-assets 下，表中只保存索引和元信息。
CREATE TABLE IF NOT EXISTS local_asset (
    -- 本地资源唯一ID，业务表可保存该ID来引用本地图片
    id TEXT PRIMARY KEY,
    -- 资源类型，目前主要为 image，后续可扩展 video/file
    asset_type TEXT DEFAULT 'image' NOT NULL,
    -- 来源类型：remote=远程下载，camera=摄像头拍照，upload=本地上传
    source_type TEXT NOT NULL,
    -- 原始远程URL；远程图片缓存时用于通过服务器URL查找本地文件
    source_url TEXT,
    -- 来源业务key；例如 OSS key、login-photo、shift-working-photo 等
    source_key TEXT,
    -- 相对 app.getPath('userData') 的文件路径，不保存绝对路径以便迁移
    local_path TEXT NOT NULL,
    -- 文件 MIME 类型，例如 image/jpeg、image/png
    mime_type TEXT,
    -- 文件字节大小
    size INTEGER DEFAULT 0 NOT NULL,
    -- 文件内容 sha256，用于校验、去重和排查文件变化
    sha256 TEXT,
    -- 同步状态：pending=待处理，ready=本地可用，failed=处理失败，uploaded=已上传服务器
    sync_status TEXT DEFAULT 'ready' NOT NULL,
    -- 创建时间，ISO 字符串
    created_at TEXT NOT NULL,
    -- 更新时间，ISO 字符串
    updated_at TEXT NOT NULL,
    -- 同一个远程URL只保留一份本地缓存；source_url 为空时不影响本地拍照多次保存
    UNIQUE (source_url)
);

CREATE INDEX IF NOT EXISTS idx_local_asset_source_type
    ON local_asset (source_type);

CREATE INDEX IF NOT EXISTS idx_local_asset_source_key
    ON local_asset (source_key);

CREATE INDEX IF NOT EXISTS idx_local_asset_sha256
    ON local_asset (sha256);
`;

export const localAssetSchemas: Array<string> = [CREATE_LOCAL_ASSET_TABLE];
