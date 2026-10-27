export const logSchemas: Array<string> = [
  `
CREATE TABLE IF NOT EXISTS app_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  tag TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  context TEXT
);
`,
  `
CREATE INDEX IF NOT EXISTS idx_app_log_created_at_ms
ON app_log(created_at_ms);
`,
  `
CREATE INDEX IF NOT EXISTS idx_app_log_level_created_at_ms
ON app_log(level, created_at_ms);
`,
];
