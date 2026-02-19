import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  FadeIn,
  FadeOut,
  SlideInDown,
} from 'react-native-reanimated';

import type { AIPhotoAnalysisResult } from '../../hooks/useAIPhotoAnalysis';

export interface AISuggestionBadgeProps {
  /** Whether AI is currently analyzing */
  isAnalyzing: boolean;
  /** Analysis result from AI */
  result: AIPhotoAnalysisResult | null;
  /** Error message if analysis failed */
  error?: string | null;
  /** Callback when inspector accepts the suggestion */
  onAccept?: (suggestion: 'pass' | 'fail') => void;
  /** Callback when inspector ignores/dismisses the suggestion */
  onIgnore?: () => void;
  /** Whether the badge is disabled (e.g., answer already submitted) */
  disabled?: boolean;
  /** Compact mode - smaller badge for inline display */
  compact?: boolean;
}

/**
 * AISuggestionBadge - Displays AI pass/fail suggestion after photo analysis
 *
 * Features:
 * - Shows loading spinner while AI analyzes
 * - Displays suggestion with confidence percentage
 * - Green for pass, red for fail
 * - Inspector can tap to accept or ignore
 * - Bilingual support (EN/AR)
 * - Animated appearance
 */
export function AISuggestionBadge({
  isAnalyzing,
  result,
  error,
  onAccept,
  onIgnore,
  disabled = false,
  compact = false,
}: AISuggestionBadgeProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const [dismissed, setDismissed] = useState(false);

  // Animation values
  const scale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  // Reset dismissed state when result changes
  useEffect(() => {
    if (result) {
      setDismissed(false);
      // Animate entrance
      scale.value = withSequence(
        withTiming(0.8, { duration: 0 }),
        withSpring(1, { damping: 12, stiffness: 200 })
      );
    }
  }, [result]);

  // Pulse animation for analyzing state
  useEffect(() => {
    if (isAnalyzing) {
      const animate = () => {
        pulseOpacity.value = withSequence(
          withTiming(0.5, { duration: 800 }),
          withTiming(1, { duration: 800 })
        );
      };
      animate();
      const interval = setInterval(animate, 1600);
      return () => clearInterval(interval);
    }
  }, [isAnalyzing]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Handle accept
  const handleAccept = useCallback(() => {
    if (disabled || !result) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSequence(
      withTiming(0.95, { duration: 50 }),
      withSpring(1)
    );
    onAccept?.(result.suggestion);
  }, [disabled, result, onAccept, scale]);

  // Handle ignore/dismiss
  const handleIgnore = useCallback(() => {
    if (disabled) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissed(true);
    onIgnore?.();
  }, [disabled, onIgnore]);

  // Don't render if dismissed
  if (dismissed) {
    return null;
  }

  // Loading state
  if (isAnalyzing) {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.container, compact && styles.containerCompact, styles.loadingContainer]}
      >
        <Animated.View style={[styles.loadingContent, pulseAnimatedStyle]}>
          <ActivityIndicator size="small" color="#1976D2" />
          <Text style={styles.loadingText}>
            {t('aiSuggestion.analyzing', 'AI is analyzing...')}
          </Text>
        </Animated.View>
      </Animated.View>
    );
  }

  // Error state
  if (error) {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[styles.container, compact && styles.containerCompact, styles.errorContainer]}
      >
        <Text style={styles.errorText}>
          {t('aiSuggestion.error', 'AI analysis unavailable')}
        </Text>
        <TouchableOpacity onPress={handleIgnore} style={styles.dismissButton}>
          <Text style={styles.dismissButtonText}>x</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // No result yet
  if (!result) {
    return null;
  }

  const isPass = result.suggestion === 'pass';
  const confidencePercent = Math.round(result.confidence * 100);
  const reason = isArabic && result.reason_ar ? result.reason_ar : result.reason;

  return (
    <Animated.View
      entering={SlideInDown.duration(300).springify()}
      exiting={FadeOut.duration(150)}
      style={[
        styles.container,
        compact && styles.containerCompact,
        isPass ? styles.passContainer : styles.failContainer,
        animatedStyle,
      ]}
    >
      <View style={styles.mainContent}>
        {/* AI Badge Icon */}
        <View style={[styles.aiIcon, isPass ? styles.aiIconPass : styles.aiIconFail]}>
          <Text style={styles.aiIconText}>AI</Text>
        </View>

        {/* Suggestion Content */}
        <View style={styles.suggestionContent}>
          {/* Header with suggestion */}
          <View style={styles.headerRow}>
            <Text style={[styles.suggestionLabel, isPass ? styles.textPass : styles.textFail]}>
              {t('aiSuggestion.suggests', 'AI Suggests')}:
            </Text>
            <View style={[styles.suggestionBadge, isPass ? styles.badgePass : styles.badgeFail]}>
              <Text style={styles.suggestionBadgeText}>
                {isPass
                  ? t('common.pass', 'PASS').toUpperCase()
                  : t('common.fail', 'FAIL').toUpperCase()}
              </Text>
              <Text style={styles.confidenceText}>
                ({confidencePercent}%)
              </Text>
            </View>
          </View>

          {/* Reason */}
          {reason && !compact && (
            <Text
              style={[
                styles.reasonText,
                isPass ? styles.reasonTextPass : styles.reasonTextFail,
                isArabic && styles.reasonTextArabic,
              ]}
              numberOfLines={2}
            >
              {reason}
            </Text>
          )}
        </View>

        {/* Dismiss button */}
        <TouchableOpacity
          onPress={handleIgnore}
          style={styles.dismissButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.dismissButtonText, isPass ? styles.textPass : styles.textFail]}>
            x
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action buttons */}
      {!compact && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton, isPass ? styles.acceptButtonPass : styles.acceptButtonFail]}
            onPress={handleAccept}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={styles.acceptButtonText}>
              {t('aiSuggestion.accept', 'Accept')} {isPass ? 'PASS' : 'FAIL'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.ignoreButton]}
            onPress={handleIgnore}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={styles.ignoreButtonText}>
              {t('aiSuggestion.ignore', 'Ignore')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  containerCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginVertical: 4,
  },
  loadingContainer: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
  },
  loadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#1565C0',
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFCC80',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: 12,
    color: '#E65100',
    flex: 1,
  },
  passContainer: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  failContainer: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
  },
  mainContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  aiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiIconPass: {
    backgroundColor: '#4CAF50',
  },
  aiIconFail: {
    backgroundColor: '#F44336',
  },
  aiIconText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  suggestionContent: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  textPass: {
    color: '#2E7D32',
  },
  textFail: {
    color: '#C62828',
  },
  suggestionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  badgePass: {
    backgroundColor: '#4CAF50',
  },
  badgeFail: {
    backgroundColor: '#F44336',
  },
  suggestionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  reasonText: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  reasonTextPass: {
    color: '#388E3C',
  },
  reasonTextFail: {
    color: '#D32F2F',
  },
  reasonTextArabic: {
    textAlign: 'right',
  },
  dismissButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {},
  acceptButtonPass: {
    backgroundColor: '#4CAF50',
  },
  acceptButtonFail: {
    backgroundColor: '#F44336',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  ignoreButton: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  ignoreButtonText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default AISuggestionBadge;
