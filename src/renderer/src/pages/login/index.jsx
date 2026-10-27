import { Button, Input, Form, Checkbox, message } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import swifoodLogo from "@assets/login-logo.png";
import useStore from "@renderer/store";
import { RESPONSE_CODE } from "@shared/constants/enums";
import LanguageSelect from "@renderer/components/LanguageSelect";
import { normalizeLanguage } from "@renderer/components/languageConfig";
import useLoginClockInFlow from "@renderer/hooks/useLoginClockInFlow";

const Login = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [loginForm] = Form.useForm();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const versionTapRef = useRef({ count: 0, timer: null });
  const { cameraCaptureHolder, completeLoginClockInIfNeeded } = useLoginClockInFlow();
  const locale = useStore((state) => state.locale);
  const setLocale = useStore((state) => state.setLocale);
  const currentLanguage = normalizeLanguage(locale);

  useEffect(() => {
    window.api.login
      .getSavedCredential()
      .then((res) => {
        const credential = res?.data;
        if (!credential?.account) return;
        loginForm.setFieldsValue({
          account: credential.account,
          password: credential.rememberPassword ? credential.password : "",
          remember: credential.rememberPassword,
        });
      })
      .catch((error) => console.error("Failed to restore saved credential:", error));
  }, [loginForm]);

  useEffect(() => {
    const tapState = versionTapRef.current;
    return () => clearTimeout(tapState.timer);
  }, []);

  // 登录仅建立账号与餐厅会话，离线项目不再恢复或绑定 POS 终端。
  const finishLogin = async (session) => {
    await window.api.auth.setSession({ token: session.token, user: session.waiter });
    await completeLoginClockInIfNeeded({ waiter: session.waiter, restaurantSetting: session.restaurantSetting });
    const state = useStore.getState();
    state.setAuthList((session.waiter.role_info?.permission_list ?? []).map((item) => item.code).filter(Boolean));
    state.applyLoginSession({
      token: session.token,
      account: session.account,
      user: session.waiter,
      restaurantSetting: session.restaurantSetting,
    });
    navigate("/entry");
  };

  // 密码和餐厅设置全部读取本地数据，验证成功后直接进入系统。
  const handleLogin = async ({ account, password, remember }) => {
    setIsLoggingIn(true);
    try {
      const res = await window.api.login.validate(account, password);
      if (res.code !== RESPONSE_CODE.SUCCESS) {
        messageApi.error(res.message);
        return;
      }
      const { token, waiter } = res.data;
      const restaurantSetting = await window.api.settings.getRestaurantSettingsById(waiter.restaurant_id);
      if (!restaurantSetting)
        throw new Error("Local restaurant configuration is missing. Please prepare the local database.");
      try {
        await window.api.login.saveCredential({ account, password, rememberPassword: Boolean(remember) });
      } catch (error) {
        console.error("Failed to save login credential:", error);
      }
      const session = { token, waiter, restaurantSetting, account };
      const state = useStore.getState();
      state.setLoginFlowPending(true);
      state.setToken(token);
      await window.api.auth.setSession({ token, user: waiter });
      await finishLogin(session);
    } catch (error) {
      useStore.getState().logout();
      await window.api.auth.clearSession();
      messageApi.error(error?.message || String(error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLanguageChange = async (nextLanguage) => {
    // 登录页语言切换与设置页保持一致：更新 zustand 和 i18next。
    setLocale(nextLanguage);
    await i18n.changeLanguage(nextLanguage);
    messageApi.success(i18n.t("tips.switch_language"));
  };

  const handleVersionTap = () => {
    if (versionTapRef.current.timer) {
      clearTimeout(versionTapRef.current.timer);
    }

    versionTapRef.current.count += 1;
    versionTapRef.current.timer = setTimeout(() => {
      versionTapRef.current.count = 0;
      versionTapRef.current.timer = null;
    }, 1500);

    // 开发者日志入口：登录页版本号连续点击 8 次后打开隐藏页面。
    if (versionTapRef.current.count >= 8) {
      versionTapRef.current.count = 0;
      versionTapRef.current.timer = null;
      navigate("/developer-logs");
    }
  };

  return (
    <>
      {contextHolder}
      {cameraCaptureHolder}
      <div className="flex h-screen bg-white">
        <div className="flex-1 h-full flex items-center justify-center bg-primary">
          <img style={{ width: "320px" }} src={swifoodLogo} alt="Swifood Logo" />
        </div>
        <div className="pb-4 pt-12 flex-1 h-full flex flex-col items-center">
          <div className="w-full px-16">
            <LanguageSelect
              value={currentLanguage}
              style={{ width: 180 }}
              className="float-right"
              onChange={handleLanguageChange}
            />
          </div>
          <div className="flex-1 w-full flex flex-col items-center justify-center">
            <div className="inline-flex items-center justify-center gap-2">
              <span className="text-primary text-[22px] font-semibold leading-none">
                {t("components.sign_in_account")}
              </span>
            </div>
            <Form form={loginForm} name="login" layout="vertical" className="w-[400px]" onFinish={handleLogin}>
              {/* 账号 */}
              <Form.Item
                label={<span className="text-[16px] text-[#4b5567] font-semibold">{t("components.email")}</span>}
                name="account"
                rules={[{ required: true, message: t("system.account_required") }]}
              >
                <Input size="large" />
              </Form.Item>
              {/* 密码 */}
              <Form.Item
                label={<span className="text-[16px] text-[#4b5567] font-semibold">{t("components.password")}</span>}
                name="password"
                rules={[{ required: true, message: t("system.password_required") }]}
              >
                <Input.Password size="large" />
              </Form.Item>
              {/* 记住我 */}
              <Form.Item name="remember" valuePropName="checked" label={null}>
                <Checkbox>
                  <span className="font-semibold">{t("components.remember_password")}</span>
                </Checkbox>
              </Form.Item>
              {/* 登录按钮 */}
              <Form.Item label={null}>
                <Button
                  htmlType="submit"
                  color="danger"
                  variant="solid"
                  size="large"
                  className="w-full"
                  style={{ borderRadius: "32px" }}
                  loading={isLoggingIn}
                  disabled={isLoggingIn}
                >
                  {t("components.login")}
                </Button>
              </Form.Item>
            </Form>
          </div>
          <span className="cursor-default text-info text-[13px]" onClick={handleVersionTap}>
            {t("system.restaurant_version", { version: "1.0.4" })}
          </span>
        </div>
      </div>
    </>
  );
};

export default Login;
