import { getDB } from "../index";

export type AppLogLevel = "log" | "info" | "warn" | "error";
export type AppLogSource = "main" | "renderer" | "process" | "ipc";

export type AppLogEntry = {
  id?: number;
  created_at: string;
  created_at_ms: number;
  level: AppLogLevel;
  source: AppLogSource | string;
  tag?: string | null;
  message: string;
  stack?: string | null;
  context?: string | null;
};

export type AppLogQuery = {
  startTime?: number | null;
  endTime?: number | null;
  level?: AppLogLevel | "all" | null;
  source?: AppLogSource | "all" | null;
  tag?: string | null;
  tagMatch?: "fuzzy" | "exact" | null;
  order?: "asc" | "desc" | null;
  page?: number | null;
  pageSize?: number | null;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

const escapeLikeValue = (value: string): string => {
  return value.replace(/[\\%_]/g, (matched) => `\\${matched}`);
};

const normalizePage = (page?: number | null): number => {
  const value = Number(page || 1);

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
};

const normalizePageSize = (pageSize?: number | null): number => {
  const value = Number(pageSize || DEFAULT_PAGE_SIZE);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
};

export const insertAppLog = (entry: AppLogEntry): void => {
  getDB()
    .prepare(
      `
        INSERT INTO app_log (
          created_at,
          created_at_ms,
          level,
          source,
          tag,
          message,
          stack,
          context
        ) VALUES (
          @created_at,
          @created_at_ms,
          @level,
          @source,
          @tag,
          @message,
          @stack,
          @context
        )
      `,
    )
    .run({
      ...entry,
      tag: entry.tag ?? null,
      stack: entry.stack ?? null,
      context: entry.context ?? null,
    });
};

const buildLogWhere = (query: AppLogQuery) => {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.startTime) {
    clauses.push("created_at_ms >= @startTime");
    params.startTime = Number(query.startTime);
  }

  if (query.endTime) {
    clauses.push("created_at_ms <= @endTime");
    params.endTime = Number(query.endTime);
  }

  if (query.level && query.level !== "all") {
    clauses.push("level = @level");
    params.level = query.level;
  }

  if (query.source && query.source !== "all") {
    clauses.push("source = @source");
    params.source = query.source;
  }

  const tag = query.tag?.trim();
  if (tag) {
    if (query.tagMatch === "exact") {
      clauses.push("tag = @tag");
      params.tag = tag;
    } else {
      clauses.push("tag LIKE @tag ESCAPE '\\'");
      params.tag = `%${escapeLikeValue(tag)}%`;
    }
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
};

export const queryAppLogs = (query: AppLogQuery = {}) => {
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize);
  const order = query.order === "asc" ? "ASC" : "DESC";
  const offset = (page - 1) * pageSize;
  const { whereSql, params } = buildLogWhere(query);

  const totalRow = getDB()
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM app_log
        ${whereSql}
      `,
    )
    .get(params) as { total: number };

  const list = getDB()
    .prepare(
      `
        SELECT
          id,
          created_at,
          created_at_ms,
          level,
          source,
          tag,
          message,
          stack,
          context
        FROM app_log
        ${whereSql}
        ORDER BY created_at_ms ${order}, id ${order}
        LIMIT @limit OFFSET @offset
      `,
    )
    .all({
      ...params,
      limit: pageSize,
      offset,
    }) as AppLogEntry[];

  return {
    list,
    total: totalRow.total,
    page,
    pageSize,
  };
};

export const clearAppLogs = (): void => {
  getDB().prepare("DELETE FROM app_log").run();
};

export const pruneAppLogs = (options: { maxRows?: number; retentionDays?: number } = {}): void => {
  const maxRows = options.maxRows ?? 10000;
  const retentionDays = options.retentionDays ?? 14;
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  getDB().prepare("DELETE FROM app_log WHERE created_at_ms < @cutoffTime").run({ cutoffTime });

  getDB()
    .prepare(
      `
        DELETE FROM app_log
        WHERE id NOT IN (
          SELECT id
          FROM app_log
          ORDER BY created_at_ms DESC, id DESC
          LIMIT @maxRows
        )
      `,
    )
    .run({ maxRows });
};
