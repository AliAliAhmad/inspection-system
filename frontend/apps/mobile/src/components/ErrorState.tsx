import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  I18nManager,
} from 'react-native';
import { useTranslation } from 'react-i18next';

// Error types
export type ErrorType = 'network' | 'server' | 'notFound' | 'permission' | 'timeout' | 'unknown';

export interface ErrorStateProps {
  type?: ErrorType;
  title?: string;
  message?: string;
  onRetry?: () => void | Promise<void>;
  retryCountdown?: number; // seconds
  showReportIssue?: boolean;
  onReportIssue?: () => void;
  reportEmail?: string;
  compact?: boolean;
}

// Error configurations with icons and default messages
const ERROR_CONFIG: Record<
  ErrorType,
  { icon: string; titleKey: string; messageKey: string; color: string }
> = {
  network: {
    icon: '📶',
    titleKey: 'errors.network.title',
    messageKey: 'errors.network.message',
    color: '#f5222d',
  },
  server: {
    icon: '🖥️',
    titleKey: 'errors.server.title',
    messageKey: 'errors.server.message',
    color: '#fa541c',
  },
  notFound: {
    icon: '🔍',
    titleKey: 'errors.notFound.title',
    messageKey: 'errors.notFound.message',
    color: '#faad14',
  },
  permission: {
    icon: '🔒',
    titleKey: 'errors.permission.title',
    messageKey: 'errors.permission.message',
    color: '#722ed1',
  },
  timeout: {
    icon: '⏱️',
    titleKey: 'errors.timeout.title',
    messageKey: 'errors.timeout.message',
    color: '#13c2c2',
  },
  unknown: {
    icon: '⚠️',
    titleKey: 'errors.unknown.title',
    messageKey: 'errors.unknown.message',
    color: '#f5222d',
  },
};

// Default translations (fallback)
const DEFAULT_TRANSLATIONS: Record<string, { en: string; ar: string }> = {
  'errors.network.title': { en: 'No Connection', ar: 'لا يوجد اتصال' },
  'errors.network.message': {
    en: 'Please check your internet connection and try again.',
    ar: 'يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.',
  },
  'errors.server.title': { en: 'Server Error', ar: 'خطأ في الخادم' },
  'errors.server.message': {
    en: 'Something went wrong on our end. We are working to fix it.',
    ar: 'حدث خطأ من جانبنا. نحن نعمل على إصلاحه.',
  },
  'errors.notFound.title': { en: 'Not Found', ar: 'غير موجود' },
  'errors.notFound.message': {
    en: 'The content you are looking for could not be found.',
    ar: 'لم يتم العثور على المحتوى الذي تبحث عنه.',
  },
  'errors.permission.title': { en: 'Access Denied', ar: 'تم رفض الوصول' },
  'errors.permission.message': {
    en: 'You do not have permission to access this content.',
    ar: 'ليس لديك إذن للوصول إلى هذا المحتوى.',
  },
  'errors.timeout.title': { en: 'Request Timeout', ar: 'انتهت مهلة الطلب' },
  'errors.timeout.message': {
    en: 'The request took too long. Please try again.',
    ar: 'استغرق الطلب وقتاً طويلاً. يرجى المحاولة مرة أخرى.',
  },
  'errors.unknown.title': { en: 'Something Went Wrong', ar: 'حدث خطأ ما' },
  'errors.unknown.message': {
    en: 'An unexpected error occurred. Please try again.',
    ar: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
  },
  'errors.retry': { en: 'Retry', ar: 'إعادة المحاولة' },
  'errors.retryIn': { en: 'Retry in {{seconds}}s', ar: 'إعادة المحاولة خلال {{seconds}} ث' },
  'errors.reportIssue': { en: 'Report Issue', ar: 'الإبلاغ عن مشكلة' },
};

function getTranslation(key: string, lang: string): string {
  const translation = DEFAULT_TRANSLATIONS[key];
  if (!translation) return key;
  return lang === 'ar' ? translation.ar : translation.en;
}

export function ErrorState({
  type = 'unknown',
  title,
  message,
  onRetry,
  retryCountdown = 0,
  showReportIssue = true,
  onReportIssue,
  reportEmail = 'support@inspection-system.com',
  compact = false,
}: ErrorStateProps) {
  const { t, i18n } = useTranslation();
  const [countdown, setCountdown] = useState(retryCountdown);
  const [isRetrying, setIsRetrying] = useState(false);
  const isRTL = I18nManager.isRTL || i18n.language === 'ar';

  const config = ERROR_CONFIG[type];

  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [countdown]);

  const handleRetry = useCallback(async () => {
    if (countdown > 0 || isRetrying || !onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
      if (retryCountdown > 0) {
        setCountdown(retryCountdown);
      }
    }
  }, [countdown, isRetrying, onRetry, retryCountdown]);

  const handleReportIssue = useCallback(() => {
    if (onReportIssue) {
      onReportIssue();
    } else {
      const subject = encodeURIComponent(`Issue Report: ${type} error`);
      const body = encodeURIComponent(
        `Error Type: ${type}\nTimestamp: ${new Date().toISOString()}\n\nPlease describe the issue:\n`
      );
      Linking.openURL(`mailto:${reportEmail}?subject=${subject}&body=${body}`);
    }
  }, [onReportIssue, reportEmail, type]);

  const displayTitle =
    title ||
    t(config.titleKey, getTranslation(config.titleKey, i18n.language));
  const displayMessage =
    message ||
    t(config.messageKey, getTranslation(config.messageKey, i18n.language));

  if (compact) {
    return (
      <View style={[styles.compactContainer, { borderLeftColor: config.color }]}>
        <Text style={styles.compactIcon}>{config.icon}</Text>
        <View style={styles.compactContent}>
          <Text style={[styles.compactTitle, isRTL && styles.rtlText]}>{displayTitle}</Text>
          <Text style={[styles.compactMessage, isRTL && styles.rtlText]}>{displayMessage}</Text>
        </View>
        {onRetry && (
          <TouchableOpacity
            style={[styles.compactRetryBtn, countdown > 0 && styles.disabledBtn]}
            onPress={handleRetry}
            disabled={countdown > 0 || isRetrying}
          >
            <Text style={styles.compactRetryText}>
              {countdown > 0
                ? countdown
                : isRetrying
                ? '...'
                : t('errors.retry', getTranslation('errors.retry', i18n.language))}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: `${config.color}15` }]}>
        <Text style={styles.icon}>{config.icon}</Text>
      </View>
      <Text style={[styles.title, isRTL && styles.rtlText]}>{displayTitle}</Text>
      <Text style={[styles.message, isRTL && styles.rtlText]}>{displayMessage}</Text>

      {onRetry && (
        <TouchableOpacity
          style={[
            styles.retryButton,
            { backgroundColor: config.color },
            (countdown > 0 || isRetrying) && styles.disabledBtn,
          ]}
          onPress={handleRetry}
          disabled={countdown > 0 || isRetrying}
        >
          <Text style={styles.retryButtonText}>
            {countdown > 0
              ? t('errors.retryIn', getTranslation('errors.retryIn', i18n.language)).replace(
                  '{{seconds}}',
                  String(countdown)
                )
              : isRetrying
              ? '...'
              : t('errors.retry', getTranslation('errors.retry', i18n.language))}
          </Text>
        </TouchableOpacity>
      )}

      {showReportIssue && (
        <TouchableOpacity style={styles.reportButton} onPress={handleReportIssue}>
          <Text style={[styles.reportButtonText, isRTL && styles.rtlText]}>
            {t('errors.reportIssue', getTranslation('errors.reportIssue', i18n.language))}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f5f5f5',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  retryButton: {
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 8,
    minWidth: 160,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  reportButton: {
    marginTop: 20,
    padding: 12,
  },
  reportButtonText: {
    color: '#666',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderLeftWidth: 4,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
    elevation: 2,
  },
  compactIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  compactContent: {
    flex: 1,
  },
  compactTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  compactMessage: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  compactRetryBtn: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 12,
  },
  compactRetryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});

export default ErrorState;
