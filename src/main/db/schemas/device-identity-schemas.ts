export const deviceIdentitySchemas: Array<string> = [
  `
-- 当前安装实例的设备身份表，仅允许保存一条本机设备记录。
CREATE TABLE IF NOT EXISTS local_device_identity (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device_id TEXT NOT NULL UNIQUE,
    hardware_fingerprint TEXT,
    hardware_snapshot TEXT,
    platform TEXT NOT NULL,
    confidence TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
`,
]
