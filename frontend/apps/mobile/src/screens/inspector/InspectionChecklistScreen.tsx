import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import {
  inspectionsApi,
  Inspection,
  InspectionAnswer,
  ChecklistItem,
  InspectionProgress,
} from '@inspection/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'InspectionChecklist'>;

interface LocalAnswers {
  [checklistItemId: number]: {
    answer_value: string;
    comment?: string;
    photo_uri?: string;
  };
}

export default function InspectionChecklistScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const queryClient = useQueryClient();
  const { id } = route.params;
  const isArabic = i18n.language === 'ar';

  const [localAnswers, setLocalAnswers] = useState<LocalAnswers>({});
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const {
    data: inspection,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => inspectionsApi.get(id),
    select: (res) => res.data.data ?? res.data,
    onSuccess: (data: Inspection) => {
      if (data.answers) {
        const existing: LocalAnswers = {};
        data.answers.forEach((ans: InspectionAnswer) => {
          existing[ans.checklist_item_id] = {
            answer_value: ans.answer_value,
            comment: ans.comment ?? undefined,
            photo_uri: ans.photo_path ?? undefined,
          };
        });
        setLocalAnswers((prev) => ({ ...existing, ...prev }));
      }
    },
  });

  const {
    data: progress,
  } = useQuery({
    queryKey: ['inspectionProgress', id],
    queryFn: () => inspectionsApi.getProgress(id),
    select: (res) => res.data.data ?? res.data,
  });

  const answerMutation = useMutation({
    mutationFn: (payload: { checklist_item_id: number; answer_value: string; comment?: string }) =>
      inspectionsApi.answerQuestion(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspectionProgress', id] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => inspectionsApi.submit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['inspection', id] });
      navigation.goBack();
    },
    onError: () => {
      Alert.alert(t('common.error'), t('common.error'));
    },
  });

  const handleAnswer = useCallback(
    (checklistItemId: number, value: string) => {
      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          answer_value: value,
        },
      }));

      // Debounce auto-save
      if (debounceTimers.current[checklistItemId]) {
        clearTimeout(debounceTimers.current[checklistItemId]);
      }
      debounceTimers.current[checklistItemId] = setTimeout(() => {
        const current = localAnswers[checklistItemId];
        answerMutation.mutate({
          checklist_item_id: checklistItemId,
          answer_value: value,
          comment: current?.comment,
        });
      }, 500);
    },
    [answerMutation, localAnswers],
  );

  const handleComment = useCallback(
    (checklistItemId: number, comment: string) => {
      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          comment,
        },
      }));
    },
    [],
  );

  const saveComment = useCallback(
    (checklistItemId: number) => {
      const current = localAnswers[checklistItemId];
      if (current?.answer_value) {
        answerMutation.mutate({
          checklist_item_id: checklistItemId,
          answer_value: current.answer_value,
          comment: current.comment,
        });
      }
    },
    [answerMutation, localAnswers],
  );

  const toggleComment = useCallback((itemId: number) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleTakePhoto = useCallback(
    async (checklistItemId: number) => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), 'Camera permission is required.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]) {
        setLocalAnswers((prev) => ({
          ...prev,
          [checklistItemId]: {
            ...prev[checklistItemId],
            photo_uri: result.assets[0].uri,
          },
        }));
      }
    },
    [t],
  );

  const handlePickImage = useCallback(
    async (checklistItemId: number) => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), 'Gallery permission is required.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]) {
        setLocalAnswers((prev) => ({
          ...prev,
          [checklistItemId]: {
            ...prev[checklistItemId],
            photo_uri: result.assets[0].uri,
          },
        }));
      }
    },
    [t],
  );

  const handleSubmit = useCallback(() => {
    Alert.alert(
      t('common.confirm'),
      t('inspection.submit') + '?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.submit'),
          style: 'destructive',
          onPress: () => submitMutation.mutate(),
        },
      ],
    );
  }, [t, submitMutation]);

  const renderYesNo = (item: ChecklistItem) => {
    const val = localAnswers[item.id]?.answer_value;
    return (
      <View style={styles.yesNoRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, val === 'yes' && styles.toggleBtnActiveGreen]}
          onPress={() => handleAnswer(item.id, 'yes')}
        >
          <Text style={[styles.toggleBtnText, val === 'yes' && styles.toggleBtnTextActive]}>
            Yes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, val === 'no' && styles.toggleBtnActiveRed]}
          onPress={() => handleAnswer(item.id, 'no')}
        >
          <Text style={[styles.toggleBtnText, val === 'no' && styles.toggleBtnTextActive]}>
            No
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPassFail = (item: ChecklistItem) => {
    const val = localAnswers[item.id]?.answer_value;
    return (
      <View style={styles.yesNoRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, val === 'pass' && styles.toggleBtnActiveGreen]}
          onPress={() => handleAnswer(item.id, 'pass')}
        >
          <Text style={[styles.toggleBtnText, val === 'pass' && styles.toggleBtnTextActive]}>
            Pass
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, val === 'fail' && styles.toggleBtnActiveRed]}
          onPress={() => handleAnswer(item.id, 'fail')}
        >
          <Text style={[styles.toggleBtnText, val === 'fail' && styles.toggleBtnTextActive]}>
            Fail
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTextInput = (item: ChecklistItem) => {
    const val = localAnswers[item.id]?.answer_value ?? '';
    return (
      <TextInput
        style={styles.textInputAnswer}
        value={val}
        onChangeText={(text) => handleAnswer(item.id, text)}
        placeholder={t('inspection.answer')}
        multiline
        numberOfLines={3}
      />
    );
  };

  const renderNumberInput = (item: ChecklistItem) => {
    const val = localAnswers[item.id]?.answer_value ?? '';
    return (
      <TextInput
        style={styles.numberInput}
        value={val}
        onChangeText={(text) => handleAnswer(item.id, text)}
        placeholder={t('inspection.answer')}
        keyboardType="numeric"
      />
    );
  };

  const renderAnswerInput = (item: ChecklistItem) => {
    switch (item.answer_type) {
      case 'yes_no':
        return renderYesNo(item);
      case 'pass_fail':
        return renderPassFail(item);
      case 'text':
        return renderTextInput(item);
      case 'numeric':
        return renderNumberInput(item);
      default:
        return null;
    }
  };

  const renderChecklistItem = (item: ChecklistItem) => {
    const questionText = isArabic && item.question_text_ar
      ? item.question_text_ar
      : item.question_text;
    const commentExpanded = expandedComments.has(item.id);
    const currentAnswer = localAnswers[item.id];

    return (
      <View key={item.id} style={styles.checklistCard}>
        <View style={styles.questionHeader}>
          <Text style={styles.questionText}>{questionText}</Text>
          <View style={styles.badgeRow}>
            {item.category ? (
              <View
                style={[
                  styles.categoryChip,
                  item.category === 'mechanical'
                    ? styles.categoryMechanical
                    : styles.categoryElectrical,
                ]}
              >
                <Text style={styles.categoryChipText}>{item.category}</Text>
              </View>
            ) : null}
            {item.critical_failure ? (
              <View style={styles.criticalBadge}>
                <Text style={styles.criticalBadgeText}>CRITICAL</Text>
              </View>
            ) : null}
          </View>
        </View>

        {renderAnswerInput(item)}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.commentToggle}
            onPress={() => toggleComment(item.id)}
          >
            <Text style={styles.commentToggleText}>{t('inspection.comment')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cameraButton}
            onPress={() => handleTakePhoto(item.id)}
          >
            <Text style={styles.cameraButtonText}>{t('inspection.take_photo')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.galleryButton}
            onPress={() => handlePickImage(item.id)}
          >
            <Text style={styles.galleryButtonText}>{t('inspection.photo')}</Text>
          </TouchableOpacity>
        </View>

        {commentExpanded ? (
          <TextInput
            style={styles.commentInput}
            value={currentAnswer?.comment ?? ''}
            onChangeText={(text) => handleComment(item.id, text)}
            onBlur={() => saveComment(item.id)}
            placeholder={t('inspection.comment')}
            multiline
            numberOfLines={2}
          />
        ) : null}

        {currentAnswer?.photo_uri ? (
          <Image
            source={{ uri: currentAnswer.photo_uri }}
            style={styles.photoPreview}
            resizeMode="cover"
          />
        ) : null}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (isError || !inspection) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const inspData = inspection as Inspection;
  const checklistItems = (inspData.answers ?? [])
    .map((a: InspectionAnswer) => a.checklist_item)
    .filter((item): item is ChecklistItem => item !== null)
    .sort((a, b) => a.order_index - b.order_index);

  // If no checklist items from answers, we still show the equipment info
  const progressData = progress as InspectionProgress | undefined;
  const progressPct = progressData?.percentage ?? 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
    >
      {/* Equipment Info Header */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>
          {inspData.equipment?.name ?? `Equipment #${inspData.equipment_id}`}
        </Text>
        {inspData.equipment?.equipment_type ? (
          <Text style={styles.headerDetail}>
            {t('equipment.type')}: {inspData.equipment.equipment_type}
          </Text>
        ) : null}
        {inspData.equipment?.location ? (
          <Text style={styles.headerDetail}>
            {t('equipment.location')}: {inspData.equipment.location}
          </Text>
        ) : null}
        {inspData.equipment?.berth ? (
          <Text style={styles.headerDetail}>
            {t('equipment.berth')}: {inspData.equipment.berth}
          </Text>
        ) : null}
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{t('common.status')}:</Text>
          <Text style={styles.statusValue}>{inspData.status}</Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressCard}>
        <Text style={styles.progressLabel}>
          {t('inspection.progress')}: {progressData?.answered_items ?? 0}/{progressData?.total_items ?? 0}
        </Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressPercent}>{Math.round(progressPct)}%</Text>
      </View>

      {/* Checklist Items */}
      <Text style={styles.sectionTitle}>{t('inspection.checklist')}</Text>
      {checklistItems.length === 0 ? (
        <Text style={styles.noItemsText}>{t('common.noData')}</Text>
      ) : (
        checklistItems.map(renderChecklistItem)
      )}

      {/* Submit Button */}
      {inspData.status === 'draft' ? (
        <TouchableOpacity
          style={[styles.submitButton, submitMutation.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('inspection.submit')}</Text>
          )}
        </TouchableOpacity>
      ) : null}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 6,
  },
  headerDetail: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusLabel: {
    fontSize: 13,
    color: '#757575',
    marginRight: 6,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
    textTransform: 'capitalize',
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  checklistCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  questionHeader: {
    marginBottom: 10,
  },
  questionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryMechanical: {
    backgroundColor: '#E3F2FD',
  },
  categoryElectrical: {
    backgroundColor: '#FFF3E0',
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#424242',
    textTransform: 'capitalize',
  },
  criticalBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  criticalBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D32F2F',
  },
  yesNoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#bdbdbd',
    alignItems: 'center',
  },
  toggleBtnActiveGreen: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  toggleBtnActiveRed: {
    backgroundColor: '#F44336',
    borderColor: '#F44336',
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#616161',
  },
  toggleBtnTextActive: {
    color: '#fff',
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  starButton: {
    padding: 4,
  },
  starText: {
    fontSize: 28,
    color: '#bdbdbd',
  },
  starFilled: {
    color: '#FFC107',
  },
  textInputAnswer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 8,
    color: '#212121',
  },
  numberInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 8,
    color: '#212121',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  commentToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#E8EAF6',
  },
  commentToggleText: {
    fontSize: 12,
    color: '#3F51B5',
    fontWeight: '500',
  },
  cameraButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#E0F2F1',
  },
  cameraButtonText: {
    fontSize: 12,
    color: '#00897B',
    fontWeight: '500',
  },
  galleryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFF3E0',
  },
  galleryButtonText: {
    fontSize: 12,
    color: '#E65100',
    fontWeight: '500',
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    minHeight: 50,
    textAlignVertical: 'top',
    marginTop: 8,
    color: '#212121',
  },
  photoPreview: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 40,
  },
  noItemsText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#E53935',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
