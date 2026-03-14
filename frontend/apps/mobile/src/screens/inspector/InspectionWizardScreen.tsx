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
import { compressImage } from '../../utils/compress-image';
import { Video, ResizeMode } from 'expo-av';
import VoiceTextInput from '../../components/VoiceTextInput';
import VoiceNoteRecorder, { stopAllVoicePlayback, stopAllVoiceRecording } from '../../components/VoiceNoteRecorder';
import VideoRecorder from '../../components/VideoRecorder';
import PhotoGallery from '../../components/PhotoGallery';
import { Photo } from '../../components/PhotoThumbnailGrid';
import { QuickFill } from '../../components/inspection/AnswerTemplates';
import { QuickNotes } from '../../components/inspection/QuickNotes';

import { useQueryClient } from '@tanstack/react-query';
import { useOfflineMutation } from '../../hooks/useOfflineMutation';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import {
  inspectionsApi,
  equipmentApi,
  Inspection,
  InspectionAnswer,
  ChecklistItem,
  InspectionProgress,
  getApiClient,
  aiApi,
} from '@inspection/shared';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { useOffline } from '../../providers/OfflineProvider';
import { syncManager } from '../../utils/sync-manager';
import { useTTS } from '../../providers/TTSProvider';
import StaleDataBanner from '../../components/StaleDataBanner';

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
  const { speak, stop, isSpeaking, setReadable } = useTTS();
  const { isOnline } = useOffline();
  const [pendingPhotoItems, setPendingPhotoItems] = useState<Set<number>>(new Set());
  const [skippedItems, setSkippedItems] = useState<Set<number>>(new Set());
  const [fixingIncomplete, setFixingIncomplete] = useState(false);
  const [mediaExpanded, setMediaExpanded] = useState(false);
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

  // Clear queued badge when photos have been synced (photo_url appears in server data)
  useEffect(() => {
    if (!inspection?.answers) return;
    setPendingPhotoItems(prev => {
      const updated = new Set(prev);
      let changed = false;
      for (const itemId of prev) {
        const serverAnswer = (inspection.answers as any[])?.find((a: any) => a.checklist_item_id === itemId);
        if (serverAnswer?.photo_file?.url || serverAnswer?.photo_url) {
          updated.delete(itemId);
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, [inspection?.answers]);

  // Determine inspector's category — from inspection response (always available)
  // Falls back to colleague data if inspection doesn't have it
  const inspectorCategory = useMemo(() => {
    const fromInspection = (inspection as any)?.inspector_category;
    if (fromInspection === 'mechanical' || fromInspection === 'electrical') return fromInspection;
    // Fallback: derive from colleague type
    const colType = colleagueData?.colleague?.type;
    if (colType === 'electrical') return 'mechanical';
    if (colType === 'mechanical') return 'electrical';
    return null;
  }, [inspection, colleagueData]);

  // Get all checklist items — smart ordered by inspector's category
  const allChecklistItems = useMemo(() => {
    if (!inspection) return [];
    const rawChecklistItems: ChecklistItem[] = (inspection as any).checklist_items ?? [];
    const itemsFromAnswers: ChecklistItem[] = (inspection.answers ?? [])
      .map((a: InspectionAnswer) => a.checklist_item)
      .filter((item): item is ChecklistItem => item !== null);
    const allItems = [...rawChecklistItems, ...itemsFromAnswers];
    const deduplicated = Array.from(
      new Map(allItems.map((item) => [item.id, item])).values(),
    );

    // If we know the inspector's category, sort: own category first, then null, then other
    if (inspectorCategory) {
      const otherCategory = inspectorCategory === 'mechanical' ? 'electrical' : 'mechanical';
      const own: ChecklistItem[] = [];
      const shared: ChecklistItem[] = [];
      const other: ChecklistItem[] = [];
      for (const item of deduplicated) {
        const cat = (item as any).category;
        if (cat === inspectorCategory) own.push(item);
        else if (cat === otherCategory) other.push(item);
        else shared.push(item);
      }
      own.sort((a, b) => a.order_index - b.order_index);
      shared.sort((a, b) => a.order_index - b.order_index);
      other.sort((a, b) => a.order_index - b.order_index);
      return [...own, ...shared, ...other];
    }

    return deduplicated.sort((a, b) => a.order_index - b.order_index);
  }, [inspection, inspectorCategory]);

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

  // ── Improvement 4: Defect History Warning Badge ──
  const equipmentId = inspection?.equipment_id;
  const { data: itemHistoryData } = useOfflineQuery({
    queryKey: ['checklist-item-history', equipmentId],
    queryFn: async () => {
      const res = await inspectionsApi.getChecklistItemHistory(equipmentId!);
      return (res.data as any)?.data ?? res.data;
    },
    cacheKey: `checklist-item-history-${equipmentId}`,
    enabled: !!equipmentId,
  });
  const itemHistory: Record<string, { fail_count: number; total_count: number; has_active_defect: boolean; last_failed_at: string | null; severity: string | null; occurrence_count: number }> = itemHistoryData ?? {};

  // ── Improvement 5: Smart Reading Anomaly Alert ──
  const { data: readingStatsData } = useOfflineQuery({
    queryKey: ['reading-stats', equipmentId],
    queryFn: async () => {
      const res = await equipmentApi.getReadingStats(equipmentId!, 'rnr');
      return (res.data as any)?.data ?? res.data;
    },
    cacheKey: `reading-stats-${equipmentId}`,
    enabled: !!equipmentId,
  });
  const readingStats: { count: number; avg: number; min: number; max: number; stddev: number; last_value: number; reading_type: string; days: number } | null = readingStatsData ?? null;

  // ── Improvement 6: Auto-Urgency Suggestion ──
  const [autoSuggestedUrgency, setAutoSuggestedUrgency] = useState<Record<number, number>>({});

  // ── Improvement 7: Timer & Pace Indicator ──
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const inspectionStartedAt = inspection?.started_at;
  // Get deadline from the assignment data (cast as any since it may come from a broader response)
  const assignmentDeadline = (inspection as any)?.assignment?.deadline ?? (inspection as any)?.deadline ?? null;

  useEffect(() => {
    if (!inspectionStartedAt) return;
    const startTime = new Date(inspectionStartedAt).getTime();
    // Set initial elapsed
    setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 30000);
    return () => clearInterval(interval);
  }, [inspectionStartedAt]);

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
      setLocalAnswers((prev) => {
        const result = { ...prev };
        inspection.answers!.forEach((ans: InspectionAnswer) => {
          // Skip ad-hoc findings (no checklist item)
          if (!ans.checklist_item_id) return;
          const itemId = ans.checklist_item_id;
          const photoUrl = (ans.photo_file as any)?.url || null;
          const videoUrl = (ans.video_file as any)?.url || null;
          const voiceNoteUrl = (ans.voice_note as any)?.url || null;

          // Deep merge: preserve local-only fields (urgency_level, local URIs, etc.)
          result[itemId] = {
            ...prev[itemId],  // Keep existing local fields
            answer_value: ans.answer_value,
            comment: ans.comment ?? prev[itemId]?.comment,
            urgency_level: (ans as any).urgency_level ?? prev[itemId]?.urgency_level,
            photo_url: photoUrl ?? prev[itemId]?.photo_url,
            photo_ai_analysis: ans.photo_ai_analysis ?? prev[itemId]?.photo_ai_analysis,
            video_url: videoUrl ?? prev[itemId]?.video_url,
            video_ai_analysis: ans.video_ai_analysis ?? prev[itemId]?.video_ai_analysis,
            voice_note_id: ans.voice_note_id ?? prev[itemId]?.voice_note_id,
            voice_note_url: voiceNoteUrl ?? prev[itemId]?.voice_note_url,
            voice_transcription: (ans as any).voice_transcription ?? prev[itemId]?.voice_transcription,
          };
        });
        return result;
      });
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
          urgency_level: ans.urgency_level,
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
              urgency_level: answer.urgency_level,
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

  // Register current question as readable content for TTS (FAB + inline icon)
  useEffect(() => {
    if (!currentItem) return;
    const text = (isArabic && currentItem.question_text_ar)
      ? currentItem.question_text_ar
      : currentItem.question_text;
    setReadable(text);
  }, [currentItem, isArabic, setReadable]);

  // Load local answer draft from AsyncStorage (fills gap for answers not yet debounce-saved to server)
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    if (!inspectionId || draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    AsyncStorage.getItem(`inspection_${inspectionId}_draft`)
      .then((raw) => {
        if (!raw) return;
        try {
          const draft = JSON.parse(raw) as Record<number, LocalAnswer>;
          // Merge draft into state; server seeding (below) will override confirmed answers
          setLocalAnswers((prev) => ({ ...draft, ...prev }));
        } catch {}
      })
      .catch(() => {});
  }, [inspectionId]);

  // Save local answers to AsyncStorage on every change as a safety draft
  useEffect(() => {
    if (!inspectionId || Object.keys(localAnswers).length === 0) return;
    AsyncStorage.setItem(`inspection_${inspectionId}_draft`, JSON.stringify(localAnswers)).catch(() => {});
  }, [localAnswers, inspectionId]);

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

  // Answer mutation (offline-capable)
  const answerMutation = useOfflineMutation({
    mutationFn: (payload: { checklist_item_id: number; answer_value: string; comment?: string; voice_note_id?: number; voice_transcription?: { en: string; ar: string }; urgency_level?: number }) =>
      inspectionsApi.answerQuestion(inspectionId!, payload),
    offlineConfig: {
      type: 'answer-question' as any,
      endpoint: `/api/inspections/${inspectionId}/answer`,
      method: 'POST',
    },
    invalidateKeys: [['inspectionProgress', inspectionId]],
  });

  // Submit mutation (offline-capable)
  const submitMutation = useOfflineMutation({
    mutationFn: () => inspectionsApi.submit(inspectionId!),
    offlineConfig: {
      type: 'submit-inspection' as any,
      endpoint: `/api/inspections/${inspectionId}/submit`,
      method: 'POST',
    },
    invalidateKeys: [['myAssignments'], ['inspection', 'by-assignment', id]],
    onSuccess: async () => {
      // Clear saved index and draft on submit
      try {
        await AsyncStorage.removeItem(`inspection_${inspectionId}_currentIndex`);
        await AsyncStorage.removeItem(`inspection_${inspectionId}_draft`);
      } catch (error) {
        console.error('Failed to clear saved inspection data:', error);
      }

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

    // If choosing pass/yes, reset urgency to 0 (can't have urgency on passing item)
    const isPassing = (currentItem.answer_type === 'pass_fail' && value === 'pass') ||
                      (currentItem.answer_type === 'yes_no' && value === 'yes');
    if (isPassing) {
      setLocalAnswers((prev) => ({
        ...prev,
        [currentItem.id]: {
          ...prev[currentItem.id],
          answer_value: value,
          urgency_level: 0,
          skipped: false,
        },
      }));

      answerMutation.mutate({
        checklist_item_id: currentItem.id,
        answer_value: value,
        comment: localAnswers[currentItem.id]?.comment,
        urgency_level: 0,
      });
      return;
    }

    // ── Improvement 6: Auto-Urgency Suggestion on Fail/No ──
    const isFailing = (currentItem.answer_type === 'pass_fail' && value === 'fail') ||
                      (currentItem.answer_type === 'yes_no' && value === 'no');
    let suggestedUrgency: number | undefined;
    if (isFailing) {
      const history = itemHistory[String(currentItem.id)];
      const colleagueAnswer = colleagueData?.answers?.find((a: any) => a.checklist_item_id === currentItem.id);
      const colleagueUrgency = colleagueAnswer?.urgency_level;

      if (history?.has_active_defect) {
        suggestedUrgency = 3; // Critical
      } else if (history && history.fail_count >= 2) {
        suggestedUrgency = 2; // Needs Attention
      } else if (typeof colleagueUrgency === 'number' && colleagueUrgency >= 2) {
        suggestedUrgency = colleagueUrgency;
      } else {
        suggestedUrgency = 1; // Monitor
      }
      setAutoSuggestedUrgency(prev => ({ ...prev, [currentItem.id]: suggestedUrgency! }));
    }

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        answer_value: value,
        skipped: false,
        ...(suggestedUrgency !== undefined && prev[currentItem.id]?.urgency_level === undefined
          ? { urgency_level: suggestedUrgency }
          : {}),
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
        urgency_level: suggestedUrgency !== undefined && current?.urgency_level === undefined
          ? suggestedUrgency
          : current?.urgency_level,
      });
    }, 500);
  }, [currentItem, answerMutation, localAnswers, itemHistory, colleagueData]);

  // Handle urgency level change
  const handleUrgencyChange = useCallback((level: number) => {
    if (!currentItem) return;

    // If urgency > 0, force answer to fail/no (can't have urgency on a passing item)
    let forcedAnswer: string | undefined;
    if (level > 0) {
      if (currentItem.answer_type === 'pass_fail') forcedAnswer = 'fail';
      else if (currentItem.answer_type === 'yes_no') forcedAnswer = 'no';
    }

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        urgency_level: level,
        ...(forcedAnswer ? { answer_value: forcedAnswer } : {}),
      },
    }));

    // Save urgency immediately with existing answer
    const current = localAnswers[currentItem.id];
    const answerValue = forcedAnswer || current?.answer_value;
    if (answerValue) {
      answerMutation.mutate({
        checklist_item_id: currentItem.id,
        answer_value: answerValue,
        comment: current?.comment,
        urgency_level: level,
      });
    }
  }, [currentItem, answerMutation, localAnswers]);

  // Navigate to specific index
  const goToIndex = useCallback((index: number) => {
    if (index < 0 || index >= totalItems || index === currentIndex) return;

    // Stop any playing audio and active recording before transitioning
    stopAllVoicePlayback();
    stopAllVoiceRecording();

    // Fade out, swap content off-screen, then slide in
    Animated.timing(cardOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      setCurrentIndex(index);
      setMediaExpanded(false);
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

  // Can current item be skipped? Only "other category" items can be skipped
  const canSkipCurrent = useMemo(() => {
    if (!currentItem || !inspectorCategory) return false;
    const cat = (currentItem as any).category;
    const otherCategory = inspectorCategory === 'mechanical' ? 'electrical' : 'mechanical';
    return cat === otherCategory;
  }, [currentItem, inspectorCategory]);

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
    const otherCategory = inspectorCategory === 'mechanical' ? 'electrical'
      : inspectorCategory === 'electrical' ? 'mechanical' : null;
    const allAnswered = allChecklistItems.every(item => {
      // Skipped items are OK
      if (skippedItems.has(item.id)) return true;
      // Other category items that are unanswered are OK (they're skippable)
      if (otherCategory && (item as any).category === otherCategory && !updatedAnswers[item.id]?.answer_value) return true;
      // Must be answered
      return !!updatedAnswers[item.id]?.answer_value;
    });

    if (!allAnswered) return;

    // Check if any items are missing urgency level
    const anyMissingUrgency = allChecklistItems.some(item =>
      updatedAnswers[item.id]?.answer_value && !skippedItems.has(item.id) &&
      updatedAnswers[item.id]?.urgency_level === undefined
    );

    if (anyMissingUrgency) return;

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

  // Check if an answered item is missing urgency level
  const itemMissingUrgency = useCallback((item: ChecklistItem) => {
    const answer = localAnswers[item.id];
    return !!answer?.answer_value && !skippedItems.has(item.id) && answer?.urgency_level === undefined;
  }, [localAnswers, skippedItems]);

  // Find next unanswered or missing-media/urgency item starting from a given index
  const findNextIncomplete = useCallback((startFromIndex: number): number => {
    // First check unanswered from startFromIndex onwards
    for (let i = startFromIndex; i < allChecklistItems.length; i++) {
      const item = allChecklistItems[i];
      if (!localAnswers[item.id]?.answer_value || skippedItems.has(item.id)) return i;
    }
    // Then check missing media or urgency from startFromIndex onwards
    for (let i = startFromIndex; i < allChecklistItems.length; i++) {
      if (itemMissingMedia(allChecklistItems[i]) || itemMissingUrgency(allChecklistItems[i])) return i;
    }
    // Wrap around: check from beginning
    for (let i = 0; i < startFromIndex; i++) {
      const item = allChecklistItems[i];
      if (!localAnswers[item.id]?.answer_value || skippedItems.has(item.id)) return i;
    }
    for (let i = 0; i < startFromIndex; i++) {
      if (itemMissingMedia(allChecklistItems[i]) || itemMissingUrgency(allChecklistItems[i])) return i;
    }
    return -1; // All complete
  }, [allChecklistItems, localAnswers, skippedItems, itemMissingMedia, itemMissingUrgency]);

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

    // Step 1.5: Check for items missing urgency level
    const missingUrgency = allChecklistItems.filter((item) =>
      localAnswers[item.id]?.answer_value && !skippedItems.has(item.id) &&
      localAnswers[item.id]?.urgency_level === undefined
    );

    if (missingUrgency.length > 0) {
      Alert.alert(
        t('common.warning', 'Warning'),
        `${missingUrgency.length} ${t('inspection.missingUrgency', 'questions are missing urgency level. Set urgency for all questions before submitting.')}`,
        [
          {
            text: t('inspection.goToFirst', 'Go to first missing'),
            onPress: () => {
              const firstMissingIndex = allChecklistItems.findIndex((item) =>
                localAnswers[item.id]?.answer_value && !skippedItems.has(item.id) &&
                localAnswers[item.id]?.urgency_level === undefined
              );
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

    // Compress image before anything (resize to 1920px, quality 0.65)
    const compressedUri = await compressImage(uri);

    setLocalAnswers((prev) => ({
      ...prev,
      [checklistItemId]: {
        ...prev[checklistItemId],
        photo_uri: compressedUri,
        isUploading: !isOnline ? false : true,
      },
    }));

    // ─── Offline: copy to permanent storage and queue for later upload ────────
    if (!isOnline && inspectionId) {
      try {
        const dir = `${FileSystem.documentDirectory}offline-photos/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const safeFileName = fileName || `photo_${checklistItemId}_${Date.now()}.jpg`;
        const permanentUri = compressedUri.startsWith(FileSystem.documentDirectory!)
          ? compressedUri
          : `${dir}${safeFileName}`;
        if (!compressedUri.startsWith(FileSystem.documentDirectory!)) {
          await FileSystem.copyAsync({ from: compressedUri, to: permanentUri });
        }
        await syncManager.enqueueInspectionMedia({
          mediaType: 'photo',
          localUri: permanentUri,
          inspectionId,
          checklistItemId,
          assignmentId: String(id),
          fileName: safeFileName,
        });
        setLocalAnswers(prev => ({
          ...prev,
          [checklistItemId]: { ...prev[checklistItemId], photo_uri: permanentUri, isUploading: false },
        }));
        setPendingPhotoItems(prev => new Set(prev).add(checklistItemId));
      } catch (offlineErr) {
        console.error('Failed to queue photo offline:', offlineErr);
        Alert.alert('Storage Error', 'Could not save photo offline. Please free up space and try again.');
      }
      return;
    }
    // ─── End offline branch ───────────────────────────────────────────────────

    try {
      // Upload compressed photo via multipart FormData (much faster than base64 JSON)
      if (__DEV__) console.log('Uploading compressed photo via FormData...', compressedUri);

      const formData = new FormData();
      formData.append('file', {
        uri: compressedUri,
        name: fileName || 'photo.jpg',
        type: 'image/jpeg',
      } as any);
      formData.append('checklist_item_id', String(checklistItemId));

      const response = await getApiClient().post(
        `/api/inspections/${inspectionId}/upload-media`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000, // 2 minutes (compressed photos are much smaller)
        }
      );

      const result = (response.data as any);
      const data = result?.data;
      const cloudinaryUrl = data?.photo_file?.url || data?.url;
      const aiAnalysis = result?.ai_analysis;
      const extractedReading = result?.extracted_reading;
      const readingValidation = result?.reading_validation;

      // Log the response for debugging
      if (__DEV__) console.log('Photo upload response:', {
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
              urgency_level: prev[checklistItemId]?.urgency_level,
            });
            if (__DEV__) console.log('Auto-filled validated reading:', extractedValue);

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
              urgency_level: prev[checklistItemId]?.urgency_level,
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
              urgency_level: prev[checklistItemId]?.urgency_level,
            });
            if (__DEV__) console.log('Auto-filled reading value:', extractedReading);
          }
        } else if (extractedReading === 'faulty') {
          // If meter is faulty, set value to 'faulty'
          updated[checklistItemId].answer_value = 'faulty';
          answerMutation.mutate({
            checklist_item_id: checklistItemId,
            answer_value: 'faulty',
            urgency_level: prev[checklistItemId]?.urgency_level,
          });
          if (__DEV__) console.log('Meter detected as faulty');
        }

        return updated;
      });

      // Log analysis status
      if (aiAnalysis) {
        if (__DEV__) console.log('Photo AI analysis received:', aiAnalysis);
      } else if (result?.analysis_failed) {
        if (__DEV__) console.log('Photo uploaded but AI analysis not available');
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
        if (__DEV__) console.log(`Upload failed, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        return uploadPhoto(checklistItemId, compressedUri, fileName, retryCount + 1);
      }
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to upload photo';

      // Fallback: queue photo for offline sync if upload failed
      if (inspectionId) {
        try {
          const dir = `${FileSystem.documentDirectory}offline-photos/`;
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          const safeFileName = fileName || `photo_${checklistItemId}_${Date.now()}.jpg`;
          const permanentUri = `${dir}${safeFileName}`;
          await FileSystem.copyAsync({ from: compressedUri, to: permanentUri });
          await syncManager.enqueueInspectionMedia({
            mediaType: 'photo',
            localUri: permanentUri,
            inspectionId,
            checklistItemId,
            assignmentId: String(id),
            fileName: safeFileName,
          });
          if (__DEV__) console.log('Upload failed — photo queued for offline sync');
        } catch (queueErr) {
          if (__DEV__) console.error('Failed to queue photo after upload failure:', queueErr);
        }
      }

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
  }, [id, inspectionId, queryClient, t, answerMutation, isOnline]);

  // Handle voice note
  const handleVoiceNoteRecorded = useCallback((voiceNoteId: number, transcription?: { en: string; ar: string }, voiceUrl?: string) => {
    if (!currentItem) return;

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        voice_note_id: voiceNoteId,
        voice_note_url: voiceUrl,
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
        voice_transcription: transcription,
        urgency_level: current.urgency_level,
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

  // Handle voice note queued offline — mark as pending so user can proceed
  const handleVoiceQueuedOffline = useCallback((localUri: string) => {
    if (!currentItem) return;
    setLocalAnswers(prev => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        voice_note_url: localUri,
        voice_transcription: {
          en: '(Transcription pending – will sync when online)',
          ar: '(سيتم المزامنة عند الاتصال بالإنترنت)',
        },
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
  const handleVideoRecorded = useCallback((videoFileId: number, aiAnalysis?: { en: string; ar: string }, videoUrl?: string) => {
    if (!currentItem) return;

    setLocalAnswers((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        video_file_id: videoFileId,
        video_url: videoUrl,
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
              testID="wizard-yes-btn"
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
              testID="wizard-no-btn"
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
              testID="wizard-pass-btn"
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
              testID="wizard-fail-btn"
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
                style={[styles.numericInput, isArabic && { textAlign: 'right' }]}
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
            {/* Improvement 5: Smart Reading Anomaly Alert */}
            {(() => {
              if (!val || !readingStats || readingStats.count < 3) return null;
              const numVal = parseFloat(val);
              if (isNaN(numVal) || readingStats.avg === 0) return null;
              const deviation = Math.abs((numVal - readingStats.avg) / readingStats.avg) * 100;
              if (deviation < 10) return null;
              const direction = numVal > readingStats.avg
                ? t('inspection.aboveAverage', 'above average')
                : t('inspection.belowAverage', 'below average');
              const isRed = deviation > 20;
              return (
                <Text style={[styles.anomalyWarningText, isRed && styles.anomalyWarningTextRed]}>
                  {isRed ? '\uD83D\uDD34' : '\u26A0'} {Math.round(deviation)}% {direction} ({t('inspection.avg', 'avg')}: {Math.round(readingStats.avg)})
                </Text>
              );
            })()}
          </View>
        );

      case 'text':
        return (
          <View>
            <VoiceTextInput
              style={[styles.textInput, val && styles.textInputAnswered, isArabic && { textAlign: 'right', writingDirection: 'rtl' }]}
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

  // Urgency is mandatory for answered questions
  const needsUrgency = !!currentAnswer?.answer_value && currentAnswer?.urgency_level === undefined;

  // Can proceed if: not fail without valid media combo AND not empty numeric field AND not reading without photo AND not uploading AND urgency is set
  const canProceedToNext = !isFailWithoutMedia && !isNumericFieldEmpty && !isReadingWithoutPhoto && !isUploading && !needsUrgency;

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

  // Auto-expand media when validation is fail (inspector needs to add evidence)
  const shouldShowMedia = mediaExpanded || validation === 'fail';

  return (
    <View style={styles.container} testID="inspection-wizard-screen">
      <StaleDataBanner cacheKey={`inspection-${id}`} />
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            {t('offline.no_connection', '📡 Offline — photos & answers will sync when connected')}
          </Text>
        </View>
      )}
      {/* Slim header — single row */}
      <View style={styles.header} testID="wizard-header">
        <View style={[styles.headerTop, isArabic && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity
            testID="wizard-exit-btn"
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
            <Text style={styles.exitButtonText}>{isArabic ? '→' : '←'} {t('inspection.exit', 'Exit')}</Text>
          </TouchableOpacity>
          <Text style={styles.equipmentName} numberOfLines={1}>
            {inspData.equipment?.name ?? `Equipment #${inspData.equipment_id}`}
          </Text>
          <View style={styles.headerCountBadge}>
            <Text style={styles.headerCountText}>{answeredCount}/{totalItems}</Text>
          </View>
          <TouchableOpacity testID="wizard-switch-list-btn" style={styles.switchButton} onPress={switchToListMode}>
            <Text style={styles.switchButtonText}>☰ {t('inspection.listMode', 'List')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Colleague pre-fill banner */}
      {Object.keys(prefilledItems).length > 0 && colleagueData?.colleague && (
        <View style={styles.colleagueBanner}>
          <Text style={[styles.colleagueBannerText, isArabic && { textAlign: 'right', writingDirection: 'rtl' }]}>
            👥 {Object.keys(prefilledItems).length} {t('inspection.questionsPrefilledBy', 'questions pre-filled by')} {colleagueData.colleague.type === 'mechanical' ? t('inspection.mechInspector', 'Mech Inspector') : t('inspection.elecInspector', 'Elec Inspector')}
          </Text>
        </View>
      )}


      {/* Question card with animation */}
      <Animated.View style={[styles.questionCard, { opacity: cardOpacity }]}>

        {/* ── PINNED QUESTION — always visible, the hero ──────── */}
        <View style={styles.questionSticky}>
          {/* Assembly chip + category/critical badges — single row */}
          <View style={[styles.chipRow, isArabic && { flexDirection: 'row-reverse' }]}>
            {currentAssembly && currentAssembly !== 'General' && (
              <View style={styles.assemblyChip}>
                <Text style={styles.assemblyChipText}>
                  {currentAssembly} ({itemInAssembly}/{assemblyTotal}){currentPart ? ` → ${currentPart}` : ''}
                </Text>
              </View>
            )}
            {currentItem.category && (
              <View style={[styles.badge, currentItem.category === 'mechanical' ? styles.badgeMechanical : styles.badgeElectrical]}>
                <Text style={styles.badgeText}>{currentItem.category}</Text>
              </View>
            )}
            {inspectorCategory && (
              <View style={[styles.badge, {
                backgroundColor: canSkipCurrent ? '#fff7e6' : '#e6f4ff',
                borderColor: canSkipCurrent ? '#ffd591' : '#91caff',
                borderWidth: 1,
              }]}>
                <Text style={[styles.badgeText, { color: canSkipCurrent ? '#ad6800' : '#0958d9', fontSize: 10 }]}>
                  {canSkipCurrent
                    ? (isArabic ? 'قابل للتخطي' : 'Skippable')
                    : (isArabic ? 'مطلوب' : 'Required')}
                </Text>
              </View>
            )}
            {currentItem.critical_failure && (
              <View style={[styles.badge, styles.badgeCritical]}>
                <Text style={[styles.badgeText, styles.badgeCriticalText]}>{t('inspection.critical', 'CRITICAL')}</Text>
              </View>
            )}
          </View>

          {/* Question number */}
          <Text style={[styles.questionNumber, isArabic && { textAlign: 'right' }]}>
            {isArabic ? `${totalItems} / ${currentIndex + 1} س` : `Q ${currentIndex + 1} / ${totalItems}`}
          </Text>

          {/* Question text — THE HERO */}
          <View style={[{ flexDirection: isArabic ? 'row-reverse' : 'row', alignItems: 'flex-start' }]}>
            <Text style={[styles.questionText, { flex: 1 }, isArabic && { textAlign: 'right', writingDirection: 'rtl' }]}>
              {isArabic && currentItem.question_text_ar
                ? currentItem.question_text_ar
                : currentItem.question_text}
            </Text>
            <TouchableOpacity
              onPress={() => isSpeaking ? stop() : speak((isArabic && currentItem.question_text_ar) ? currentItem.question_text_ar : currentItem.question_text)}
              style={{ padding: 6, marginTop: 2, marginLeft: isArabic ? 0 : 4, marginRight: isArabic ? 4 : 0 }}
              accessibilityLabel="Read question aloud"
            >
              <Text style={{ fontSize: 20 }}>{isSpeaking ? '🔇' : '🔊'}</Text>
            </TouchableOpacity>
          </View>

          {/* Improvement 4: Defect History Warning Badge */}
          {currentItem && itemHistory[String(currentItem.id)] && (() => {
            const hist = itemHistory[String(currentItem.id)];
            const isActive = hist.has_active_defect;
            return (
              <TouchableOpacity
                style={[styles.defectHistoryBadge, isActive && styles.defectHistoryBadgeRed]}
                onPress={() => {
                  Alert.alert(
                    t('inspection.defectHistory', 'Defect History'),
                    `${t('inspection.failCount', 'Failed')}: ${hist.fail_count} / ${hist.total_count}\n` +
                    (hist.last_failed_at ? `${t('inspection.lastFailed', 'Last failed')}: ${new Date(hist.last_failed_at).toLocaleDateString()}\n` : '') +
                    (hist.severity ? `${t('inspection.severity', 'Severity')}: ${hist.severity}\n` : '') +
                    `${t('inspection.occurrences', 'Occurrences')}: ${hist.occurrence_count}`,
                    [{ text: 'OK' }]
                  );
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.defectHistoryBadgeText, isActive && styles.defectHistoryBadgeTextRed]}>
                  {isActive
                    ? `\uD83D\uDD34 ${t('inspection.activeDefect', 'Active defect')} (${t('inspection.failedXTimes', 'failed {{count}} times').replace('{{count}}', String(hist.fail_count))})`
                    : `\u26A0 ${t('inspection.failedXOfY', 'Failed {{x}} of {{y}} inspections').replace('{{x}}', String(hist.fail_count)).replace('{{y}}', String(hist.total_count))}`
                  }
                </Text>
              </TouchableOpacity>
            );
          })()}

          {/* Pre-filled from colleague indicator */}
          {currentItem && prefilledItems[currentItem.id] && (
            <View style={[styles.prefilledBadge, isArabic && { flexDirection: 'row-reverse', borderLeftWidth: 0, borderRightWidth: 4, borderRightColor: '#1976D2' }]}>
              <Text style={[styles.prefilledBadgeText, isArabic && { textAlign: 'right', writingDirection: 'rtl' }]}>
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
              isArabic && { borderLeftWidth: 0, borderRightWidth: 4, borderRightColor: '#9E9E9E' },
              isArabic && currentAnswer?.answer_value && validation === 'pass' && { borderRightColor: '#4CAF50' },
              isArabic && currentAnswer?.answer_value && validation === 'fail' && { borderRightColor: '#F44336' },
            ]}>
              <View style={[styles.hintHeader, isArabic && { flexDirection: 'row-reverse' }]}>
                <Text style={[
                  styles.hintLabel,
                  validation === 'pass' && styles.hintLabelPass,
                  validation === 'fail' && styles.hintLabelFail,
                  isArabic && { textAlign: 'right' },
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
              <Text style={[styles.hintText, isArabic && { textAlign: 'right', writingDirection: 'rtl' }]}>{expectedResult}</Text>
            </View>
          )}
        </View>

        {/* ── SCROLLABLE ANSWER SECTION ─────────────────────────────── */}
        <ScrollView contentContainerStyle={styles.questionContent} showsVerticalScrollIndicator={false}>
          {/* Action if fail hint */}
          {actionIfFail && validation === 'fail' && (
            <View style={[styles.hintBox, styles.warningBox, isArabic && { borderLeftWidth: 0, borderRightWidth: 4, borderRightColor: '#FF9800' }]}>
              <Text style={[styles.hintLabel, styles.warningLabel, isArabic && { textAlign: 'right' }]}>
                ⚠️ {t('inspection.actionIfFail', 'Action Required')}:
              </Text>
              <Text style={[styles.hintText, isArabic && { textAlign: 'right', writingDirection: 'rtl' }]}>{actionIfFail}</Text>
            </View>
          )}

          {/* Answer input */}
          {renderAnswerInput()}

          {/* Urgency — compact segmented control */}
          <View style={styles.urgencySegmented}>
            {([
              { level: 0, label: t('inspection.urgencyOk', 'OK'), color: '#4CAF50' },
              { level: 1, label: t('inspection.urgencyMonitor', 'Monitor'), color: '#FF9800' },
              { level: 2, label: t('inspection.urgencyAttention', 'Attn'), color: '#FF5722' },
              { level: 3, label: t('inspection.urgencyCritical', 'Crit'), color: '#F44336' },
            ] as const).map(({ level, label, color }, idx, arr) => {
              const isActive = currentAnswer?.urgency_level === level;
              const isSuggested = currentItem && autoSuggestedUrgency[currentItem.id] === level;
              return (
                <TouchableOpacity
                  key={level}
                  testID={`urgency-btn-${level}`}
                  style={[
                    styles.segButton,
                    idx < arr.length - 1 && styles.segButtonBorder,
                    isActive && { backgroundColor: color },
                  ]}
                  onPress={() => handleUrgencyChange(level)}
                >
                  <Text
                    style={[
                      styles.segButtonText,
                      { color },
                      isActive && { color: '#fff' },
                    ]}
                  >
                    {label}
                  </Text>
                  {isSuggested && isActive && (
                    <Text style={styles.suggestedTag}>{t('inspection.suggested', 'Suggested')}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Media — collapsible icon row */}
          <TouchableOpacity
            style={[styles.mediaToggle, isArabic && { flexDirection: 'row-reverse' }]}
            onPress={() => setMediaExpanded(!shouldShowMedia)}
            activeOpacity={0.7}
          >
            <View style={styles.mediaIconRow}>
              <View style={[styles.mediaIconItem, !hasPhoto && (requiresPhotoVerification || validation === 'fail') && styles.mediaIconRequired]}>
                <Text style={styles.mediaIconEmoji}>📷</Text>
                {hasPhoto
                  ? <View style={styles.mediaCheckBadge}><Text style={styles.mediaCheckText}>✓</Text></View>
                  : (requiresPhotoVerification || validation === 'fail') && <View style={styles.mediaRequiredDot} />}
              </View>
              <View style={[styles.mediaIconItem, !hasVideo && validation === 'fail' && !hasPhoto && styles.mediaIconRequired]}>
                <Text style={styles.mediaIconEmoji}>🎥</Text>
                {hasVideo
                  ? <View style={styles.mediaCheckBadge}><Text style={styles.mediaCheckText}>✓</Text></View>
                  : validation === 'fail' && !hasPhoto && <View style={styles.mediaRequiredDot} />}
              </View>
              <View style={[styles.mediaIconItem, !hasVoiceNote && validation === 'fail' && styles.mediaIconRequired]}>
                <Text style={styles.mediaIconEmoji}>🎙️</Text>
                {hasVoiceNote
                  ? <View style={styles.mediaCheckBadge}><Text style={styles.mediaCheckText}>✓</Text></View>
                  : validation === 'fail' && <View style={styles.mediaRequiredDot} />}
              </View>
            </View>
            <Text style={styles.mediaToggleLabel}>
              {(hasPhoto || hasVideo || hasVoiceNote)
                ? t('inspection.mediaAttached', 'Media attached')
                : t('inspection.addMedia', 'Add media')}
            </Text>
            <Text style={styles.mediaToggleArrow}>{shouldShowMedia ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {/* Expanded media content */}
          {shouldShowMedia && (
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
                      {pendingPhotoItems.has(currentItem.id) && !currentAnswer?.photo_url && (
                        <View style={styles.queuedBadge}>
                          <Text style={styles.queuedBadgeText}>⏳ Queued</Text>
                        </View>
                      )}
                    </View>
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

              {/* Photo AI Analysis */}
              {currentAnswer?.photo_ai_analysis && (
                <View style={styles.aiAnalysisBox}>
                  <Text style={styles.aiAnalysisLabel}>🤖 {t('inspection.photoAiAnalysis', 'Photo AI Analysis')}:</Text>
                  {currentAnswer.photo_ai_analysis.en && (
                    <Text style={styles.aiAnalysisText}>{currentAnswer.photo_ai_analysis.en}</Text>
                  )}
                  {currentAnswer.photo_ai_analysis.ar && (
                    <Text style={[styles.aiAnalysisText, styles.aiAnalysisTextAr]}>{currentAnswer.photo_ai_analysis.ar}</Text>
                  )}
                </View>
              )}

              {/* Video */}
              <VideoRecorder
                onVideoRecorded={handleVideoRecorded}
                onVideoDeleted={handleVideoDeleted}
                existingVideoUrl={currentAnswer?.video_url}
                disabled={isUploading}
              />

              {currentAnswer?.video_ai_analysis && (
                <View style={styles.aiAnalysisBox}>
                  <Text style={styles.aiAnalysisLabel}>🎥 {t('inspection.videoAiAnalysis', 'Video AI Analysis')}:</Text>
                  {currentAnswer.video_ai_analysis.en && (
                    <Text style={styles.aiAnalysisText}>{currentAnswer.video_ai_analysis.en}</Text>
                  )}
                  {currentAnswer.video_ai_analysis.ar && (
                    <Text style={[styles.aiAnalysisText, styles.aiAnalysisTextAr]}>{currentAnswer.video_ai_analysis.ar}</Text>
                  )}
                </View>
              )}

              {/* Voice note */}
              <VoiceNoteRecorder
                key={`voice-${currentItem.id}`}
                onVoiceNoteRecorded={handleVoiceNoteRecorded}
                onVoiceNoteDeleted={handleVoiceNoteDeleted}
                existingVoiceUrl={currentAnswer?.voice_note_url}
                existingTranscription={currentAnswer?.voice_transcription}
                disabled={isUploading}
                language={i18n.language}
                isOnline={isOnline}
                inspectionId={inspectionId}
                checklistItemId={currentItem.id}
                currentAnswerValue={currentAnswer?.answer_value}
                urgency_level={currentAnswer?.urgency_level}
                onQueuedOffline={handleVoiceQueuedOffline}
              />
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Slim navigation bar with inline hint */}
      <View style={[styles.navButtonRow, isArabic && { flexDirection: 'row-reverse' }]}>
        {/* ← Previous */}
        <TouchableOpacity
          testID="wizard-prev-btn"
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          onPress={goToPrev}
          disabled={currentIndex === 0}
          activeOpacity={0.7}
        >
          <Text style={[styles.navButtonChevron, currentIndex === 0 && styles.navButtonTextDisabled]}>
            {isArabic ? '›' : '‹'}
          </Text>
        </TouchableOpacity>

        {/* Center: mini progress + hint pill + timer */}
        <View style={styles.navCenter}>
          {/* Improvement 7: Timer & Pace Indicator */}
          {totalItems > 0 && elapsedSeconds > 0 && (() => {
            const elapsedMin = Math.floor(elapsedSeconds / 60);
            const avgSecondsPerQ = answeredCount > 0 ? elapsedSeconds / answeredCount : 0;
            const remainingQ = totalItems - answeredCount;
            const estRemainingMin = avgSecondsPerQ > 0 ? Math.ceil((avgSecondsPerQ * remainingQ) / 60) : 0;
            const estFinishTime = Date.now() + estRemainingMin * 60000;

            let paceColor = '#4CAF50'; // green
            if (assignmentDeadline) {
              const deadlineTime = new Date(assignmentDeadline).getTime();
              const hoursToDeadline = (deadlineTime - estFinishTime) / 3600000;
              if (hoursToDeadline < 0) paceColor = '#F44336'; // red
              else if (hoursToDeadline < 2) paceColor = '#FF9800'; // yellow
            }

            const formatTime = (min: number) => {
              if (min < 60) return `${min}min`;
              const h = Math.floor(min / 60);
              const m = min % 60;
              return m > 0 ? `${h}h ${m}min` : `${h}h`;
            };

            return (
              <Text style={[styles.timerText, { color: paceColor }]}>
                {'\u23F1'} {formatTime(elapsedMin)} {'\u2022'} {answeredCount}/{totalItems} {'\u2022'} ~{formatTime(estRemainingMin)} {t('inspection.left', 'left')}
              </Text>
            );
          })()}
          <View style={styles.navTopRow}>
            <Text style={styles.navProgressText}>
              {currentIndex + 1} <Text style={styles.navProgressOf}>{t('inspection.of', 'of')}</Text> {totalItems}
            </Text>
          </View>
          <View style={styles.navProgressBar}>
            <View style={[styles.navProgressFill, { width: `${Math.round(((currentIndex + 1) / totalItems) * 100)}%` as any }]} />
          </View>
          {/* Subtle hint pill — replaces big red warning boxes */}
          {!canProceedToNext && (
            <View style={styles.hintPill}>
              <Text style={styles.hintPillText}>
                {isFailWithoutMedia ? '📸+🎙️ ' + t('inspection.mediaNeeded', 'Media needed')
                  : isNumericFieldEmpty ? '🔢 ' + t('inspection.enterValue', 'Enter value')
                  : isReadingWithoutPhoto ? '📸 ' + t('inspection.photoNeeded', 'Photo needed')
                  : needsUrgency ? '⚡ ' + t('inspection.setUrgency', 'Set urgency')
                  : ''}
              </Text>
            </View>
          )}
        </View>

        {/* → Next / Go to Missing / Submit */}
        {currentIndex === totalItems - 1 ? (
          (() => {
            const incompleteIndex = findNextIncomplete(0);
            if (incompleteIndex >= 0) {
              return (
                <TouchableOpacity
                  testID="wizard-go-to-missing-btn"
                  style={styles.navButtonAction}
                  onPress={() => goToIndex(incompleteIndex)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.navButtonActionText}>
                    {isArabic ? '‹ ' : ''}{t('inspection.goToMissing', 'Go to Missing')}{isArabic ? '' : ' ›'}
                  </Text>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                testID="wizard-submit-btn"
                style={[styles.navButtonSubmit, submitMutation.isPending && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitMutation.isPending}
                activeOpacity={0.8}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.navButtonSubmitText}>{t('inspection.submitAndAssess', 'Submit & Assess')}</Text>
                )}
              </TouchableOpacity>
            );
          })()
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {canSkipCurrent && (
              <TouchableOpacity
                testID="wizard-skip-btn"
                style={[styles.navButton, { backgroundColor: '#faad14', borderColor: '#faad14' }]}
                onPress={handleSkip}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                  {isArabic ? 'تخطي' : 'Skip'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID="wizard-next-btn"
              style={[
                styles.navButton,
                styles.navButtonPrimary,
                !canProceedToNext && !canSkipCurrent && styles.navButtonDisabled,
              ]}
              onPress={canProceedToNext ? goToNext : canSkipCurrent ? handleSkip : undefined}
              disabled={!canProceedToNext && !canSkipCurrent}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.navButtonChevron,
                styles.navButtonChevronPrimary,
                !canProceedToNext && !canSkipCurrent && styles.navButtonTextDisabled,
              ]}>
                {isArabic ? '‹' : '›'}
              </Text>
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: 14,
    paddingTop: 48,
    paddingBottom: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  equipmentName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  headerCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  headerCountText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
  },
  // ─── Chip row (assembly + category + critical in one line) ───
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  assemblyChip: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
  },
  assemblyChipText: {
    fontSize: 12,
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
    overflow: 'hidden',
  },
  // Pinned question section — always visible, never scrolls away
  questionSticky: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#E3F2FD',
  },
  // Scrollable answer section below the pinned question
  questionContent: {
    padding: 16,
    paddingTop: 14,
  },
  questionNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1976D2',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  questionText: {
    fontSize: 25,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 34,
    marginBottom: 10,
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
    gap: 6,
    marginBottom: 6,
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
    paddingVertical: 20,
    borderRadius: 12,
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
    fontSize: 20,
    fontWeight: '800',
    color: '#424242',
    letterSpacing: 0.5,
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
  // ─── Urgency — compact segmented control ───
  urgencySegmented: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  segButton: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  segButtonBorder: {
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  segButtonText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  // ─── Media toggle (collapsed icon row) ───
  mediaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 10,
  },
  mediaIconRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  mediaIconItem: {
    position: 'relative',
  },
  mediaIconRequired: {
    backgroundColor: '#FFF9C4',
    borderRadius: 8,
    padding: 2,
  },
  mediaRequiredDot: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD600',
  },
  mediaIconEmoji: {
    fontSize: 20,
  },
  mediaCheckBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCheckText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
  },
  mediaToggleLabel: {
    flex: 1,
    fontSize: 14,
    color: '#999',
  },
  mediaToggleArrow: {
    fontSize: 11,
    color: '#999',
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
  queuedBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(250,173,20,0.9)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  queuedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    alignItems: 'center',
    gap: 8,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    elevation: 2,
    boxShadow: '0px 2px 6px rgba(25, 118, 210, 0.18)',
  },
  navButtonPrimary: {
    backgroundColor: '#1976D2',
    borderColor: '#1565C0',
    elevation: 4,
    boxShadow: '0px 4px 10px rgba(25, 118, 210, 0.35)',
  },
  navButtonDisabled: {
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
    elevation: 0,
    boxShadow: 'none',
  },
  navButtonChevron: {
    fontSize: 22,
    fontWeight: '400',
    color: '#1976D2',
    lineHeight: 26,
    marginTop: -1,
  },
  navButtonChevronPrimary: {
    color: '#fff',
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
  navCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  navTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navProgressText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#424242',
    letterSpacing: 0.3,
  },
  navProgressOf: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9e9e9e',
  },
  navProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  navProgressFill: {
    height: 3,
    backgroundColor: '#1976D2',
    borderRadius: 2,
  },
  // ─── Hint pill (replaces red warning boxes) ───
  hintPill: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFE0B2',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 2,
  },
  hintPillText: {
    fontSize: 12,
    color: '#E65100',
    fontWeight: '600',
    textAlign: 'center',
  },
  navButtonAction: {
    backgroundColor: '#FF9800',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    boxShadow: '0px 3px 8px rgba(255, 152, 0, 0.3)',
    minWidth: 56,
  },
  navButtonActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  navButtonSubmit: {
    backgroundColor: '#2E7D32',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    boxShadow: '0px 4px 10px rgba(46, 125, 50, 0.35)',
    minWidth: 56,
  },
  navButtonSubmitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.2,
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
  // ─── Improvement 4: Defect History Warning Badge ───
  defectHistoryBadge: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  defectHistoryBadgeRed: {
    backgroundColor: '#FFEBEE',
    borderLeftColor: '#F44336',
  },
  defectHistoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
  },
  defectHistoryBadgeTextRed: {
    color: '#C62828',
  },
  // ─── Improvement 5: Smart Reading Anomaly Alert ───
  anomalyWarningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  anomalyWarningTextRed: {
    color: '#C62828',
  },
  // ─── Improvement 6: Auto-Urgency Suggested tag ───
  suggestedTag: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fff',
    marginTop: 1,
    letterSpacing: 0.3,
  },
  // ─── Improvement 7: Timer & Pace Indicator ───
  timerText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  offlineBanner: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#E65100',
    textAlign: 'center',
    fontWeight: '500',
  },
});
