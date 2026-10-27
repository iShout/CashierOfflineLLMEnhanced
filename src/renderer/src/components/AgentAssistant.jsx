import { DeleteOutlined, RobotOutlined, SendOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Empty, FloatButton, Input, Modal, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import "./AgentAssistant.css";

const { TextArea } = Input;
const MAX_QUESTION_LENGTH = 2000;

function AgentAssistant() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);
  const messageIdRef = useRef(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const createMessage = (role, content, status = "success") => {
    messageIdRef.current += 1;

    return {
      id: messageIdRef.current,
      role,
      content,
      status,
    };
  };

  useEffect(() => {
    if (!open) return;

    // 新问题和回答出现后保持最新内容可见，避免长对话停留在旧位置。
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [asking, messages, open]);

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) return;

    // 弹窗动画结束后再聚焦，确保收银员打开即可直接输入。
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSubmit = async () => {
    const normalizedQuestion = question.trim();

    if (!normalizedQuestion || asking) return;

    setMessages((currentMessages) => [...currentMessages, createMessage("user", normalizedQuestion)]);
    setQuestion("");
    setAsking(true);

    try {
      // Renderer 只调用受保护的 preload API，模型和真实数据工具继续留在主进程执行。
      const result = await window.api.agent.ask(normalizedQuestion);
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
              disabled={messages.length === 0 || asking}
              onClick={() => setMessages([])}
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
                      {message.content}
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
                disabled={asking}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              <Button
                className="agent-assistant-send"
                type="primary"
                htmlType="button"
                icon={<SendOutlined />}
                loading={asking}
                disabled={!question.trim()}
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
