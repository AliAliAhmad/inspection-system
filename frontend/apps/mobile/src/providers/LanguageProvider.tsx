import React, { createContext, useContext, useEffect, useCallback, useState, useMemo } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Language, resources } from '@inspection/shared';

const LANG_KEY = 'app_language';

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

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
          const rtl = saved === 'ar';
          if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLang(lang);
    i18n.changeLanguage(lang);
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
