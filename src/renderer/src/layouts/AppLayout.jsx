import { Button, Form, InputNumber, message, Modal } from "antd";
import Big from "big.js";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import AgentAssistant from "@renderer/components/AgentAssistant";
import { useUncompleteOrderCountSubscription } from "@renderer/hooks/useUncompleteOrderCount";
import useStore, { selectUser } from "@renderer/store";

const toCents = (amount) => Number(new Big(amount || 0).times(100).round(0, 1).toString());

function AppLayout() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const [submittingOpeningFund, setSubmittingOpeningFund] = useState(false);
  const user = useStore(selectUser);
  const updateOpenFund = useStore((state) => state.updateOpenFund);
  const setUpdateOpenFund = useStore((state) => state.setUpdateOpenFund);
  const setBirInfo = useStore((state) => state.setBirInfo);

  const eodAutoGenerateKey = useStore((state) => state.eodAutoGenerateKey);
  const setEodAutoGenerateKey = useStore((state) => state.setEodAutoGenerateKey);
  useUncompleteOrderCountSubscription();

  useEffect(() => {
    let canceled = false;

    if (!user?.restaurant_id) {
      setBirInfo(null);
      return () => {
        canceled = true;
      };
    }

    // 按当前本地终端读取已有税务设置，供金额计算和报表使用。
    window.api.settings
      .getBirInfo()
      .then((birInfo) => {
        if (!canceled) {
          setBirInfo(birInfo);
        }
      })
      .catch((error) => {
        console.error("Failed to load BIR info:", error);
        if (!canceled) {
          setBirInfo(null);
        }
      });

    return () => {
      canceled = true;
    };
  }, [setBirInfo, user?.restaurant_id]);

  useEffect(() => {
    if (!user?.restaurant_id) {
      return;
    }

    const checkKey = String(user.restaurant_id);

    // 每次会话静默补齐历史日报，路由重挂载时不重复执行，也不展示日报提示。
    if (useStore.getState().eodAutoGenerateKey === checkKey) return;
    setEodAutoGenerateKey(checkKey);

    window.api.report.autoGenerateEodReports().catch((error) => {
      console.error("Failed to generate historical EOD reports:", error);
    });
  }, [eodAutoGenerateKey, setEodAutoGenerateKey, user?.restaurant_id]);

  const submitOpeningFund = async (openingFund) => {
    setSubmittingOpeningFund(true);

    try {
      // 登录上班卡已默认写入 0，这里补齐当前班次真实开业资金。
      await window.api.staff.updateOpeningFund({
        waiter_no: user?.waiter_no,
        opening_fund: toCents(openingFund),
      });
      setUpdateOpenFund(false);
      form.resetFields();
    } catch (error) {
      messageApi.open({
        type: "error",
        content: error?.message || String(error),
      });
    } finally {
      setSubmittingOpeningFund(false);
    }
  };

  const handleOpeningFundConfirm = async () => {
    const values = await form.validateFields();

    await submitOpeningFund(values.opening_fund);
  };

  const handleOpeningFundAutoCalculate = async () => {
    // 在线端自动开班资金按 0 提交，避免阻塞首次进入系统。
    form.setFieldsValue({ opening_fund: 0 });
    await submitOpeningFund(0);
  };

  return (
    <div className="app-shell">
      {contextHolder}

      <Modal
        centered
        width={420}
        open={Boolean(updateOpenFund && user?.waiter_no)}
        title={<span className="text-primary font-semibold">{t("report.opening_fund")}</span>}
        closable={false}
        mask={{ blur: true, closable: false }}
        footer={[
          <Button key="auto-calculate" disabled={submittingOpeningFund} onClick={handleOpeningFundAutoCalculate}>
            {t("report.auto_calculate")}
          </Button>,
          <Button key="submit" type="primary" loading={submittingOpeningFund} onClick={handleOpeningFundConfirm}>
            {t("components.confirm")}
          </Button>,
        ]}
      >
        <Form form={form} initialValues={{ opening_fund: 0 }}>
          <Form.Item name="opening_fund" rules={[{ required: true, message: t("tips.input_amount") }]}>
            <InputNumber min={0} precision={2} controls={false} className="w-full!" />
          </Form.Item>
        </Form>
      </Modal>
      <AgentAssistant />
      <Outlet />
    </div>
  );
}

export default AppLayout;
