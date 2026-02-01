import { useState, useCallback, useEffect } from 'react';
import { setLanguage as setApiLanguage } from '../api/client';

export type Language = 'en' | 'ar';

const LANG_STORAGE_KEY = 'app_language';

function getSavedLanguage(fallback: Language): Language {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    // localStorage not available (SSR, etc.)
  }
  return fallback;
}

/**
 * Shared language state hook.
 * Persists language choice to localStorage.
 * Platform-specific providers handle RTL switching.
 */
export function useLanguageState(initialLang: Language = 'en') {
  const [language, setLang] = useState<Language>(() => getSavedLanguage(initialLang));

  // Set API language header on initial load
  useEffect(() => {
    setApiLanguage(language);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLang(lang);
    setApiLanguage(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, []);

  const isRTL = language === 'ar';

  return { language, setLanguage, isRTL };
}
