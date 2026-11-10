import { DeleteOutlined, RobotOutlined, SendOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Empty, FloatButton, Input, Modal, Spin } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "./AgentAssistant.css";
import MarkdownMessage from "./MarkdownMessage";

const CONVERSATION_STORAGE_KEY = "swifood-agent-conversation-id";

const { TextArea } = Input;
const MAX_QUESTION_LENGTH = 2000;
const CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createConversationId = () => {
  const id = window.crypto.randomUUID();
  window.localStorage.setItem(CONVERSATION_STORAGE_KEY, id);
  return id;
};

const getInitialConversationId = () => {
  const storedConversationId = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);

  // 旧版本或手工修改产生的无效值不能继续传给主进程。
  return storedConversationId && CONVERSATION_ID_PATTERN.test(storedConversationId)
    ? storedConversationId
    : createConversationId();
};

function AgentAssistant() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const messageIdRef = useRef(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [conversationId, setConversationId] = useState(getInitialConversationId);

  const createMessage = useCallback((role, content, status = "success") => {
    messageIdRef.current += 1;

    return {
      id: messageIdRef.current,
      role,
      content,
      status,
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    // 新问题和回答出现后保持最新内容可见，避免长对话停留在旧位置。
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [asking, messages, open]);

  // 加载历史信息
  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setHistoryLoading(true);

      try {
        const history = await window.api.agent.history(conversationId);

        if (!cancelled) {
          // 将普通历史数据转换成页面消息对象。
          setMessages(history.map((message) => createMessage(message.role, message.content)));
        }
      } catch (error) {
        if (!cancelled) {
          setMessages([createMessage("assistant", error?.message || t("agent.request_failed"), "error")]);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [conversationId, createMessage, t]);

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) return;

    // 弹窗动画结束后再聚焦，确保收银员打开即可直接输入。
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleClear = async () => {
    if (asking || historyLoading) return;

    try {
      await window.api.agent.clear(conversationId);

      const nextConversationId = createConversationId();
      setMessages([]);
      setConversationId(nextConversationId);
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", error?.message || t("agent.request_failed"), "error"),
      ]);
    }
  };

  const handleSubmit = async () => {
    const normalizedQuestion = question.trim();

    if (!normalizedQuestion || asking || historyLoading) return;

    setMessages((currentMessages) => [...currentMessages, createMessage("user", normalizedQuestion)]);
    setQuestion("");
    setAsking(true);

    try {
      // Renderer 只调用受保护的 preload API，模型和真实数据工具继续留在主进程执行。
      const result = await window.api.agent.ask({
        question: normalizedQuestion,
        conversationId,
      });
      const answer = typeof result?.answer === "string" ? result.answer.trim() : "";

      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", answer || t("agent.empty_answer")),
      ]);
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage("assistant", error?.message || t("agent.request_failed"), "error"),
      ]);
    } finally {
      setAsking(false);
    }
  };

  const handleInputKeyDown = (event) => {
    // 中文等输入法确认候选词时不发送；普通 Enter 快速发送，Shift + Enter 换行。
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <FloatButton
        className="agent-assistant-float"
        type="primary"
        icon={<RobotOutlined />}
        tooltip={t("agent.open")}
        aria-label={t("agent.open")}
        onClick={() => setOpen(true)}
      />

      <Modal
        className="agent-assistant-modal"
        width={720}
        open={open}
        title={
          <span className="agent-assistant-title">
            <span className="agent-assistant-title__icon" aria-hidden="true">
              <RobotOutlined />
            </span>
            {t("agent.title")}
          </span>
        }
        footer={null}
        mask={{ blur: true, closable: true }}
        focusable={{ trap: true, focusTriggerAfterClose: true }}
        onCancel={() => setOpen(false)}
        afterOpenChange={handleOpenChange}
        styles={{ body: { padding: 0 } }}
      >
        <div className="agent-assistant-dialog">
          <div className="agent-assistant-toolbar">
            <span>{t("agent.conversation_label")}</span>
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              disabled={messages.length === 0 || asking || historyLoading}
              onClick={handleClear}
            >
              {t("agent.clear")}
            </Button>
          </div>

          <div className="agent-assistant-messages" role="log" aria-live="polite">
            {messages.length === 0 && !asking ? (
              <Empty
                className="agent-assistant-empty"
                image={<RobotOutlined className="agent-assistant-empty__icon" />}
                description={
                  <div>
                    <div className="agent-assistant-empty__title">{t("agent.empty_title")}</div>
                    <div className="agent-assistant-empty__description">{t("agent.empty_description")}</div>
                  </div>
                }
              />
            ) : null}

            {messages.map((message) => {
              const isUser = message.role === "user";

              return (
                <div key={message.id} className={`agent-message agent-message--${message.role}`}>
                  <div className="agent-message__identity" aria-hidden="true">
                    {isUser ? <UserOutlined /> : <RobotOutlined />}
                  </div>
                  <div className="agent-message__content">
                    <div className="agent-message__name">{isUser ? t("agent.you") : t("agent.assistant")}</div>
                    <div
                      className={`agent-message__bubble${
                        message.status === "error" ? " agent-message__bubble--error" : ""
                      }`}
                    >
                      {/* 用户输入和助手输出共用同一套 Markdown 展示规则，内存中仍保存原始文本。 */}
                      <MarkdownMessage content={message.content} />
                    </div>
                  </div>
                </div>
              );
            })}

            {asking ? (
              <div className="agent-message agent-message--assistant">
                <div className="agent-message__identity" aria-hidden="true">
                  <RobotOutlined />
                </div>
                <div className="agent-message__content">
                  <div className="agent-message__name">{t("agent.assistant")}</div>
                  <div className="agent-message__bubble agent-message__bubble--thinking">
                    <Spin size="small" />
                    <span>{t("agent.thinking")}</span>
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <div className="agent-assistant-composer">
            <div className="agent-assistant-composer__row">
              <TextArea
                ref={inputRef}
                value={question}
                maxLength={MAX_QUESTION_LENGTH}
                autoSize={{ minRows: 2, maxRows: 5 }}
                placeholder={t("agent.input_placeholder")}
                aria-label={t("agent.input_placeholder")}
                disabled={asking || historyLoading}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              <Button
                className="agent-assistant-send"
                type="primary"
                htmlType="button"
                icon={<SendOutlined />}
                loading={asking}
                disabled={!question.trim() || historyLoading}
                onClick={handleSubmit}
              >
                {t("agent.send")}
              </Button>
            </div>
            <div className="agent-assistant-composer__hint">{t("agent.input_hint")}</div>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default AgentAssistant;
