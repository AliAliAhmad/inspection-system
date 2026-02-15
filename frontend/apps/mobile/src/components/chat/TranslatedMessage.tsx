import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { voiceApi } from '@inspection/shared';

interface TranslatedMessageProps {
  /** Original message content */
  content: string;
  /** Original language of the message */
  originalLanguage?: string | null;
  /** Pre-translated content (from backend) */
  translatedContent?: string | null;
  /** Whether this message is from the current user */
  isMe: boolean;
  /** Current UI language (user preference) */
  userLanguage: string;
  /** Auto-translate enabled */
  autoTranslate?: boolean;
}

/**
 * Message component with automatic Arabic/English translation
 * Shows original + translated text with toggle
 */
export function TranslatedMessage({
  content,
  originalLanguage,
  translatedContent: preTranslated,
  isMe,
  userLanguage,
  autoTranslate = true,
}: TranslatedMessageProps) {
  const [showTranslation, setShowTranslation] = useState(autoTranslate);
  const [translatedText, setTranslatedText] = useState<string | null>(preTranslated || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const isAr = userLanguage === 'ar';
  const messageIsArabic = originalLanguage === 'ar' || /[\u0600-\u06FF]/.test(content);
  const needsTranslation = (isAr && !messageIsArabic) || (!isAr && messageIsArabic);

  // Auto-translate on mount if needed and not already translated
  useEffect(() => {
    if (autoTranslate && needsTranslation && !translatedText && !isLoading && !error) {
      handleTranslate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslate, needsTranslation]);

  const handleTranslate = useCallback(async () => {
    if (translatedText || isLoading) return;

    try {
      setIsLoading(true);
      setError(false);
      const result = await voiceApi.translate(content);

      // Get the translation in the user's language
      const translated = isAr ? result.ar : result.en;
      setTranslatedText(translated || null);
    } catch (err) {
      console.error('Translation failed:', err);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [content, isAr, translatedText, isLoading]);

  const toggleTranslation = useCallback(() => {
    if (!translatedText && !isLoading) {
      handleTranslate();
    }
    setShowTranslation(!showTranslation);
  }, [showTranslation, translatedText, isLoading, handleTranslate]);

  // Determine text direction based on content
  const originalIsRTL = messageIsArabic;
  const translatedIsRTL = isAr;

  return (
    <View style={styles.container}>
      {/* Original message */}
      <Text
        style={[
          styles.originalText,
          isMe && styles.textMe,
          originalIsRTL && styles.rtlText,
        ]}
      >
        {content}
      </Text>

      {/* Translation section (only show if different language) */}
      {needsTranslation && (
        <>
          {/* Toggle button */}
          <TouchableOpacity
            style={styles.translateToggle}
            onPress={toggleTranslation}
            disabled={isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={isMe ? 'rgba(255,255,255,0.7)' : '#1677ff'} />
                <Text style={[styles.toggleText, isMe && styles.toggleTextMe]}>
                  {isAr ? 'جاري الترجمة...' : 'Translating...'}
                </Text>
              </View>
            ) : (
              <Text style={[styles.toggleText, isMe && styles.toggleTextMe]}>
                {showTranslation && translatedText
                  ? (isAr ? 'اخفاء الترجمة ▲' : 'Hide translation ▲')
                  : (isAr ? 'ترجمة ▼' : 'Translate ▼')}
              </Text>
            )}
          </TouchableOpacity>

          {/* Translated text */}
          {showTranslation && translatedText && (
            <View style={[styles.translationBox, isMe && styles.translationBoxMe]}>
              <View style={styles.translationHeader}>
                <Text style={[styles.translationLabel, isMe && styles.translationLabelMe]}>
                  {messageIsArabic
                    ? (isAr ? '🌐 الإنجليزية' : '🌐 English')
                    : (isAr ? '🌐 العربية' : '🌐 Arabic')}
                </Text>
              </View>
              <Text
                style={[
                  styles.translatedText,
                  isMe && styles.translatedTextMe,
                  translatedIsRTL && styles.rtlText,
                ]}
              >
                {translatedText}
              </Text>
            </View>
          )}

          {/* Error state */}
          {error && !translatedText && (
            <TouchableOpacity onPress={handleTranslate} style={styles.errorBox}>
              <Text style={[styles.errorText, isMe && styles.errorTextMe]}>
                {isAr ? '❌ فشلت الترجمة. اضغط للمحاولة مرة أخرى' : '❌ Translation failed. Tap to retry'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Container styling
  },
  originalText: {
    fontSize: 15,
    color: '#262626',
    lineHeight: 20,
  },
  textMe: {
    color: '#fff',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  translateToggle: {
    marginTop: 6,
    paddingVertical: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleText: {
    fontSize: 11,
    color: '#1677ff',
    fontWeight: '500',
  },
  toggleTextMe: {
    color: 'rgba(255,255,255,0.75)',
  },
  translationBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(22, 119, 255, 0.08)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#52c41a',
  },
  translationBoxMe: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderLeftColor: 'rgba(255,255,255,0.5)',
  },
  translationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  translationLabel: {
    fontSize: 10,
    color: '#52c41a',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  translationLabelMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  translatedText: {
    fontSize: 14,
    color: '#262626',
    lineHeight: 18,
  },
  translatedTextMe: {
    color: 'rgba(255,255,255,0.9)',
  },
  errorBox: {
    marginTop: 6,
    padding: 6,
    backgroundColor: 'rgba(255, 77, 79, 0.1)',
    borderRadius: 6,
  },
  errorText: {
    fontSize: 11,
    color: '#ff4d4f',
  },
  errorTextMe: {
    color: 'rgba(255,255,255,0.8)',
  },
});

export default TranslatedMessage;
