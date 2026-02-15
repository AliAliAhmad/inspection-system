/**
 * PreviousAnswersPanel Component
 * Shows previous inspection answers alongside current question
 * Allows copying individual or all answers from previous inspection
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

/** Minimal types inline to avoid import issues */
interface PreviousAnswer {
  checklist_item_id: number;
  answer_value: string;
  comment?: string | null;
  photo_url?: string | null;
  photo_ai_analysis?: { en: string; ar: string } | null;
  answered_at: string;
}

interface PreviousInspectionData {
  id: number;
  inspection_code?: string | null;
  technician_name: string;
  submitted_at?: string | null;
  answers: PreviousAnswer[];
}

export interface PreviousAnswersPanelProps {
  /** Equipment ID to fetch previous inspection for */
  equipmentId: number;
  /** Current checklist item ID to highlight */
  currentItemId?: number;
  /** Current inspection ID (for copy endpoint) */
  currentInspectionId: number;
  /** Called when an answer is copied */
  onAnswerCopied?: (itemId: number, value: string, comment?: string) => void;
  /** Called when all answers are copied */
  onAllCopied?: (count: number) => void;
  /** Compact mode (show only current question's previous answer) */
  compact?: boolean;
}

// Import the API - graceful fallback
let previousInspectionApi: any = null;
try {
  previousInspectionApi = require('@inspection/shared').previousInspectionApi;
} catch {
  // API not available
}

export function PreviousAnswersPanel({
  equipmentId,
  currentItemId,
  currentInspectionId,
  onAnswerCopied,
  onAllCopied,
  compact = true,
}: PreviousAnswersPanelProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  // Fetch previous inspection
  const { data: prevData, isLoading, error } = useQuery({
    queryKey: ['previousInspection', equipmentId],
    queryFn: async () => {
      if (!previousInspectionApi) return null;
      const res = await previousInspectionApi.getPreviousInspection(equipmentId);
      return res.data?.data as PreviousInspectionData | null;
    },
    enabled: !!equipmentId,
    staleTime: 5 * 60 * 1000,
  });

  // Copy from previous mutation
  const copyMutation = useMutation({
    mutationFn: async (option: string) => {
      if (!previousInspectionApi || !prevData) return null;
      const res = await previousInspectionApi.copyFromPrevious(currentInspectionId, {
        previous_inspection_id: prevData.id,
        copy_option: option,
      });
      return res.data?.data;
    },
    onSuccess: (result) => {
      if (result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onAllCopied?.(result.copied_count);
        queryClient.invalidateQueries({ queryKey: ['inspection'] });
      }
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const currentPrevAnswer = useMemo(() => {
    if (!prevData?.answers || !currentItemId) return null;
    return prevData.answers.find((a) => a.checklist_item_id === currentItemId);
  }, [prevData, currentItemId]);

  const handleCopyOne = useCallback(
    (answer: PreviousAnswer) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onAnswerCopied?.(
        answer.checklist_item_id,
        answer.answer_value,
        answer.comment || undefined
      );
    },
    [onAnswerCopied]
  );

  const handleCopyAll = useCallback(() => {
    Alert.alert(
      isAr ? 'نسخ من السابق' : 'Copy from Previous',
      isAr
        ? 'ما الذي تريد نسخه؟'
        : 'What do you want to copy?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'كل الإجابات' : 'All Answers',
          onPress: () => copyMutation.mutate('all'),
        },
        {
          text: isAr ? 'الناجحة فقط' : 'Passed Only',
          onPress: () => copyMutation.mutate('passed_only'),
        },
        {
          text: isAr ? 'التعليقات فقط' : 'Comments Only',
          onPress: () => copyMutation.mutate('comments_only'),
        },
      ]
    );
  }, [isAr, copyMutation]);

  // Don't show if no previous data
  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color="#1677ff" />
      </View>
    );
  }

  if (!prevData || error) return null;

  // Compact mode: show only current question's previous answer
  if (compact) {
    if (!currentPrevAnswer) return null;

    const valueColor =
      currentPrevAnswer.answer_value === 'pass' || currentPrevAnswer.answer_value === 'yes'
        ? '#52c41a'
        : currentPrevAnswer.answer_value === 'fail' || currentPrevAnswer.answer_value === 'no'
        ? '#f5222d'
        : '#595959';

    return (
      <View style={styles.compactCard}>
        <View style={[styles.compactHeader, isAr && styles.rtlRow]}>
          <Text style={styles.compactIcon}>📋</Text>
          <Text style={[styles.compactTitle, isAr && styles.rtlText]}>
            {isAr ? 'الإجابة السابقة' : 'Previous Answer'}
          </Text>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => handleCopyOne(currentPrevAnswer)}
          >
            <Text style={styles.copyBtnText}>
              {isAr ? '📥 نسخ' : '📥 Copy'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.compactBody, isAr && styles.rtlRow]}>
          <Text style={[styles.prevValue, { color: valueColor }]}>
            {currentPrevAnswer.answer_value.toUpperCase()}
          </Text>
          {currentPrevAnswer.comment && (
            <Text style={[styles.prevComment, isAr && styles.rtlText]} numberOfLines={2}>
              💬 {currentPrevAnswer.comment}
            </Text>
          )}
        </View>

        {currentPrevAnswer.photo_url && (
          <Image
            source={{ uri: currentPrevAnswer.photo_url }}
            style={styles.prevPhoto}
            resizeMode="cover"
          />
        )}

        <Text style={styles.prevDate}>
          {prevData.technician_name} · {new Date(currentPrevAnswer.answered_at).toLocaleDateString(
            isAr ? 'ar' : 'en',
            { month: 'short', day: 'numeric' }
          )}
        </Text>
      </View>
    );
  }

  // Full mode: show all previous answers
  return (
    <View style={styles.fullPanel}>
      <View style={[styles.fullHeader, isAr && styles.rtlRow]}>
        <Text style={[styles.fullTitle, isAr && styles.rtlText]}>
          {isAr ? '📋 الفحص السابق' : '📋 Previous Inspection'}
        </Text>
        <TouchableOpacity
          style={styles.copyAllBtn}
          onPress={handleCopyAll}
          disabled={copyMutation.isPending}
        >
          {copyMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.copyAllBtnText}>
              {isAr ? '📥 نسخ الكل' : '📥 Copy All'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.fullSubtitle, isAr && styles.rtlText]}>
        👤 {prevData.technician_name}
        {prevData.submitted_at &&
          ` · ${new Date(prevData.submitted_at).toLocaleDateString(
            isAr ? 'ar' : 'en',
            { month: 'short', day: 'numeric', year: 'numeric' }
          )}`}
      </Text>

      <Text style={styles.answersCount}>
        {prevData.answers.length} {isAr ? 'إجابة' : 'answers'}
      </Text>

      <ScrollView style={styles.answersList} nestedScrollEnabled>
        {prevData.answers.slice(0, showAll ? undefined : 5).map((answer) => {
          const valueColor =
            answer.answer_value === 'pass' || answer.answer_value === 'yes'
              ? '#52c41a'
              : answer.answer_value === 'fail' || answer.answer_value === 'no'
              ? '#f5222d'
              : '#595959';
          const isCurrent = answer.checklist_item_id === currentItemId;

          return (
            <View
              key={answer.checklist_item_id}
              style={[styles.answerItem, isCurrent && styles.currentItem]}
            >
              <View style={[styles.answerRow, isAr && styles.rtlRow]}>
                <Text style={[styles.answerValue, { color: valueColor }]}>
                  {answer.answer_value}
                </Text>
                {answer.comment && (
                  <Text style={styles.answerComment} numberOfLines={1}>
                    {answer.comment}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.copySmallBtn}
                  onPress={() => handleCopyOne(answer)}
                >
                  <Text style={styles.copySmallText}>📥</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {!showAll && prevData.answers.length > 5 && (
        <TouchableOpacity onPress={() => setShowAll(true)} style={styles.showMoreBtn}>
          <Text style={styles.showMoreText}>
            {isAr
              ? `عرض ${prevData.answers.length - 5} المزيد`
              : `Show ${prevData.answers.length - 5} more`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    padding: 8,
    alignItems: 'center',
  },
  compactCard: {
    backgroundColor: '#f0f5ff',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#d6e4ff',
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactIcon: {
    fontSize: 14,
  },
  compactTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1677ff',
    flex: 1,
  },
  copyBtn: {
    backgroundColor: '#1677ff',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  copyBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  compactBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prevValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  prevComment: {
    fontSize: 12,
    color: '#595959',
    flex: 1,
  },
  prevPhoto: {
    width: '100%',
    height: 80,
    borderRadius: 6,
  },
  prevDate: {
    fontSize: 10,
    color: '#8c8c8c',
  },
  fullPanel: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#d6e4ff',
  },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#262626',
    flex: 1,
  },
  copyAllBtn: {
    backgroundColor: '#1677ff',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copyAllBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  fullSubtitle: {
    fontSize: 12,
    color: '#595959',
  },
  answersCount: {
    fontSize: 11,
    color: '#8c8c8c',
  },
  answersList: {
    maxHeight: 200,
  },
  answerItem: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  currentItem: {
    backgroundColor: '#e6f4ff',
    borderRadius: 4,
    paddingHorizontal: 6,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  answerValue: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 40,
  },
  answerComment: {
    fontSize: 11,
    color: '#8c8c8c',
    flex: 1,
  },
  copySmallBtn: {
    padding: 4,
  },
  copySmallText: {
    fontSize: 14,
  },
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  showMoreText: {
    fontSize: 12,
    color: '#1677ff',
    fontWeight: '500',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default PreviousAnswersPanel;
