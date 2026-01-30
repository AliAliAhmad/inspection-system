import { useState, useCallback } from 'react';
import { setLanguage as setApiLanguage } from '../api/client';
/**
 * Shared language state hook.
 * Platform-specific providers handle RTL switching.
 */
export function useLanguageState(initialLang = 'en') {
    const [language, setLang] = useState(initialLang);
    const setLanguage = useCallback((lang) => {
        setLang(lang);
        setApiLanguage(lang);
    }, []);
    const isRTL = language === 'ar';
    return { language, setLanguage, isRTL };
}
//# sourceMappingURL=useLanguage.js.map