import Header from "@renderer/components/Header";
import { SettingFilled } from "@ant-design/icons";
import SystemStatus from "./SystemStatus";
import MallCetification from "./MallCetification";

import { useState } from "react";
import { useTranslation } from "react-i18next";

const SETTINGS_SECTION = {
  SYSTEM: "system",
  MALL_CERTIFICATION: "mall-certification",
};

function Settings() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState(SETTINGS_SECTION.SYSTEM);

  const sectionList = [
    {
      key: SETTINGS_SECTION.SYSTEM,
      label: t("setting.system_settings"),
    },
    {
      key: SETTINGS_SECTION.MALL_CERTIFICATION,
      label: t("setting.mall_certification"),
    },
  ];

  return (
    <div>
      <Header currentTitle={t("menu.setting")} />
      <div className="flex h-[calc(100vh-64px)]">
        <div className="w-[320px] border-r border-line">
          {sectionList.map((item) => (
            <div
              key={item.key}
              style={activeSection === item.key ? { color: "#003498" } : {}}
              className="w-full px-6 py-4 border-b border-line text-[16px] text-[#18181880] hover:text-primary cursor-pointer"
              onClick={() => setActiveSection(item.key)}
            >
              <SettingFilled className="mr-2" />
              {item.label}
            </div>
          ))}
        </div>

        {/* 右侧内容超过窗口可用高度时允许纵向滚动，避免设置项被裁切。 */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
          {activeSection === SETTINGS_SECTION.SYSTEM && <SystemStatus />}
          {activeSection === SETTINGS_SECTION.MALL_CERTIFICATION && <MallCetification />}
        </div>
      </div>
    </div>
  );
}

export default Settings;
