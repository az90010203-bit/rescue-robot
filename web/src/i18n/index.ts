import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultLanguage, getInitialLanguage, supportedLanguages } from "./languages";
import { resources } from "./resources";

void i18n.use(initReactI18next).init({
  fallbackLng: defaultLanguage,
  interpolation: {
    escapeValue: false
  },
  lng: getInitialLanguage(),
  resources,
  supportedLngs: supportedLanguages.map((language) => language.code)
});

export default i18n;
