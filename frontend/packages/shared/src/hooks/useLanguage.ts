import { useState, useCallback } from 'react';
import { setLanguage as setApiLanguage } from '../api/client';

export type Language = 'en' | 'ar';

/**
 * Shared language state hook.
 * Platform-specific providers handle RTL switching.
 */
export function useLanguageState(initialLang: Language = 'en') {
  const [language, setLang] = useState<Language>(initialLang);

  const setLanguage = useCallback((lang: Language) => {
    setLang(lang);
    setApiLanguage(lang);
  }, []);

  const isRTL = language === 'ar';

  return { language, setLanguage, isRTL };
}
