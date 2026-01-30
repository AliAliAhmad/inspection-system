import React, { createContext, useContext, useEffect } from 'react';
import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import arEG from 'antd/locale/ar_EG';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useLanguageState, Language, resources } from '@inspection/shared';

// Initialize i18next
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
  const { language, setLanguage, isRTL } = useLanguageState('en');

  useEffect(() => {
    // Update document direction
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    // Update i18next language
    i18n.changeLanguage(language);
  }, [language, isRTL]);

  const antLocale = language === 'ar' ? arEG : enUS;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isRTL }}>
      <ConfigProvider
        locale={antLocale}
        direction={isRTL ? 'rtl' : 'ltr'}
        theme={{
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
          },
        }}
      >
        {children}
      </ConfigProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
