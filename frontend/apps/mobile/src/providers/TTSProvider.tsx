import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';
import * as Speech from 'expo-speech';
import { useLanguage } from './LanguageProvider';

interface TTSContextValue {
  speak: (text: string) => void;
  stop: () => void;
  setReadable: (text: string) => void;
  isSpeaking: boolean;
  readable: string;
}

const TTSContext = createContext<TTSContextValue | null>(null);

export function TTSProvider({ children }: { children: React.ReactNode }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [readable, setReadable] = useState('');
  const { language } = useLanguage();

  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(text, {
      language: language === 'ar' ? 'ar-SA' : 'en-US',
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
    });
  }, [language]);

  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  const value = useMemo(
    () => ({ speak, stop, setReadable, isSpeaking, readable }),
    [speak, stop, isSpeaking, readable]
  );

  return (
    <TTSContext.Provider value={value}>
      {children}
    </TTSContext.Provider>
  );
}

export function useTTS() {
  const ctx = useContext(TTSContext);
  if (!ctx) throw new Error('useTTS must be used within TTSProvider');
  return ctx;
}
