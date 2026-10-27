import { App as AntdApp, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import kmKH from "antd/locale/km_KH";
import thTH from "antd/locale/th_TH";
import zhCN from "antd/locale/zh_CN";
import useStore from "../store";

const antdLocaleMap = {
  en: enUS,
  zh: zhCN,
  "zh-CN": zhCN,
  km: kmKH,
  th: thTH,
};

// eslint-disable-next-line react/prop-types
function AntdProvider({ children }) {
  const locale = useStore((state) => state.locale);

  return (
    <ConfigProvider
      locale={antdLocaleMap[locale] || enUS}
      theme={{
        token: {
          colorPrimary: "#003498",
        },
        components: {
          Button: {
            defaultShadow: "none",
            primaryShadow: "none",
            dangerShadow: "none",
          },
          Descriptions: {
            labelColor: "#181818",
            contentColor: "#5D5D5D",
            itemPaddingBottom: 8,
          },
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}

export default AntdProvider;
