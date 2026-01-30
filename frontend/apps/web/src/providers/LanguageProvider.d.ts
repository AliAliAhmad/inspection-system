import React from 'react';
import { Language } from '@inspection/shared';
interface LanguageContextValue {
    language: Language;
    setLanguage: (lang: Language) => void;
    isRTL: boolean;
}
export declare function LanguageProvider({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useLanguage(): LanguageContextValue;
export {};
//# sourceMappingURL=LanguageProvider.d.ts.map