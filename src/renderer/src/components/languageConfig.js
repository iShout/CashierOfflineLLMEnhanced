import cnFlag from "@renderer/assets/language-flags/CN.png";
import enFlag from "@renderer/assets/language-flags/EN.png";
import kmFlag from "@renderer/assets/language-flags/KM.png";
import thFlag from "@renderer/assets/language-flags/TH.png";

export const LANGUAGE_ITEMS = [
  {
    label: "English",
    value: "en",
    icon: enFlag,
  },
  {
    label: "中文",
    value: "zh",
    icon: cnFlag,
  },
  {
    label: "ភាសាខ្មែរ",
    value: "km",
    icon: kmFlag,
  },
  {
    label: "ภาษาไทย",
    value: "th",
    icon: thFlag,
  },
];

export const normalizeLanguage = (locale) => {
  if (locale === "zh-CN") {
    return "zh";
  }

  return LANGUAGE_ITEMS.some((language) => language.value === locale) ? locale : "en";
};
