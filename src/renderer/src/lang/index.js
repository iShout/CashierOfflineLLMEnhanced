import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zh from "./zh";
import th from "./th";
import km from "./km";
import en from "./en";

i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    zh: {
      translation: zh,
    },
    th: {
      translation: th,
    },
    km: {
      translation: km,
    },
    en: {
      translation: en,
    },
  },
});

export default i18n;
