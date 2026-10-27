import EmptyLogo from "@renderer/assets/swifood_logo_unavailable.png";
import { useTranslation } from "react-i18next";

const EmptyHolder = () => {
  const { t } = useTranslation();

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
      <img src={EmptyLogo} alt="" className="w-24" />
      <span className="text-info text-[16px]">{t("components.no_content")}</span>
    </div>
  );
};

export default EmptyHolder;
