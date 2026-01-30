export type Language = 'en' | 'ar';
/**
 * Shared language state hook.
 * Platform-specific providers handle RTL switching.
 */
export declare function useLanguageState(initialLang?: Language): {
    language: Language;
    setLanguage: (lang: Language) => void;
    isRTL: boolean;
};
//# sourceMappingURL=useLanguage.d.ts.map