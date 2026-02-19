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
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { Video, ResizeMode } from 'expo-av';
import VoiceTextInput from '../../components/VoiceTextInput';
import VoiceNoteRecorder, { stopAllVoicePlayback } from '../../components/VoiceNoteRecorder';
import VideoRecorder from '../../components/VideoRecorder';
import PhotoGallery from '../../components/PhotoGallery';
import { Photo } from '../../components/PhotoThumbnailGrid';
import { QuickFill } from '../../components/inspection/AnswerTemplates';
import { QuickNotes } from '../../components/inspection/QuickNotes';

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

// Photo item for multi-photo support
interface PhotoItem {
  id: string;
  uri: string;
  url?: string;
  isUploading?: boolean;
  uploadFailed?: boolean;
  ai_analysis?: { en: string; ar: string };
  order: number;
}

interface LocalAnswer {
  answer_value: string;
  comment?: string;
  urgency_level?: number; // 0=OK, 1=Monitor, 2=Needs Attention, 3=Critical
  // Multi-photo support (new)
  photos?: PhotoItem[];
  // Legacy single photo support (for backwards compatibility)
  photo_uri?: string;
  photo_url?: string;
  photo_ai_analysis?: { en: string; ar: string };
  video_uri?: string;
  video_url?: string;
  video_file_id?: number;
  video_ai_analysis?: { en: string; ar: string };
  voice_note_id?: number;
  voice_note_url?: string;
  voice_transcription?: { en: string; ar: string };
  isUploading?: boolean;
  uploadFailed?: boolean;
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
  const [fixingIncomplete, setFixingIncomplete] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
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

  // Track pre-filled items from colleague
  const [prefilledItems, setPrefilledItems] = useState<Record<number, { name: string; type: string }>>({});

  // Fetch colleague's answers for pre-fill
  const {
    data: colleagueData,
  } = useOfflineQuery<{ answers: any[]; colleague: { id: number; name: string; type: string; inspection_status: string } | null }>({
    queryKey: ['colleague-answers', id],
    queryFn: async () => {
      const res = await inspectionsApi.getColleagueAnswers(id);
      return (res.data as any).data;
    },
    cacheKey: `colleague-answers-${id}`,
  });

  // Sync server answers into local state (only once when inspection loads)
  const inspectionAnswersJson = JSON.stringify(inspection?.answers?.map(a => a.id) || []);
  useEffect(() => {
    if (inspection?.answers && inspection.answers.length > 0) {
      const merged: Record<number, LocalAnswer> = {};
      inspection.answers.forEach((ans: InspectionAnswer) => {
        const photoUrl = (ans.photo_file as any)?.url || null;
        const videoUrl = (ans.video_file as any)?.url || null;
        const voiceNoteUrl = (ans.voice_note as any)?.url || null;

        merged[ans.checklist_item_id] = {
          answer_value: ans.answer_value,
          comment: ans.comment ?? undefined,
          photo_url: photoUrl ?? undefined,
          photo_ai_analysis: ans.photo_ai_analysis ?? undefined,
          video_url: videoUrl ?? undefined,
          video_ai_analysis: ans.video_ai_analysis ?? undefined,
          voice_note_id: ans.voice_note_id ?? undefined,
          voice_note_url: voiceNoteUrl ?? undefined,
          voice_transcription: (ans as any).voice_transcription ?? undefined,
        };
      });
      setLocalAnswers((prev) => ({ ...prev, ...merged }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionAnswersJson]);

  // Pre-fill colleague's answers (only for questions the current inspector hasn't answered)
  useEffect(() => {
    if (!colleagueData?.answers?.length || !colleagueData?.colleague) return;
    if (!inspection?.answers) return;

    const myAnsweredIds = new Set(
      (inspection.answers || []).map((a: InspectionAnswer) => a.checklist_item_id)
    );

    const prefilled: Record<number, LocalAnswer> = {};
    const prefilledMeta: Record<number, { name: string; type: string }> = {};

    colleagueData.answers.forEach((ans: any) => {
      const itemId = ans.checklist_item_id;
      // Only pre-fill if I haven't answered this question yet
      if (!myAnsweredIds.has(itemId)) {
        prefilled[itemId] = {
          answer_value: ans.answer_value,
          comment: ans.comment ?? undefined,
          urgency_level: ans.urgency_level ?? 0,
          // Include media from colleague
          photo_url: ans.photo_file?.url || ans.photo_url || undefined,
          photo_ai_analysis: ans.photo_ai_analysis ?? undefined,
          video_url: ans.video_file?.url || ans.video_url || undefined,
          video_ai_analysis: ans.video_ai_analysis ?? undefined,
          voice_note_url: ans.voice_note?.url || ans.voice_note_url || undefined,
          voice_note_id: ans.voice_note_id ?? undefined,
          voice_transcription: ans.voice_transcription ?? undefined,
        };
        prefilledMeta[itemId] = {
          name: colleagueData.colleague!.name,
          type: colleagueData.colleague!.type,
        };
      }
    });

    if (Object.keys(prefilled).length > 0) {
      setLocalAnswers((prev) => {
        // Don't overwrite answers the user has already modified locally
        const merged = { ...prev };
        Object.entries(prefilled).forEach(([key, val]) => {
          const numKey = Number(key);
          if (!merged[numKey]?.answer_value) {
            merged[numKey] = val;
          }
        });
        return merged;
      });
      setPrefilledItems(prefilledMeta);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colleagueData, inspectionAnswersJson]);

  // Batch-save prefilled answers to server so they count as "answered" during submit validation
  const [prefilledSaved, setPrefilledSaved] = useState(false);
  useEffect(() => {
    if (prefilledSaved) return;
    if (Object.keys(prefilledItems).length === 0 || !inspectionId) return;

    const savePrefilledToServer = async () => {
      const entries = Object.entries(localAnswers).filter(
        ([itemId]) => prefilledItems[Number(itemId)]
      );
      if (entries.length === 0) return;

      setPrefilledSaved(true);
      for (const [itemId, answer] of entries) {
        if (answer.answer_value) {
          try {
            await answerMutation.mutateAsync({
              checklist_item_id: Number(itemId),
              answer_value: answer.answer_value,
              comment: answer.comment,
              urgency_level: answer.urgency_level || 0,
            });
          } catch (err) {
            // Silent fail - inspector can still answer manually
            console.warn('Failed to save prefilled answer:', itemId, err);
          }
        }
      }
    };

    // Small delay to let local state settle after prefill
    const timer = setTimeout(savePrefilledToServer, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledItems, inspectionId]);

  // Resume on same question - Load saved index when inspection loads
  useEffect(() => {
    if (inspection?.id && totalItems > 0) {
      const loadSavedIndex = async () => {
        try {
          const savedIndexStr = await AsyncStorage.getItem(`inspection_${inspection.id}_currentIndex`);
          if (savedIndexStr !== null) {
            const savedIndex = parseInt(savedIndexStr, 10);
            // Validate saved index is within bounds
            if (savedIndex >= 0 && savedIndex < totalItems) {
              setCurrentIndex(savedIndex);
            }
          }
        } catch (error) {
          console.error('Failed to load saved inspection index:', error);
        }
      };
      loadSavedIndex();
    }
  }, [inspection?.id, totalItems]);

  // Save current index whenever it changes
  useEffect(() => {
    if (inspection?.id) {
      const saveCurrentIndex = async () => {
        try {
          await AsyncStorage.setItem(`inspection_${inspection.id}_currentIndex`, currentIndex.toString());
        } catch (error) {
          console.error('Failed to save inspection index:', error);
        }
      };
      saveCurrentIndex();
    }
  }, [currentIndex, inspection?.id]);

  // Answer mutation
  const answerMutation = useMutation({
    mutationFn: (payload: { checklist_item_id: number; answer_value: string; comment?: string; voice_note_id?: number; voice_transcription?: { en: string; ar: string }; urgency_level?: number }) =>
      inspectionsApi.answerQuestion(inspectionId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspectionProgress', inspectionId] });
    },
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: () => inspectionsApi.submit(inspectionId!),
    onSuccess: async () => {
      // Clear saved index on submit
      try {
        await AsyncStorage.removeItem(`inspection_${inspectionId}_currentIndex`);
      } catch (error) {
        console.error('Failed to clear saved inspection index:', error);
      }

      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });
      Alert.alert(
        t('inspection.submitted', 'Inspection Submitted'),
        t('inspection.assessmentPending', 'Please provide your operational assessment verdict.'),
        [{ text: 'OK', onPress: () => navigation.replace('Assessment', { id }) }]
      );
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
      // Allow "faulty" as valid input for broken meters
      if (answer === 'faulty' || answer === 'معطل') {
        return 'fail'; // Faulty meter is marked as fail
      }

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

    // Clear pre-filled indicator when inspector makes their own answer
    if (prefilledItems[currentItem.id]) {
      setPrefilledItems(prev => {
        const next = { ...prev };
        delete next[currentItem.id];
        return next;
      });
    }

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
        urgency_level: current?.urgency_level ?? 0,
      });
    }, 500);
  }, [currentItem, answerMutation, localAnswers]);

  // Handle urgency level change
  const handleUrgencyChange = useCallback((level: number) => {
    if (!currentItem) return;

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        urgency_level: level,
      },
    }));

    // Save urgency immediately with existing answer
    const current = localAnswers[currentItem.id];
    if (current?.answer_value) {
      answerMutation.mutate({
        checklist_item_id: currentItem.id,
        answer_value: current.answer_value,
        comment: current?.comment,
        urgency_level: level,
      });
    }
  }, [currentItem, answerMutation, localAnswers]);

  // Navigate to specific index
  const goToIndex = useCallback((index: number) => {
    if (index < 0 || index >= totalItems || index === currentIndex) return;

    // Stop any playing audio immediately before transitioning
    stopAllVoicePlayback();

    // Fade out, swap content off-screen, then slide in
    Animated.timing(cardOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      setCurrentIndex(index);
      slideAnim.setValue(0);
      // Wait for React to render new content, then fade in
      requestAnimationFrame(() => {
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }).start();
      });
    });
  }, [currentIndex, totalItems, slideAnim, cardOpacity]);

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
      goToIndex(currentIndex + 1);
    }
  }, [currentItem, currentIndex, totalItems, goToIndex]);

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

  // Helper to check if item requires media but doesn't have valid combo
  const itemMissingMedia = useCallback((item: ChecklistItem) => {
    const answer = localAnswers[item.id];
    if (!answer?.answer_value) return false; // Unanswered items handled separately

    const questionText = (isArabic && item.question_text_ar)
      ? item.question_text_ar
      : item.question_text;
    const questionTextLower = questionText.toLowerCase();

    // Check if it's a reading question — ONLY exact phrases
    const isReading = questionTextLower.includes('reading') ||
                      questionTextLower.includes('قراءة') ||
                      questionTextLower.includes('عداد') ||
                      questionTextLower.includes('rnr reading') ||
                      questionTextLower.includes('running hours reading') ||
                      questionTextLower.includes('twl count') ||
                      questionTextLower.includes('twist lock count') ||
                      questionTextLower.includes('twistlock count');

    const hasPhoto = !!(answer.photo_url || answer.photo_uri);
    const hasVoice = !!(answer.voice_note_id || answer.voice_note_url);
    const hasVideo = !!(answer.video_file_id || answer.video_url || answer.video_uri);

    // Reading questions require photo
    if (isReading && !hasPhoto) return true;

    // Check validation for this item
    const validation = validateAnswer(item, answer.answer_value);

    // Failed items require (photo + voice) or (video + voice)
    if (validation === 'fail') {
      const hasValidCombo = (hasPhoto && hasVoice) || (hasVideo && hasVoice);
      if (!hasValidCombo) return true;
    }

    return false;
  }, [localAnswers, isArabic, validateAnswer]);

  // Check if all items are complete and offer to go to submit
  const checkAllCompleteAndOfferSubmit = useCallback((updatedAnswers: Record<number, LocalAnswer>) => {
    // Check if all items are answered
    const allAnswered = allChecklistItems.every(item =>
      updatedAnswers[item.id]?.answer_value && !skippedItems.has(item.id)
    );

    if (!allAnswered) return;

    // Check if any items are missing required media (using the updated answers)
    const anyMissingMedia = allChecklistItems.some(item => {
      const answer = updatedAnswers[item.id];
      if (!answer?.answer_value) return false;

      const questionText = (isArabic && item.question_text_ar)
        ? item.question_text_ar
        : item.question_text;
      const questionTextLower = questionText.toLowerCase();

      // Check if it's a reading question — ONLY exact phrases
      const isReading = questionTextLower.includes('reading') ||
                        questionTextLower.includes('قراءة') ||
                        questionTextLower.includes('عداد') ||
                        questionTextLower.includes('rnr reading') ||
                        questionTextLower.includes('running hours reading') ||
                        questionTextLower.includes('twl count') ||
                        questionTextLower.includes('twist lock count') ||
                        questionTextLower.includes('twistlock count');

      const hasPhoto = !!(answer.photo_url || answer.photo_uri);
      const hasVoice = !!(answer.voice_note_id || answer.voice_note_url);
      const hasVideo = !!(answer.video_file_id || answer.video_url || answer.video_uri);

      // Reading questions require photo
      if (isReading && !hasPhoto) return true;

      // Check validation for this item
      const validation = validateAnswer(item, answer.answer_value);

      // Failed items require (photo + voice) or (video + voice)
      if (validation === 'fail') {
        const hasValidCombo = (hasPhoto && hasVoice) || (hasVideo && hasVoice);
        if (!hasValidCombo) return true;
      }

      return false;
    });

    if (anyMissingMedia) return;

    // All complete! Offer to go to submit & assess
    Alert.alert(
      t('inspection.allComplete', 'All Complete!'),
      t('inspection.readyToSubmit', 'All questions are answered with required media. Go to Submit & Assess?'),
      [
        {
          text: t('inspection.goToSubmit', 'Go to Submit & Assess'),
          onPress: () => goToIndex(totalItems - 1), // Go to last question where submit button is
        },
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel',
        },
      ]
    );
  }, [allChecklistItems, skippedItems, isArabic, validateAnswer, goToIndex, totalItems, t]);

  // Find next unanswered or missing-media item starting from a given index
  const findNextIncomplete = useCallback((startFromIndex: number): number => {
    // First check unanswered from startFromIndex onwards
    for (let i = startFromIndex; i < allChecklistItems.length; i++) {
      const item = allChecklistItems[i];
      if (!localAnswers[item.id]?.answer_value || skippedItems.has(item.id)) return i;
    }
    // Then check missing media from startFromIndex onwards
    for (let i = startFromIndex; i < allChecklistItems.length; i++) {
      if (itemMissingMedia(allChecklistItems[i])) return i;
    }
    // Wrap around: check from beginning
    for (let i = 0; i < startFromIndex; i++) {
      const item = allChecklistItems[i];
      if (!localAnswers[item.id]?.answer_value || skippedItems.has(item.id)) return i;
    }
    for (let i = 0; i < startFromIndex; i++) {
      if (itemMissingMedia(allChecklistItems[i])) return i;
    }
    return -1; // All complete
  }, [allChecklistItems, localAnswers, skippedItems, itemMissingMedia]);

  // Navigate to next incomplete item, or go to submit if all done
  const goToNextIncomplete = useCallback(() => {
    const nextIndex = findNextIncomplete(currentIndex + 1);
    if (nextIndex >= 0) {
      goToIndex(nextIndex);
    } else {
      // All done — go to last question where submit button is
      setFixingIncomplete(false);
      goToIndex(totalItems - 1);
    }
  }, [findNextIncomplete, currentIndex, goToIndex, totalItems]);

  // Navigate to next item (skip to next incomplete when fixing validation issues)
  const goToNext = useCallback(() => {
    if (fixingIncomplete) {
      goToNextIncomplete();
    } else {
      goToIndex(currentIndex + 1);
    }
  }, [currentIndex, goToIndex, fixingIncomplete, goToNextIncomplete]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    // Step 1: Check for skipped or unanswered items
    const unanswered = allChecklistItems.filter((item) =>
      !localAnswers[item.id]?.answer_value || skippedItems.has(item.id)
    );

    if (unanswered.length > 0) {
      Alert.alert(
        t('common.warning', 'Warning'),
        `${unanswered.length} ${t('inspection.incompleteCount', 'questions are not answered. Complete all questions before submitting.')}`,
        [
          {
            text: t('inspection.goToFirst', 'Go to first unanswered'),
            onPress: () => {
              const firstUnansweredIndex = allChecklistItems.findIndex(
                item => !localAnswers[item.id]?.answer_value || skippedItems.has(item.id)
              );
              if (firstUnansweredIndex >= 0) {
                setFixingIncomplete(true);
                goToIndex(firstUnansweredIndex);
              }
            }
          },
          { text: t('common.cancel'), style: 'cancel' }
        ]
      );
      return;
    }

    // Step 2: Check for items missing required media
    const missingMedia = allChecklistItems.filter(itemMissingMedia);

    if (missingMedia.length > 0) {
      Alert.alert(
        t('common.warning', 'Warning'),
        `${missingMedia.length} ${t('inspection.missingMedia', 'questions are missing required photo/video/voice. Add media before submitting.')}`,
        [
          {
            text: t('inspection.goToFirstMissing', 'Go to first missing'),
            onPress: () => {
              const firstMissingIndex = allChecklistItems.findIndex(itemMissingMedia);
              if (firstMissingIndex >= 0) {
                setFixingIncomplete(true);
                goToIndex(firstMissingIndex);
              }
            }
          },
          { text: t('common.cancel'), style: 'cancel' }
        ]
      );
      return;
    }

    // Step 3: All complete - confirm submit & assess
    Alert.alert(
      t('inspection.submitAndAssess', 'Submit & Assess'),
      t('inspection.submitAndAssessConfirm', 'All questions are complete. Submit inspection and proceed to assessment?'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('inspection.submitAndAssess', 'Submit & Assess'),
          onPress: () => submitMutation.mutate(),
        },
      ],
    );
  }, [t, submitMutation, allChecklistItems, localAnswers, skippedItems, goToIndex, itemMissingMedia]);

  // Photo upload - show options (Camera or Gallery)
  const handleTakePhoto = useCallback(() => {
    if (!currentItem) return;

    Alert.alert(
      t('inspection.addPhoto', 'Add Photo'),
      t('inspection.choosePhotoSource', 'How would you like to add a photo?'),
      [
        {
          text: t('inspection.takePhoto', 'Take Photo'),
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert(t('common.error'), 'Camera permission is required.');
              return;
            }

            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
            });

            if (!result.canceled && result.assets?.[0]) {
              const asset = result.assets[0];
              uploadPhoto(currentItem.id, asset.uri, asset.fileName || 'photo.jpg');
            }
          },
        },
        {
          text: t('inspection.fromGallery', 'From Gallery'),
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert(t('common.error'), 'Gallery permission is required.');
              return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.7,
            });

            if (!result.canceled && result.assets?.[0]) {
              const asset = result.assets[0];
              uploadPhoto(currentItem.id, asset.uri, asset.fileName || 'photo.jpg');
            }
          },
        },
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel',
        },
      ]
    );
  }, [currentItem, t]);

  const uploadPhoto = useCallback(async (checklistItemId: number, uri: string, fileName: string, retryCount = 0) => {
    const MAX_RETRIES = 2;

    setLocalAnswers((prev) => ({
      ...prev,
      [checklistItemId]: {
        ...prev[checklistItemId],
        photo_uri: uri,
        isUploading: true,
      },
    }));

    try {
      // Read file as base64
      console.log('Reading photo as base64...', uri);
      let base64: string;
      try {
        base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        if (!base64) {
          throw new Error('File read returned empty result');
        }
      } catch (readError: any) {
        console.error('Failed to read photo file:', readError);
        throw new Error(`Could not read photo file: ${readError?.message || 'Unknown error'}`);
      }

      console.log('Uploading photo via base64... length:', base64.length);

      // Upload as JSON with base64
      const response = await getApiClient().post(
        `/api/inspections/${inspectionId}/upload-media`,
        {
          file_base64: base64,
          file_name: fileName || 'photo.jpg',
          file_type: 'image/jpeg',
          checklist_item_id: checklistItemId,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 180000, // 3 minutes
        }
      );

      const result = (response.data as any);
      const data = result?.data;
      const cloudinaryUrl = data?.photo_file?.url || data?.url;
      const aiAnalysis = result?.ai_analysis;
      const extractedReading = result?.extracted_reading;
      const readingValidation = result?.reading_validation;

      // Log the response for debugging
      console.log('Photo upload response:', {
        cloudinaryUrl,
        hasAiAnalysis: !!aiAnalysis,
        analysisFailed: result?.analysis_failed,
        extractedReading,
        readingValidation
      });

      // Update local state with photo URL and AI analysis
      setLocalAnswers((prev) => {
        const updated = {
          ...prev,
          [checklistItemId]: {
            ...prev[checklistItemId],
            photo_uri: undefined,
            photo_url: cloudinaryUrl,
            photo_ai_analysis: aiAnalysis,
            isUploading: false,
            uploadFailed: false,
          },
        };

        // Handle RNR/TWL reading validation
        if (readingValidation) {
          if (!readingValidation.is_valid) {
            // Reading was rejected (less than previous) - show warning
            Alert.alert(
              t('common.warning', 'Warning'),
              readingValidation.rejection_reason ||
              t('inspection.reading_less_than_previous', 'Reading must be greater than previous inspection value'),
              [{ text: 'OK' }]
            );
            // Clear the field so user must re-enter
            updated[checklistItemId].answer_value = '';
          } else if (readingValidation.parsed_value !== null) {
            // Valid reading - always use the extracted value from photo
            const extractedValue = String(readingValidation.parsed_value);
            updated[checklistItemId].answer_value = extractedValue;
            answerMutation.mutate({
              checklist_item_id: checklistItemId,
              answer_value: extractedValue,
            });
            console.log('Auto-filled validated reading:', extractedValue);

            // Show confirmation with previous value
            if (readingValidation.last_reading) {
              Alert.alert(
                t('inspection.readingConfirmed', 'Reading Confirmed'),
                `${t('inspection.extractedValue', 'Extracted')}: ${extractedValue}\n${t('inspection.previousValue', 'Previous')}: ${readingValidation.last_reading}`,
                [{ text: 'OK' }]
              );
            }
          } else if (readingValidation.is_faulty) {
            // Faulty meter
            updated[checklistItemId].answer_value = 'faulty';
            answerMutation.mutate({
              checklist_item_id: checklistItemId,
              answer_value: 'faulty',
            });
            Alert.alert(
              t('inspection.meterFaulty', 'Meter Faulty'),
              t('inspection.meterDetectedFaulty', 'The meter appears to be faulty or unreadable'),
              [{ text: 'OK' }]
            );
          }
        } else if (extractedReading && extractedReading !== 'faulty') {
          // General reading (not RNR/TWL) - auto-fill if empty
          const currentValue = prev[checklistItemId]?.answer_value;
          if (!currentValue || currentValue.trim() === '') {
            updated[checklistItemId].answer_value = extractedReading;
            answerMutation.mutate({
              checklist_item_id: checklistItemId,
              answer_value: extractedReading,
            });
            console.log('Auto-filled reading value:', extractedReading);
          }
        } else if (extractedReading === 'faulty') {
          // If meter is faulty, set value to 'faulty'
          updated[checklistItemId].answer_value = 'faulty';
          answerMutation.mutate({
            checklist_item_id: checklistItemId,
            answer_value: 'faulty',
          });
          console.log('Meter detected as faulty');
        }

        return updated;
      });

      // Log analysis status
      if (aiAnalysis) {
        console.log('Photo AI analysis received:', aiAnalysis);
      } else if (result?.analysis_failed) {
        console.log('Photo uploaded but AI analysis not available');
      }

      queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });

      // Check if all items are now complete after a short delay for state to settle
      setTimeout(() => {
        setLocalAnswers(current => {
          checkAllCompleteAndOfferSubmit(current);
          return current; // Don't modify state, just read it
        });
      }, 500);
    } catch (error: any) {
      // Retry logic for network/timeout errors
      const isRetryableError =
        error?.code === 'ECONNABORTED' ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('Network Error') ||
        !error?.response;

      if (isRetryableError && retryCount < MAX_RETRIES) {
        console.log(`Upload failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        return uploadPhoto(checklistItemId, uri, fileName, retryCount + 1);
      }
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to upload photo';

      // Keep the photo locally even if upload fails - allow user to proceed
      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          // Keep photo_uri so user can see it and proceed
          isUploading: false,
          uploadFailed: true,
        },
      }));

      // Show error with retry option
      Alert.alert(
        t('common.error'),
        `${errorMsg}\n\nPhoto saved locally. Tap "Retry Upload" to try again, or proceed to next question.`,
        [{ text: 'OK' }]
      );
    }
  }, [id, inspectionId, queryClient, t, answerMutation]);

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
        voice_transcription: transcription, // Save transcription to server
      });
    }

    // Check if all items are now complete
    setTimeout(() => {
      setLocalAnswers(currentAnswers => {
        checkAllCompleteAndOfferSubmit(currentAnswers);
        return currentAnswers;
      });
    }, 500);
  }, [currentItem, localAnswers, answerMutation, checkAllCompleteAndOfferSubmit]);

  // Handle voice note deletion
  const handleVoiceNoteDeleted = useCallback(() => {
    if (!currentItem) return;

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        voice_note_id: undefined,
        voice_note_url: undefined,
        voice_transcription: undefined,
      },
    }));
  }, [currentItem]);

  // Handle photo deletion
  const handlePhotoDelete = useCallback(() => {
    if (!currentItem) return;

    Alert.alert(
      t('inspection.deletePhoto', 'Delete Photo'),
      t('inspection.deletePhotoConfirm', 'Are you sure you want to delete this photo?'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setLocalAnswers((prev) => ({
              ...prev,
              [currentItem.id]: {
                ...prev[currentItem.id],
                photo_uri: undefined,
                photo_url: undefined,
                photo_ai_analysis: undefined,
                uploadFailed: false,
              },
            }));
          },
        },
      ]
    );
  }, [currentItem]);

  // Handle video recorded
  const handleVideoRecorded = useCallback((videoFileId: number, aiAnalysis?: { en: string; ar: string }) => {
    if (!currentItem) return;

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        video_file_id: videoFileId,
        video_ai_analysis: aiAnalysis,
      },
    }));

    // Check if all items are now complete after a short delay for state to settle
    setTimeout(() => {
      setLocalAnswers(current => {
        checkAllCompleteAndOfferSubmit(current);
        return current; // Don't modify state, just read it
      });
    }, 500);
  }, [currentItem, checkAllCompleteAndOfferSubmit]);

  // Handle video deletion
  const handleVideoDeleted = useCallback(() => {
    if (!currentItem) return;

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        video_uri: undefined,
        video_url: undefined,
        video_file_id: undefined,
        video_ai_analysis: undefined,
      },
    }));
  }, [currentItem]);

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
          onPress={() => { setFixingIncomplete(false); goToIndex(i); }}
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
          <View>
            <VoiceTextInput
              style={[styles.textInput, val && styles.textInputAnswered]}
              value={val}
              onChangeText={handleAnswer}
              placeholder={t('inspection.answer')}
              multiline
              numberOfLines={3}
            />
            <QuickFill
              onSelect={handleAnswer}
              questionType="text"
              questionContext={currentItem?.question_text}
            />
          </View>
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
        <TouchableOpacity style={styles.errorRetryButton} onPress={() => refetch()}>
          <Text style={styles.errorRetryButtonText}>{t('common.retry')}</Text>
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

  // Check if fail response has required media
  // Valid combinations: (photo + voice) OR (video + voice)
  const hasVoiceNote = !!(currentAnswer?.voice_note_id || currentAnswer?.voice_note_url);
  const hasVideo = !!(currentAnswer?.video_file_id || currentAnswer?.video_url || currentAnswer?.video_uri);
  const hasPhoto = !!photoSource;

  // Valid media = (photo AND voice) OR (video AND voice)
  const hasValidMediaCombo = (hasPhoto && hasVoiceNote) || (hasVideo && hasVoiceNote);
  const isFailWithoutMedia = validation === 'fail' && !hasValidMediaCombo && !isUploading;

  // Check if numeric field is empty (must enter number or "faulty")
  const answerValue = currentAnswer?.answer_value || '';
  const isNumericFieldEmpty = currentItem.answer_type === 'numeric' && !answerValue.trim();

  // Check if this is a "reading" question - these ALWAYS require photo to verify the value
  const questionText = (isArabic && currentItem.question_text_ar)
    ? currentItem.question_text_ar
    : currentItem.question_text;
  const questionTextLower = questionText.toLowerCase();

  // Detect "reading" questions (meter readings that need photo verification)
  // Only exact phrases: "reading" in context, not standalone "rnr" or "twl"
  const isReadingQuestion = questionTextLower.includes('reading') ||
                            questionTextLower.includes('قراءة') ||
                            questionTextLower.includes('عداد');

  // RNR (Running Hours) detection — ONLY exact phrases
  const isRNRQuestion = questionTextLower.includes('rnr reading') ||
                        questionTextLower.includes('running hours reading') ||
                        questionTextLower.includes('running hour reading') ||
                        questionTextLower.includes('ساعات التشغيل');

  // TWL (Twistlock Count) detection — ONLY exact phrases
  const isTWLQuestion = questionTextLower.includes('twl count') ||
                        questionTextLower.includes('twist lock count') ||
                        questionTextLower.includes('twistlock count') ||
                        questionTextLower.includes('عدد التويست لوك');

  // Any question requiring photo verification (reading, RNR, TWL)
  const requiresPhotoVerification = isReadingQuestion || isRNRQuestion || isTWLQuestion;
  const isReadingWithoutPhoto = requiresPhotoVerification && !hasPhoto && !isUploading;

  // Can proceed if: not fail without valid media combo AND not empty numeric field AND not reading without photo AND not uploading
  const canProceedToNext = !isFailWithoutMedia && !isNumericFieldEmpty && !isReadingWithoutPhoto && !isUploading;

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

  // Check if there are incomplete items (unanswered or missing media) elsewhere
  const hasIncompleteElsewhere = allChecklistItems.some((item, idx) => {
    if (idx === currentIndex) return false; // Skip current
    if (!localAnswers[item.id]?.answer_value || skippedItems.has(item.id)) return true;
    return itemMissingMedia(item);
  });

  return (
    <View style={styles.container}>
      {/* Header with equipment info and buttons */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.exitButton}
            onPress={() => {
              Alert.alert(
                t('inspection.exitTitle', 'Exit Inspection?'),
                t('inspection.exitMessage', 'Your progress is saved. You can resume later from assignments.'),
                [
                  { text: t('common.cancel', 'Cancel'), style: 'cancel' },
                  {
                    text: t('inspection.exit', 'Exit'),
                    style: 'destructive',
                    onPress: () => navigation.goBack()
                  }
                ]
              );
            }}
          >
            <Text style={styles.exitButtonText}>← {t('inspection.exit', 'Exit')}</Text>
          </TouchableOpacity>
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

      {/* Colleague pre-fill banner */}
      {Object.keys(prefilledItems).length > 0 && colleagueData?.colleague && (
        <View style={styles.colleagueBanner}>
          <Text style={styles.colleagueBannerText}>
            👥 {Object.keys(prefilledItems).length} {t('inspection.questionsPrefilledBy', 'questions pre-filled by')} {colleagueData.colleague.type === 'mechanical' ? t('inspection.mechInspector', 'Mech Inspector') : t('inspection.elecInspector', 'Elec Inspector')}
          </Text>
        </View>
      )}


      {/* Question card with animation */}
      <Animated.View style={[styles.questionCard, { opacity: cardOpacity }]}>
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

          {/* Pre-filled from colleague indicator */}
          {currentItem && prefilledItems[currentItem.id] && (
            <View style={styles.prefilledBadge}>
              <Text style={styles.prefilledBadgeText}>
                👤 {t('inspection.prefilledFrom', 'Pre-filled from')} {prefilledItems[currentItem.id].type === 'mechanical' ? t('inspection.mechInspector', 'Mech Inspector') : t('inspection.elecInspector', 'Elec Inspector')}: {prefilledItems[currentItem.id].name}
              </Text>
            </View>
          )}

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

          {/* Urgency Level Selector */}
          <View style={styles.urgencySection}>
            <Text style={styles.urgencyLabel}>
              {t('inspection.urgencyLevel', 'Urgency Level')}
            </Text>
            <View style={styles.urgencyRow}>
              {([
                { level: 0, label: t('inspection.urgencyOk', 'OK'), color: '#4CAF50', bgColor: '#E8F5E9' },
                { level: 1, label: t('inspection.urgencyMonitor', 'Monitor'), color: '#FF9800', bgColor: '#FFF3E0' },
                { level: 2, label: t('inspection.urgencyAttention', 'Attention'), color: '#FF5722', bgColor: '#FBE9E7' },
                { level: 3, label: t('inspection.urgencyCritical', 'Critical'), color: '#F44336', bgColor: '#FFEBEE' },
              ] as const).map(({ level, label, color, bgColor }) => {
                const isActive = (currentAnswer?.urgency_level ?? 0) === level;
                return (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.urgencyButton,
                      { borderColor: color },
                      isActive && { backgroundColor: color },
                    ]}
                    onPress={() => handleUrgencyChange(level)}
                  >
                    <Text
                      style={[
                        styles.urgencyButtonText,
                        { color: color },
                        isActive && { color: '#fff' },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Media section - Photo, Video, Voice */}
          <View style={styles.mediaSection}>
            {/* Photo Row */}
            <View style={styles.mediaSectionRow}>
              <TouchableOpacity
                style={[styles.mediaButton, isUploading && styles.buttonDisabled]}
                onPress={handleTakePhoto}
                disabled={isUploading}
              >
                <Text style={styles.mediaButtonText}>📷</Text>
              </TouchableOpacity>

              {photoSource && (
                <View style={styles.mediaPreviewContainer}>
                  <View style={styles.photoContainer}>
                    <Image source={{ uri: photoSource }} style={styles.photoPreview} resizeMode="cover" />
                    {isUploading && (
                      <View style={styles.uploadOverlay}>
                        <ActivityIndicator color="#fff" size="large" />
                        <Text style={styles.uploadingText}>{t('inspection.uploadingPhoto', 'Uploading...')}</Text>
                      </View>
                    )}
                    {currentAnswer?.uploadFailed && currentAnswer?.photo_uri && (
                      <TouchableOpacity
                        style={styles.retryButtonSmall}
                        onPress={() => uploadPhoto(currentItem.id, currentAnswer.photo_uri!, currentItem.id + '.jpg')}
                      >
                        <Text style={styles.retryButtonTextSmall}>🔄</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Annotate button */}
                  <TouchableOpacity
                    style={styles.annotateButton}
                    onPress={() => {
                      navigation.navigate('PhotoAnnotation', {
                        imageUri: photoSource,
                        returnScreen: 'InspectionWizard',
                        returnParams: { id },
                      });
                    }}
                    disabled={isUploading}
                  >
                    <Text style={styles.annotateButtonIcon}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.mediaDeleteButton}
                    onPress={handlePhotoDelete}
                  >
                    <Text style={styles.deleteIconSmall}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!photoSource && !isUploading && (
                <Text style={styles.mediaHintText}>{t('inspection.tapToAddPhoto', 'Tap to add photo')}</Text>
              )}
            </View>

            {/* Photo AI Analysis - OUTSIDE the row for full width */}
            {currentAnswer?.photo_ai_analysis && (
              <View style={styles.aiAnalysisBox}>
                <Text style={styles.aiAnalysisLabel}>🤖 {t('inspection.photoAiAnalysis', 'Photo AI Analysis')}:</Text>
                {currentAnswer.photo_ai_analysis.en && (
                  <Text style={styles.aiAnalysisText}>
                    {currentAnswer.photo_ai_analysis.en}
                  </Text>
                )}
                {currentAnswer.photo_ai_analysis.ar && (
                  <Text style={[styles.aiAnalysisText, styles.aiAnalysisTextAr]}>
                    {currentAnswer.photo_ai_analysis.ar}
                  </Text>
                )}
              </View>
            )}

            {/* Video Row */}
            <VideoRecorder
              onVideoRecorded={handleVideoRecorded}
              onVideoDeleted={handleVideoDeleted}
              existingVideoUrl={currentAnswer?.video_url}
              disabled={isUploading}
            />

            {/* Video AI Analysis - Full width below video */}
            {currentAnswer?.video_ai_analysis && (
              <View style={styles.aiAnalysisBox}>
                <Text style={styles.aiAnalysisLabel}>🎥 {t('inspection.videoAiAnalysis', 'Video AI Analysis')}:</Text>
                {currentAnswer.video_ai_analysis.en && (
                  <Text style={styles.aiAnalysisText}>
                    {currentAnswer.video_ai_analysis.en}
                  </Text>
                )}
                {currentAnswer.video_ai_analysis.ar && (
                  <Text style={[styles.aiAnalysisText, styles.aiAnalysisTextAr]}>
                    {currentAnswer.video_ai_analysis.ar}
                  </Text>
                )}
              </View>
            )}

            {/* Voice note Row */}
            <VoiceNoteRecorder
              onVoiceNoteRecorded={handleVoiceNoteRecorded}
              onVoiceNoteDeleted={handleVoiceNoteDeleted}
              existingVoiceUrl={currentAnswer?.voice_note_url}
              existingTranscription={currentAnswer?.voice_transcription}
              disabled={isUploading}
              language={i18n.language}
            />
          </View>

          {/* Validation warning for failed items - need (photo+voice) or (video+voice) */}
          {validation === 'fail' && !hasValidMediaCombo && (
            <View style={styles.validationWarning}>
              <Text style={styles.warningText}>
                ⚠️ {t('inspection.fail_requires_media_combo', 'Failed items require (Photo + Voice) or (Video + Voice)')}
              </Text>
            </View>
          )}

          {/* Validation warning for reading questions without photo */}
          {requiresPhotoVerification && !hasPhoto && (
            <View style={styles.validationWarning}>
              <Text style={styles.warningText}>
                📸 {t('inspection.reading_requires_photo', 'Photo required to verify meter reading')}
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Warning if fail without valid media combo */}
      {isFailWithoutMedia && (
        <View style={styles.requiredMediaWarning}>
          <Text style={styles.requiredMediaWarningText}>
            ⚠️ {t('inspection.fail_requires_media_combo_proceed', 'Failed items require (Photo + Voice) or (Video + Voice) to proceed')}
          </Text>
        </View>
      )}

      {/* Warning if numeric field is empty */}
      {isNumericFieldEmpty && (
        <View style={styles.requiredMediaWarning}>
          <Text style={styles.requiredMediaWarningText}>
            ⚠️ {t('inspection.numeric_required', 'Enter a number or type "faulty" if meter is broken')}
          </Text>
        </View>
      )}

      {/* Warning if reading question without photo */}
      {isReadingWithoutPhoto && (
        <View style={styles.requiredMediaWarning}>
          <Text style={styles.requiredMediaWarningText}>
            📸 {t('inspection.reading_photo_required', 'Photo required to verify meter reading')}
          </Text>
        </View>
      )}

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

        {currentIndex === totalItems - 1 ? (
          // On the Submit page: show "Next Missing" if incomplete, else show Submit
          (() => {
            const incompleteIndex = findNextIncomplete(0);
            if (incompleteIndex >= 0) {
              // There are incomplete items — show button to jump there
              return (
                <TouchableOpacity
                  style={[styles.navButton, styles.navButtonWarning]}
                  onPress={() => goToIndex(incompleteIndex)}
                >
                  <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>
                    {t('inspection.goToMissing', 'Go to Missing →')}
                  </Text>
                </TouchableOpacity>
              );
            }
            // All complete — show Submit button
            return (
              <TouchableOpacity
                style={[styles.submitButton, submitMutation.isPending && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('inspection.submitAndAssess', 'Submit & Assess')}</Text>
                )}
              </TouchableOpacity>
            );
          })()
        ) : (
          // During inspection: normal Next button
          <TouchableOpacity
            style={[
              styles.navButton,
              styles.navButtonPrimary,
              !canProceedToNext && styles.navButtonDisabled,
            ]}
            onPress={goToNext}
            disabled={!canProceedToNext}
          >
            <Text style={[
              styles.navButtonText,
              styles.navButtonTextPrimary,
              !canProceedToNext && styles.navButtonTextDisabled,
            ]}>
              →
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Notes floating button */}
      {inspectionId && (
        <QuickNotes
          inspectionId={inspectionId}
          currentQuestionId={currentItem?.id}
          currentQuestionText={
            isArabic && currentItem?.question_text_ar
              ? currentItem.question_text_ar
              : currentItem?.question_text
          }
          showFloatingButton={true}
        />
      )}
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
  exitButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  exitButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
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
  colleagueBanner: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  colleagueBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1565C0',
    textAlign: 'center',
  },
  prefilledBadge: {
    backgroundColor: '#E8F4FD',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefilledBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1565C0',
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
    flexWrap: 'wrap',
    gap: 10,
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
  // ─── Urgency Selector ───
  urgencySection: {
    marginBottom: 16,
  },
  urgencyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
    marginBottom: 8,
  },
  urgencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  urgencyButton: {
    minWidth: 70,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    flexGrow: 1,
    flexBasis: '22%',
    marginBottom: 4,
  },
  urgencyButtonText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  mediaSection: {
    marginBottom: 16,
    gap: 8,
  },
  mediaSectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  mediaButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E0F2F1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.2)',
  },
  mediaButtonText: {
    fontSize: 24,
  },
  mediaHintText: {
    fontSize: 14,
    color: '#999',
    alignSelf: 'center',
  },
  mediaPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    position: 'relative',
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  mediaDeleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ff4d4f',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.2)',
  },
  annotateButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1677ff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.2)',
  },
  annotateButtonIcon: {
    fontSize: 14,
  },
  deleteIconSmall: {
    fontSize: 14,
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
  uploadingText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '600',
  },
  retryButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  retryButtonSmall: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#FF9800',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3)',
  },
  retryButtonTextSmall: {
    color: '#fff',
    fontSize: 16,
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
  requiredMediaWarning: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  requiredMediaWarningText: {
    fontSize: 13,
    color: '#c62828',
    fontWeight: '600',
    textAlign: 'center',
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
  navButtonWarning: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
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
  skipButtonDisabled: {
    opacity: 0.4,
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
  errorRetryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  errorRetryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  noItemsText: {
    fontSize: 14,
    color: '#999',
  },
  aiAnalysisBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1677ff',
  },
  aiAnalysisLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1677ff',
    marginBottom: 6,
  },
  aiAnalysisText: {
    fontSize: 13,
    color: '#262626',
    lineHeight: 18,
    marginBottom: 4,
  },
  aiAnalysisTextAr: {
    textAlign: 'right',
    fontFamily: 'System',
  },
});
