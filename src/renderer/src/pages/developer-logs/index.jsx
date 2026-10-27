import { Button, DatePicker, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import { CopyOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Header from "@renderer/components/Header";

const { RangePicker } = DatePicker;

const LEVEL_OPTIONS = [
  { labelKey: "data.all_levels", value: "all" },
  { labelKey: "data.error_level", value: "error" },
  { labelKey: "data.warn_level", value: "warn" },
  { labelKey: "data.info_level", value: "info" },
  { labelKey: "data.log_level", value: "log" },
];

const SOURCE_OPTIONS = [
  { labelKey: "data.all_sources", value: "all" },
  { labelKey: "data.main_process", value: "main" },
  { labelKey: "data.renderer_process", value: "renderer" },
  { labelKey: "data.process", value: "process" },
  { label: "IPC", value: "ipc" },
];

const ORDER_OPTIONS = [
  { labelKey: "data.newest_first", value: "desc" },
  { labelKey: "data.oldest_first", value: "asc" },
];

const TAG_MATCH_OPTIONS = [
  { labelKey: "data.fuzzy_tag", value: "fuzzy" },
  { labelKey: "data.exact_tag", value: "exact" },
];

const levelColors = {
  error: "red",
  warn: "gold",
  info: "blue",
  log: "default",
};

const MESSAGE_PREVIEW_LENGTH = 180;

const getMessagePreview = (value) => {
  const messageText = String(value ?? "");

  if (messageText.length <= MESSAGE_PREVIEW_LENGTH) {
    return messageText;
  }

  return `${messageText.slice(0, MESSAGE_PREVIEW_LENGTH)}...`;
};

const formatLogForCopy = (log) => {
  return [
    `[${log.created_at}]`,
    `[${log.level}]`,
    `[${log.source}]`,
    log.tag ? `[tag:${log.tag}]` : "",
    log.message,
    log.stack ? `\n${log.stack}` : "",
    log.context ? `\ncontext: ${log.context}` : "",
  ].join(" ");
};

function DeveloperLogs() {
  const { t } = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();
  const [dateRange, setDateRange] = useState(null);
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [tag, setTag] = useState("");
  const [tagMatch, setTagMatch] = useState("fuzzy");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState(null);

  const query = useMemo(
    () => ({
      startTime: dateRange?.[0]?.valueOf() ?? null,
      endTime: dateRange?.[1]?.valueOf() ?? null,
      level,
      source,
      tag: tag.trim() || null,
      tagMatch,
      order,
      page,
      pageSize,
    }),
    [dateRange, level, order, page, pageSize, source, tag, tagMatch],
  );

  const loadLogs = useCallback(async () => {
    setLoading(true);

    try {
      const result = await window.api.logs.getEntries(query);
      setLogs(result.list ?? []);
      setTotal(result.total ?? 0);
    } catch (error) {
      messageApi.error(error?.message || String(error));
    } finally {
      setLoading(false);
    }
  }, [messageApi, query]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const resetToFirstPage = (updater) => {
    setPage(1);
    updater();
  };

  const handleClear = () => {
    Modal.confirm({
      title: t("data.clear_logs"),
      content: t("data.clear_logs_description"),
      okText: t("components.clear"),
      okButtonProps: { danger: true },
      onOk: async () => {
        await window.api.logs.clear();
        setLogs([]);
        setTotal(0);
        messageApi.success(t("data.logs_cleared"));
      },
    });
  };

  const handleCopy = async () => {
    const text = logs.map(formatLogForCopy).join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      messageApi.success(t("data.logs_copied"));
    } catch (error) {
      messageApi.error(error?.message || String(error));
    }
  };

  const handleCopySelectedLog = async () => {
    if (!selectedLog) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatLogForCopy(selectedLog));
      messageApi.success(t("data.log_detail_copied"));
    } catch (error) {
      messageApi.error(error?.message || String(error));
    }
  };

  const columns = [
    {
      title: t("data.time"),
      dataIndex: "created_at",
      key: "created_at",
      width: 172,
      render: (value) => <span className="font-mono text-[12px]">{value}</span>,
    },
    {
      title: t("data.level"),
      dataIndex: "level",
      key: "level",
      width: 94,
      render: (value) => <Tag color={levelColors[value] ?? "default"}>{String(value).toUpperCase()}</Tag>,
    },
    {
      title: t("data.source"),
      dataIndex: "source",
      key: "source",
      width: 110,
    },
    {
      title: t("data.tag"),
      dataIndex: "tag",
      key: "tag",
      width: 96,
      render: (value) =>
        value ? (
          <span
            className="inline-block max-w-[78px] truncate rounded border border-[#E5E7EB] bg-[#F6F7F9] px-1.5 py-0.5 align-middle font-mono text-[11px] leading-4 text-[#6B7280]"
            title={value}
          >
            {value}
          </span>
        ) : (
          <span className="font-mono text-[12px] text-info">-</span>
        ),
    },
    {
      title: t("data.message"),
      dataIndex: "message",
      key: "message",
      render: (value, record) => (
        <button
          type="button"
          className="block max-w-[760px] cursor-pointer truncate border-0 bg-transparent p-0 text-left font-mono text-[12px] text-primary hover:underline"
          title={t("data.view_full_message")}
          onClick={() => setSelectedLog(record)}
        >
          {getMessagePreview(value)}
        </button>
      ),
    },
  ];

  return (
    <div className="h-screen overflow-hidden bg-white">
      {contextHolder}
      <Header currentTitle={t("data.developer_logs")} onTopPage={false} backPath="/settings" />
      <div className="flex h-[calc(100vh-64px)] flex-col p-4">
        <div className="flex flex-none flex-wrap items-center gap-3 border-b border-line pb-4">
          <RangePicker
            showTime
            value={dateRange}
            onChange={(value) => resetToFirstPage(() => setDateRange(value))}
            className="w-[380px]"
            presets={[
              { label: t("data.last_hour"), value: [dayjs().subtract(1, "hour"), dayjs()] },
              { label: t("data.today"), value: [dayjs().startOf("day"), dayjs().endOf("day")] },
              { label: t("data.last_7_days"), value: [dayjs().subtract(7, "day"), dayjs()] },
            ]}
          />
          <Select
            value={level}
            options={LEVEL_OPTIONS.map((item) => ({ ...item, label: t(item.labelKey) }))}
            onChange={(value) => resetToFirstPage(() => setLevel(value))}
            className="w-[140px]"
          />
          <Select
            value={source}
            options={SOURCE_OPTIONS.map((item) => ({ ...item, label: t(item.labelKey) }))}
            onChange={(value) => resetToFirstPage(() => setSource(value))}
            className="w-[150px]"
          />
          <Input
            allowClear
            placeholder={t("data.tag")}
            value={tag}
            onChange={(event) => resetToFirstPage(() => setTag(event.target.value))}
            className="w-[180px]!"
          />
          <Select
            value={tagMatch}
            options={TAG_MATCH_OPTIONS.map((item) => ({ ...item, label: t(item.labelKey) }))}
            onChange={(value) => resetToFirstPage(() => setTagMatch(value))}
            className="w-[120px]"
          />
          <Select
            value={order}
            options={ORDER_OPTIONS.map((item) => ({ ...item, label: t(item.labelKey) }))}
            onChange={(value) => resetToFirstPage(() => setOrder(value))}
            className="w-[150px]"
          />
          <Space>
            <Button icon={<SearchOutlined />} type="primary" onClick={loadLogs} loading={loading}>
              {t("components.search")}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadLogs} loading={loading}>
              {t("components.refresh")}
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={logs.length === 0}>
              {t("components.copy")}
            </Button>
            <Button icon={<DeleteOutlined />} danger onClick={handleClear}>
              {t("components.clear")}
            </Button>
          </Space>
        </div>

        <div className="min-h-0 flex-1 pt-4">
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={logs}
            size="small"
            scroll={{ y: "calc(100vh - 260px)", x: 1180 }}
            expandable={{
              expandedRowRender: (record) => (
                <div className="space-y-3 font-mono text-[12px]">
                  {record.stack ? (
                    <div>
                      <div className="mb-1 font-semibold text-primary">{t("data.stack")}</div>
                      <pre className="m-0 whitespace-pre-wrap break-words">{record.stack}</pre>
                    </div>
                  ) : null}
                  {record.context ? (
                    <div>
                      <div className="mb-1 font-semibold text-primary">{t("data.context")}</div>
                      <pre className="m-0 whitespace-pre-wrap break-words">{record.context}</pre>
                    </div>
                  ) : null}
                </div>
              ),
              rowExpandable: (record) => Boolean(record.stack || record.context),
            }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [50, 100, 200, 500],
              showTotal: (count) => t("data.log_count", { count }),
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              },
            }}
          />
        </div>
      </div>
      <Modal
        open={Boolean(selectedLog)}
        title={t("data.log_detail")}
        width={900}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopySelectedLog}>
            {t("components.copy")}
          </Button>,
          <Button key="close" type="primary" onClick={() => setSelectedLog(null)}>
            {t("components.close")}
          </Button>,
        ]}
        onCancel={() => setSelectedLog(null)}
      >
        {selectedLog ? (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto font-mono text-[12px]">
            <div className="grid grid-cols-[90px_1fr] gap-y-2 text-[13px]">
              <span className="font-semibold text-primary">{t("data.time")}</span>
              <span>{selectedLog.created_at}</span>
              <span className="font-semibold text-primary">{t("data.level")}</span>
              <span>{selectedLog.level}</span>
              <span className="font-semibold text-primary">{t("data.source")}</span>
              <span>{selectedLog.source}</span>
              <span className="font-semibold text-primary">{t("data.tag")}</span>
              <span className="break-words text-[#6B7280]">{selectedLog.tag || "-"}</span>
            </div>
            <div>
              <div className="mb-1 font-semibold text-primary">{t("data.message")}</div>
              <pre className="m-0 whitespace-pre-wrap break-words rounded border border-line bg-[#f7f7f7] p-3">
                {selectedLog.message}
              </pre>
            </div>
            {selectedLog.stack ? (
              <div>
                <div className="mb-1 font-semibold text-primary">{t("data.stack")}</div>
                <pre className="m-0 whitespace-pre-wrap break-words rounded border border-line bg-[#f7f7f7] p-3">
                  {selectedLog.stack}
                </pre>
              </div>
            ) : null}
            {selectedLog.context ? (
              <div>
                <div className="mb-1 font-semibold text-primary">{t("data.context")}</div>
                <pre className="m-0 whitespace-pre-wrap break-words rounded border border-line bg-[#f7f7f7] p-3">
                  {selectedLog.context}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default DeveloperLogs;
