import React, { createContext, useContext, useEffect, useCallback, useState, useMemo } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Language, resources, setLanguage as setApiLanguage } from '@inspection/shared';
import arMobile from '../i18n/ar.mobile.json';
import enMobile from '../i18n/en.mobile.json';

const LANG_KEY = 'app_language';

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Strings that belong to the MOBILE app only.
//
// `resources` comes from @inspection/shared and is loaded by the WEB app too, so
// anything added there changes the web — in Arabic AND in English, because an
// en.json entry overrides a screen's inline English fallback. Ali wants the web
// left exactly as it is, so these live here instead and the web never sees them.
//
// The 4th argument (deep) MUST stay true: with deep = false the overlay's
// `jobs: {...}` REPLACES the shared `jobs` section wholesale and silently drops
// every shared key in it. The 5th (overwrite) is true so a mobile-specific
// wording wins over a shared one for the same key.
i18n.addResourceBundle('en', 'translation', enMobile, true, true);
i18n.addResourceBundle('ar', 'translation', arMobile, true, true);

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<Language>('en');

  // Restore saved language from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((saved) => {
        if (saved === 'en' || saved === 'ar') {
          setLang(saved as Language);
          i18n.changeLanguage(saved);
          // Without this the backend never learns the user reads Arabic and
          // serves English on every screen, not just this one.
          setApiLanguage(saved as Language);
          const rtl = saved === 'ar';
          if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLang(lang);
    i18n.changeLanguage(lang);
    setApiLanguage(lang);
    const rtl = lang === 'ar';
    if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
    AsyncStorage.setItem(LANG_KEY, lang).catch(() => {});
  }, []);

  const isRTL = language === 'ar';

  const value = useMemo(
    () => ({ language, setLanguage, isRTL }),
    [language, setLanguage, isRTL]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
