import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Animated,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import VoiceTextInput from '../../components/VoiceTextInput';
import VoiceNoteRecorder from '../../components/VoiceNoteRecorder';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  getApiClient,
  aiApi,
} from '@inspection/shared';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'InspectionWizard'>;

interface LocalAnswer {
  answer_value: string;
  comment?: string;
  photo_uri?: string;
  photo_url?: string;
  video_uri?: string;
  video_url?: string;
  voice_note_id?: number;
  voice_note_url?: string;
  voice_transcription?: { en: string; ar: string };
  isUploading?: boolean;
  skipped?: boolean;
}

interface GroupedItems {
  assembly: string;
  parts: {
    part: string | null;
    items: ChecklistItem[];
  }[];
}

// Validation result type
type ValidationResult = 'pass' | 'fail' | 'unknown';

export default function InspectionWizardScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const queryClient = useQueryClient();
  const { id } = route.params;
  const isArabic = i18n.language === 'ar';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<number, LocalAnswer>>({});
  const [skippedItems, setSkippedItems] = useState<Set<number>>(new Set());
  const slideAnim = useRef(new Animated.Value(0)).current;
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Fetch inspection data
  const {
    data: inspection,
    isLoading,
    isError,
    error,
    refetch,
  } = useOfflineQuery<Inspection>({
    queryKey: ['inspection', 'by-assignment', id],
    queryFn: async () => {
      const res = await inspectionsApi.getByAssignment(id);
      const ins = (res.data as any).data ?? res.data;
      return ins as Inspection;
    },
    cacheKey: `inspection-${id}`,
  });

  const inspectionId = inspection?.id;

  // Get all checklist items
  const allChecklistItems = useMemo(() => {
    if (!inspection) return [];
    const rawChecklistItems: ChecklistItem[] = (inspection as any).checklist_items ?? [];
    const itemsFromAnswers: ChecklistItem[] = (inspection.answers ?? [])
      .map((a: InspectionAnswer) => a.checklist_item)
      .filter((item): item is ChecklistItem => item !== null);
    const allItems = [...rawChecklistItems, ...itemsFromAnswers];
    return Array.from(
      new Map(allItems.map((item) => [item.id, item])).values(),
    ).sort((a, b) => a.order_index - b.order_index);
  }, [inspection]);

  // Group items by assembly
  const assemblyGroups = useMemo(() => {
    const groups: { assembly: string; startIndex: number; count: number }[] = [];
    let currentAssembly = '';

    allChecklistItems.forEach((item, index) => {
      const assembly = (item as any).assembly || 'General';
      if (assembly !== currentAssembly) {
        groups.push({ assembly, startIndex: index, count: 1 });
        currentAssembly = assembly;
      } else {
        groups[groups.length - 1].count++;
      }
    });

    return groups;
  }, [allChecklistItems]);

  // Current item
  const currentItem = allChecklistItems[currentIndex];
  const totalItems = allChecklistItems.length;

  // Get assembly info for current item
  const currentAssembly = currentItem ? ((currentItem as any).assembly || 'General') : '';
  const currentPart = currentItem ? (currentItem as any).part : null;

  // Find which assembly group current item belongs to
  const currentAssemblyGroup = assemblyGroups.find(
    g => currentIndex >= g.startIndex && currentIndex < g.startIndex + g.count
  );
  const itemInAssembly = currentAssemblyGroup
    ? currentIndex - currentAssemblyGroup.startIndex + 1
    : 0;
  const assemblyTotal = currentAssemblyGroup?.count || 0;

  // Sync server answers into local state
  useEffect(() => {
    if (inspection?.answers) {
      const merged: Record<number, LocalAnswer> = {};
      inspection.answers.forEach((ans: InspectionAnswer) => {
        const photoUrl = (ans.photo_file as any)?.url || null;
        const videoUrl = (ans.video_file as any)?.url || null;
        const voiceNoteUrl = (ans.voice_note as any)?.url || null;

        merged[ans.checklist_item_id] = {
          answer_value: ans.answer_value,
          comment: ans.comment ?? undefined,
          photo_url: photoUrl ?? undefined,
          video_url: videoUrl ?? undefined,
          voice_note_id: ans.voice_note_id ?? undefined,
          voice_note_url: voiceNoteUrl ?? undefined,
        };
      });
      setLocalAnswers((prev) => ({ ...prev, ...merged }));
    }
  }, [inspection]);

  // Answer mutation
  const answerMutation = useMutation({
    mutationFn: (payload: { checklist_item_id: number; answer_value: string; comment?: string; voice_note_id?: number }) =>
      inspectionsApi.answerQuestion(inspectionId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspectionProgress', inspectionId] });
    },
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: () => inspectionsApi.submit(inspectionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });
      navigation.replace('Assessment', { id });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || error?.response?.data?.error || t('common.error');
      Alert.alert(t('common.error'), message);
    },
  });

  // Validate answer against expected result
  const validateAnswer = useCallback((item: ChecklistItem, answerValue: string): ValidationResult => {
    if (!answerValue) return 'unknown';

    const answer = answerValue.toLowerCase();

    // For pass_fail and yes_no types
    if (item.answer_type === 'pass_fail') {
      return answer === 'pass' ? 'pass' : answer === 'fail' ? 'fail' : 'unknown';
    }
    if (item.answer_type === 'yes_no') {
      return answer === 'yes' ? 'pass' : answer === 'no' ? 'fail' : 'unknown';
    }

    // For numeric type - check against min/max values
    if (item.answer_type === 'numeric') {
      const numValue = parseFloat(answerValue);
      if (isNaN(numValue)) return 'unknown';

      const { numeric_rule, min_value, max_value } = item;

      if (numeric_rule === 'less_than' && max_value !== null) {
        return numValue < max_value ? 'pass' : 'fail';
      }
      if (numeric_rule === 'greater_than' && min_value !== null) {
        return numValue > min_value ? 'pass' : 'fail';
      }
      if (numeric_rule === 'between' && min_value !== null && max_value !== null) {
        return numValue >= min_value && numValue <= max_value ? 'pass' : 'fail';
      }

      // If no rule but has expected result, just mark as pass (user entered value)
      return 'pass';
    }

    // For text type - just mark as answered
    if (item.answer_type === 'text' && answerValue.trim()) {
      return 'pass';
    }

    return 'unknown';
  }, []);

  // Handle answer
  const handleAnswer = useCallback((value: string) => {
    if (!currentItem) return;

    // Remove from skipped if answering
    setSkippedItems(prev => {
      const next = new Set(prev);
      next.delete(currentItem.id);
      return next;
    });

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        answer_value: value,
        skipped: false,
      },
    }));

    // Debounce save
    if (debounceTimers.current[currentItem.id]) {
      clearTimeout(debounceTimers.current[currentItem.id]);
    }
    debounceTimers.current[currentItem.id] = setTimeout(() => {
      const current = localAnswers[currentItem.id];
      answerMutation.mutate({
        checklist_item_id: currentItem.id,
        answer_value: value,
        comment: current?.comment,
      });
    }, 500);
  }, [currentItem, answerMutation, localAnswers]);

  // Navigate to specific index
  const goToIndex = useCallback((index: number) => {
    if (index < 0 || index >= totalItems || index === currentIndex) return;

    const direction = index > currentIndex ? -1 : 1;

    Animated.timing(slideAnim, {
      toValue: direction * SCREEN_WIDTH,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setCurrentIndex(index);
      slideAnim.setValue(-direction * SCREEN_WIDTH);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  }, [currentIndex, totalItems, slideAnim]);

  // Navigate to next item
  const goToNext = useCallback(() => {
    goToIndex(currentIndex + 1);
  }, [currentIndex, goToIndex]);

  // Navigate to previous item
  const goToPrev = useCallback(() => {
    goToIndex(currentIndex - 1);
  }, [currentIndex, goToIndex]);

  // Skip current item
  const handleSkip = useCallback(() => {
    if (!currentItem) return;

    setSkippedItems(prev => new Set(prev).add(currentItem.id));
    setLocalAnswers(prev => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        skipped: true,
      },
    }));

    if (currentIndex < totalItems - 1) {
      goToNext();
    }
  }, [currentItem, currentIndex, totalItems, goToNext]);

  // Check if current question is answered
  const isCurrentAnswered = currentItem && localAnswers[currentItem.id]?.answer_value && !skippedItems.has(currentItem.id);

  // Get item status for progress dots
  const getItemStatus = useCallback((index: number): 'answered' | 'skipped' | 'current' | 'pending' => {
    if (index === currentIndex) return 'current';
    const item = allChecklistItems[index];
    if (!item) return 'pending';
    if (skippedItems.has(item.id)) return 'skipped';
    if (localAnswers[item.id]?.answer_value) return 'answered';
    return 'pending';
  }, [currentIndex, allChecklistItems, skippedItems, localAnswers]);

  // Switch to list mode
  const switchToListMode = useCallback(() => {
    navigation.replace('InspectionChecklist', { id });
  }, [navigation, id]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    // Check for skipped or unanswered items
    const unanswered = allChecklistItems.filter((item) =>
      !localAnswers[item.id]?.answer_value || skippedItems.has(item.id)
    );

    if (unanswered.length > 0) {
      Alert.alert(
        t('common.warning', 'Warning'),
        t('inspection.incompleteCount', `${unanswered.length} questions are not answered. Complete all questions before submitting.`),
        [
          {
            text: t('inspection.goToFirst', 'Go to first unanswered'),
            onPress: () => {
              const firstUnansweredIndex = allChecklistItems.findIndex(
                item => !localAnswers[item.id]?.answer_value || skippedItems.has(item.id)
              );
              if (firstUnansweredIndex >= 0) {
                goToIndex(firstUnansweredIndex);
              }
            }
          },
          { text: t('common.cancel'), style: 'cancel' }
        ]
      );
      return;
    }

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
  }, [t, submitMutation, allChecklistItems, localAnswers, skippedItems, goToIndex]);

  // Photo upload
  const handleTakePhoto = useCallback(async () => {
    if (!currentItem) return;

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
      const asset = result.assets[0];
      uploadPhoto(currentItem.id, asset.uri, asset.fileName || 'photo.jpg');
    }
  }, [currentItem, t]);

  const uploadPhoto = useCallback(async (checklistItemId: number, uri: string, fileName: string) => {
    setLocalAnswers((prev) => ({
      ...prev,
      [checklistItemId]: {
        ...prev[checklistItemId],
        photo_uri: uri,
        isUploading: true,
      },
    }));

    try {
      const formData = new FormData();
      formData.append('file', { uri, name: fileName || 'photo.jpg', type: 'image/jpeg' } as any);
      formData.append('checklist_item_id', String(checklistItemId));

      const response = await getApiClient().post(
        `/api/inspections/${inspectionId}/upload-media`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const data = (response.data as any)?.data;
      const cloudinaryUrl = data?.photo_file?.url || data?.url;

      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          photo_uri: undefined,
          photo_url: cloudinaryUrl,
          isUploading: false,
        },
      }));

      queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.response?.data?.message || 'Failed to upload photo');
      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          photo_uri: undefined,
          isUploading: false,
        },
      }));
    }
  }, [id, inspectionId, queryClient, t]);

  // Handle voice note
  const handleVoiceNoteRecorded = useCallback((voiceNoteId: number, transcription?: { en: string; ar: string }) => {
    if (!currentItem) return;

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        voice_note_id: voiceNoteId,
        voice_transcription: transcription,
      },
    }));

    const current = localAnswers[currentItem.id];
    if (current?.answer_value) {
      answerMutation.mutate({
        checklist_item_id: currentItem.id,
        answer_value: current.answer_value,
        comment: current.comment,
        voice_note_id: voiceNoteId,
      });
    }
  }, [currentItem, localAnswers, answerMutation]);

  // Render progress dots
  const renderProgressDots = () => {
    // Show max 10 dots, with current in center if possible
    const maxDots = 10;
    let startIndex = 0;
    let endIndex = Math.min(totalItems, maxDots);

    if (totalItems > maxDots) {
      const halfDots = Math.floor(maxDots / 2);
      startIndex = Math.max(0, currentIndex - halfDots);
      endIndex = Math.min(totalItems, startIndex + maxDots);
      if (endIndex === totalItems) {
        startIndex = Math.max(0, totalItems - maxDots);
      }
    }

    const dots = [];
    for (let i = startIndex; i < endIndex; i++) {
      const status = getItemStatus(i);
      dots.push(
        <TouchableOpacity
          key={i}
          style={[
            styles.progressDot,
            status === 'current' && styles.progressDotCurrent,
            status === 'answered' && styles.progressDotAnswered,
            status === 'skipped' && styles.progressDotSkipped,
          ]}
          onPress={() => goToIndex(i)}
        >
          {status === 'answered' && <Text style={styles.dotCheck}>✓</Text>}
          {status === 'skipped' && <Text style={styles.dotSkip}>−</Text>}
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.progressDotsContainer}>
        {startIndex > 0 && <Text style={styles.dotsEllipsis}>...</Text>}
        {dots}
        {endIndex < totalItems && <Text style={styles.dotsEllipsis}>...</Text>}
      </View>
    );
  };

  // Render answer input based on type with validation colors
  const renderAnswerInput = () => {
    if (!currentItem) return null;
    const currentAnswer = localAnswers[currentItem.id];
    const val = currentAnswer?.answer_value || '';
    const validation = validateAnswer(currentItem, val);

    switch (currentItem.answer_type) {
      case 'yes_no':
        return (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.answerButton,
                val === 'yes' && styles.answerButtonActiveGreen,
                val === 'yes' && validation === 'pass' && styles.answerButtonValidated,
              ]}
              onPress={() => handleAnswer('yes')}
            >
              <Text style={[styles.answerButtonText, val === 'yes' && styles.answerButtonTextActive]}>
                {t('common.yes', 'Yes')} {val === 'yes' && validation === 'pass' && '✓'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.answerButton,
                val === 'no' && styles.answerButtonActiveRed,
                val === 'no' && validation === 'fail' && styles.answerButtonFailed,
              ]}
              onPress={() => handleAnswer('no')}
            >
              <Text style={[styles.answerButtonText, val === 'no' && styles.answerButtonTextActive]}>
                {t('common.no', 'No')} {val === 'no' && validation === 'fail' && '✗'}
              </Text>
            </TouchableOpacity>
          </View>
        );

      case 'pass_fail':
        return (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.answerButton,
                val === 'pass' && styles.answerButtonActiveGreen,
                val === 'pass' && validation === 'pass' && styles.answerButtonValidated,
              ]}
              onPress={() => handleAnswer('pass')}
            >
              <Text style={[styles.answerButtonText, val === 'pass' && styles.answerButtonTextActive]}>
                {t('common.pass', 'Pass')} {val === 'pass' && '✓'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.answerButton,
                val === 'fail' && styles.answerButtonActiveRed,
                val === 'fail' && validation === 'fail' && styles.answerButtonFailed,
              ]}
              onPress={() => handleAnswer('fail')}
            >
              <Text style={[styles.answerButtonText, val === 'fail' && styles.answerButtonTextActive]}>
                {t('common.fail', 'Fail')} {val === 'fail' && '✗'}
              </Text>
            </TouchableOpacity>
          </View>
        );

      case 'numeric':
        return (
          <View>
            <View style={[
              styles.numericInputContainer,
              val && validation === 'pass' && styles.inputValidated,
              val && validation === 'fail' && styles.inputFailed,
            ]}>
              <TextInput
                style={styles.numericInput}
                value={val}
                onChangeText={handleAnswer}
                placeholder={t('inspection.enterValue', 'Enter value')}
                keyboardType="numeric"
              />
              {val && validation === 'pass' && (
                <View style={styles.validationIcon}>
                  <Text style={styles.validationIconPass}>✓</Text>
                </View>
              )}
              {val && validation === 'fail' && (
                <View style={styles.validationIcon}>
                  <Text style={styles.validationIconFail}>✗</Text>
                </View>
              )}
            </View>
            {val && validation === 'fail' && (
              <Text style={styles.validationWarningText}>
                ⚠️ {t('inspection.valueOutOfRange', 'Value is out of expected range')}
              </Text>
            )}
          </View>
        );

      case 'text':
        return (
          <VoiceTextInput
            style={[styles.textInput, val && styles.textInputAnswered]}
            value={val}
            onChangeText={handleAnswer}
            placeholder={t('inspection.answer')}
            multiline
            numberOfLines={3}
          />
        );

      default:
        return null;
    }
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
        <Text style={styles.errorText}>{(error as any)?.message || t('common.error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!currentItem) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noItemsText}>{t('common.noData')}</Text>
      </View>
    );
  }

  const inspData = inspection as Inspection;
  const currentAnswer = localAnswers[currentItem.id];
  const photoSource = currentAnswer?.photo_url || currentAnswer?.photo_uri;
  const isUploading = currentAnswer?.isUploading;
  const validation = validateAnswer(currentItem, currentAnswer?.answer_value || '');

  // Get expected result and action if fail
  const expectedResult = isArabic
    ? ((currentItem as any).expected_result_ar || (currentItem as any).expected_result)
    : (currentItem as any).expected_result;
  const actionIfFail = isArabic
    ? ((currentItem as any).action_if_fail_ar || (currentItem as any).action_if_fail)
    : (currentItem as any).action_if_fail;

  // Count answered, skipped, pending
  const answeredCount = allChecklistItems.filter(item =>
    localAnswers[item.id]?.answer_value && !skippedItems.has(item.id)
  ).length;
  const skippedCount = skippedItems.size;

  return (
    <View style={styles.container}>
      {/* Header with equipment info and switch button */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.equipmentName} numberOfLines={1}>
            {inspData.equipment?.name ?? `Equipment #${inspData.equipment_id}`}
          </Text>
          <TouchableOpacity style={styles.switchButton} onPress={switchToListMode}>
            <Text style={styles.switchButtonText}>☰ {t('inspection.listMode', 'List')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.progressText}>
          {answeredCount}/{totalItems} {t('inspection.answered', 'answered')}
          {skippedCount > 0 && ` • ${skippedCount} ${t('inspection.skipped', 'skipped')}`}
        </Text>
      </View>

      {/* Progress dots */}
      {renderProgressDots()}

      {/* Assembly/Part indicator */}
      <View style={styles.assemblyIndicator}>
        <Text style={styles.assemblyText}>
          📦 {currentAssembly} ({itemInAssembly}/{assemblyTotal})
          {currentPart && ` → ${currentPart}`}
        </Text>
      </View>

      {/* Question card with animation */}
      <Animated.View style={[styles.questionCard, { transform: [{ translateX: slideAnim }] }]}>
        <ScrollView contentContainerStyle={styles.questionContent} showsVerticalScrollIndicator={false}>
          {/* Question number */}
          <Text style={styles.questionNumber}>
            {t('inspection.question', 'Question')} {currentIndex + 1}
          </Text>

          {/* Question text */}
          <Text style={styles.questionText}>
            {isArabic && currentItem.question_text_ar
              ? currentItem.question_text_ar
              : currentItem.question_text}
          </Text>

          {/* Expected result hint with validation */}
          {expectedResult && (
            <View style={[
              styles.hintBox,
              currentAnswer?.answer_value && validation === 'pass' && styles.hintBoxPass,
              currentAnswer?.answer_value && validation === 'fail' && styles.hintBoxFail,
            ]}>
              <View style={styles.hintHeader}>
                <Text style={[
                  styles.hintLabel,
                  validation === 'pass' && styles.hintLabelPass,
                  validation === 'fail' && styles.hintLabelFail,
                ]}>
                  {t('inspection.expectedResult', 'Expected Result')}:
                </Text>
                {currentAnswer?.answer_value && validation === 'pass' && (
                  <Text style={styles.validationBadgePass}>✓ {t('inspection.withinRange', 'OK')}</Text>
                )}
                {currentAnswer?.answer_value && validation === 'fail' && (
                  <Text style={styles.validationBadgeFail}>✗ {t('inspection.outOfRange', 'Out of range')}</Text>
                )}
              </View>
              <Text style={styles.hintText}>{expectedResult}</Text>
            </View>
          )}

          {/* Action if fail hint */}
          {actionIfFail && validation === 'fail' && (
            <View style={[styles.hintBox, styles.warningBox]}>
              <Text style={[styles.hintLabel, styles.warningLabel]}>
                ⚠️ {t('inspection.actionIfFail', 'Action Required')}:
              </Text>
              <Text style={styles.hintText}>{actionIfFail}</Text>
            </View>
          )}

          {/* Category and critical badges */}
          <View style={styles.badgeRow}>
            {currentItem.category && (
              <View style={[styles.badge, currentItem.category === 'mechanical' ? styles.badgeMechanical : styles.badgeElectrical]}>
                <Text style={styles.badgeText}>{currentItem.category}</Text>
              </View>
            )}
            {currentItem.critical_failure && (
              <View style={[styles.badge, styles.badgeCritical]}>
                <Text style={[styles.badgeText, styles.badgeCriticalText]}>{t('inspection.critical', 'CRITICAL')}</Text>
              </View>
            )}
          </View>

          {/* Answer input */}
          {renderAnswerInput()}

          {/* Photo section */}
          <View style={styles.mediaSection}>
            <TouchableOpacity
              style={[styles.photoButton, isUploading && styles.buttonDisabled]}
              onPress={handleTakePhoto}
              disabled={isUploading}
            >
              <Text style={styles.photoButtonText}>📷 {t('inspection.take_photo')}</Text>
            </TouchableOpacity>

            {photoSource && (
              <View style={styles.photoContainer}>
                <Image source={{ uri: photoSource }} style={styles.photoPreview} resizeMode="cover" />
                {isUploading && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator color="#fff" size="large" />
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Voice note */}
          <VoiceNoteRecorder
            onVoiceNoteRecorded={handleVoiceNoteRecorded}
            existingVoiceUrl={currentAnswer?.voice_note_url}
            existingTranscription={currentAnswer?.voice_transcription}
            disabled={isUploading}
            language={i18n.language}
          />

          {/* Validation warning for failed items */}
          {validation === 'fail' && !photoSource && (
            <View style={styles.validationWarning}>
              <Text style={styles.warningText}>
                ⚠️ {t('inspection.fail_requires_media', 'Photo recommended for failed items')}
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Navigation buttons */}
      <View style={styles.navButtonRow}>
        <TouchableOpacity
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          onPress={goToPrev}
          disabled={currentIndex === 0}
        >
          <Text style={[styles.navButtonText, currentIndex === 0 && styles.navButtonTextDisabled]}>
            ←
          </Text>
        </TouchableOpacity>

        {/* Skip button */}
        <TouchableOpacity
          style={[styles.skipButton, isCurrentAnswered && styles.skipButtonHidden]}
          onPress={handleSkip}
          disabled={isCurrentAnswered || currentIndex === totalItems - 1}
        >
          <Text style={styles.skipButtonText}>
            {t('inspection.skip', 'Skip')}
          </Text>
        </TouchableOpacity>

        {currentIndex === totalItems - 1 ? (
          <TouchableOpacity
            style={[styles.submitButton, submitMutation.isPending && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>{t('inspection.submit')}</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.navButton, styles.navButtonPrimary]}
            onPress={goToNext}
          >
            <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>
              →
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1976D2',
    padding: 16,
    paddingTop: 50,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  equipmentName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  switchButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  switchButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
  },
  progressDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 6,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDotCurrent: {
    backgroundColor: '#1976D2',
    transform: [{ scale: 1.2 }],
  },
  progressDotAnswered: {
    backgroundColor: '#4CAF50',
  },
  progressDotSkipped: {
    backgroundColor: '#FF9800',
  },
  dotCheck: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  dotSkip: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  dotsEllipsis: {
    color: '#999',
    fontSize: 12,
  },
  assemblyIndicator: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  assemblyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
  },
  questionCard: {
    flex: 1,
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  questionContent: {
    padding: 16,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 4,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    lineHeight: 26,
    marginBottom: 16,
  },
  hintBox: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#9E9E9E',
  },
  hintBoxPass: {
    backgroundColor: '#E8F5E9',
    borderLeftColor: '#4CAF50',
  },
  hintBoxFail: {
    backgroundColor: '#FFEBEE',
    borderLeftColor: '#F44336',
  },
  hintHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  hintLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#616161',
  },
  hintLabelPass: {
    color: '#2E7D32',
  },
  hintLabelFail: {
    color: '#C62828',
  },
  validationBadgePass: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  validationBadgeFail: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#F44336',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  warningBox: {
    backgroundColor: '#FFF3E0',
    borderLeftColor: '#FF9800',
  },
  warningLabel: {
    color: '#E65100',
  },
  hintText: {
    fontSize: 14,
    color: '#424242',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeMechanical: {
    backgroundColor: '#E3F2FD',
  },
  badgeElectrical: {
    backgroundColor: '#FFF3E0',
  },
  badgeCritical: {
    backgroundColor: '#FFEBEE',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#424242',
    textTransform: 'uppercase',
  },
  badgeCriticalText: {
    color: '#C62828',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  answerButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#bdbdbd',
    alignItems: 'center',
  },
  answerButtonActiveGreen: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  answerButtonActiveRed: {
    backgroundColor: '#F44336',
    borderColor: '#F44336',
  },
  answerButtonValidated: {
    borderColor: '#2E7D32',
    borderWidth: 3,
  },
  answerButtonFailed: {
    borderColor: '#C62828',
    borderWidth: 3,
  },
  answerButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#616161',
  },
  answerButtonTextActive: {
    color: '#fff',
  },
  numericInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    marginBottom: 8,
  },
  inputValidated: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  inputFailed: {
    borderColor: '#F44336',
    backgroundColor: '#FFEBEE',
  },
  numericInput: {
    flex: 1,
    padding: 14,
    fontSize: 18,
    textAlign: 'center',
    color: '#212121',
  },
  validationIcon: {
    paddingRight: 14,
  },
  validationIconPass: {
    fontSize: 20,
    color: '#4CAF50',
    fontWeight: '700',
  },
  validationIconFail: {
    fontSize: 20,
    color: '#F44336',
    fontWeight: '700',
  },
  validationWarningText: {
    fontSize: 12,
    color: '#C62828',
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
    color: '#212121',
  },
  textInputAnswered: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  mediaSection: {
    marginBottom: 16,
  },
  photoButton: {
    backgroundColor: '#E0F2F1',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00897B',
  },
  photoContainer: {
    marginTop: 12,
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: 150,
    borderRadius: 8,
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  validationWarning: {
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  warningText: {
    fontSize: 12,
    color: '#E65100',
  },
  navButtonRow: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 30,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
    alignItems: 'center',
  },
  navButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonPrimary: {
    backgroundColor: '#1976D2',
  },
  navButtonDisabled: {
    borderColor: '#bdbdbd',
    backgroundColor: '#f5f5f5',
  },
  navButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1976D2',
  },
  navButtonTextPrimary: {
    color: '#fff',
  },
  navButtonTextDisabled: {
    color: '#bdbdbd',
  },
  skipButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonHidden: {
    opacity: 0.3,
  },
  skipButtonText: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '500',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
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
  noItemsText: {
    fontSize: 14,
    color: '#999',
  },
});
