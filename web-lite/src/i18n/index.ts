import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { isLiteLanguage, LITE_LANGUAGE_STORAGE_KEY, readInitialLanguage } from "./languages";
import { resources } from "./resources";

const initialLanguage = readInitialLanguage();

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    fallbackLng: "zh-CN",
    interpolation: {
      escapeValue: false
    },
    returnEmptyString: false
  });
}

document.documentElement.lang = initialLanguage;

i18n.on("languageChanged", (language) => {
  if (!isLiteLanguage(language)) {
    return;
  }
  document.documentElement.lang = language;
  try {
    window.localStorage.setItem(LITE_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore private-mode storage failures; the current language still applies.
  }
});

export default i18n;
