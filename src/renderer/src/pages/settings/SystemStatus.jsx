import { message } from "antd";
import { useTranslation } from "react-i18next";
import useStore from "@renderer/store";
import LanguageSelect from "@renderer/components/LanguageSelect";
import { normalizeLanguage } from "@renderer/components/languageConfig";

// 系统设置仅展示本机配置，语言切换和本地商场认证继续保留。
const SystemStatus = () => {
  const { t, i18n } = useTranslation();
  const locale = useStore((state) => state.locale);
  const setLocale = useStore((state) => state.setLocale);
  const restaurantSetting = useStore((state) => state.restaurantSetting);
  const birInfo = useStore((state) => state.bir_info);
  const swifoodVersion = useStore((state) => state.swifood_version);
  const currentLanguage = normalizeLanguage(locale);
  const handleLanguageChange = async (nextLanguage) => {
    setLocale(nextLanguage);
    await i18n.changeLanguage(nextLanguage);
    message.success(i18n.t("tips.switch_language"));
  };

  return (
    <div className="p-8 w-full">
      {/* 系统信息 */}
      <div className="w-full">
        <div className="border-b border-line">
          <p className="text-[20px] mb-2! font-semibold text-normal">{t("system.system_info")}</p>
        </div>
        {/* 统一系统信息行高和间距，避免语言选择器撑高后与其他字段错位。 */}
        <div className="py-4 w-full text-[13px] space-y-2">
          {/* 语言设置 */}
          <div className="flex h-8 items-center">
            <span className="flex-1 font-semibold text-normal">{t("setting.select_print_language")}</span>
            <LanguageSelect
              value={currentLanguage}
              style={{ width: 172 }}
              className="float-right"
              onChange={handleLanguageChange}
            />
          </div>
          {/* 当前版本 */}
          <div className="flex h-8 items-center">
            <span className="flex-1 font-semibold text-normal">{t("system.current_version")}</span>
            <span className="text-normal font-medium text-[#afafaf]!">{swifoodVersion}</span>
          </div>
          {/* 商户名称 */}
          <div className="flex h-8 items-center">
            <span className="flex-1 font-semibold text-normal">{t("setting.merchant_name")}</span>
            <span className="text-normal font-medium text-[#afafaf]!">{restaurantSetting.name}</span>
          </div>
          {/* 序列号 */}
          <div className="flex h-8 items-center">
            <span className="flex-1 font-semibold text-normal">{t("system.serial_number")}</span>
            <span className="text-normal font-medium text-[#afafaf]!">{(birInfo && birInfo.serial_number) || "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
export default SystemStatus;
