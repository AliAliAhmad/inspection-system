import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { Video, ResizeMode } from 'expo-av';
import VoiceTextInput from '../../components/VoiceTextInput';
import VoiceNoteRecorder from '../../components/VoiceNoteRecorder';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import {
  inspectionsApi,
  defectsApi,
  Inspection,
  InspectionAnswer,
  ChecklistItem,
  InspectionProgress,
  getApiClient,
  aiApi,
} from '@inspection/shared';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';

/**
 * Optimize Cloudinary image URL with auto-format, auto-quality, and enhancement
 * - f_auto: Best format for device (WebP, JPEG)
 * - q_auto: Smart compression (30-50% smaller)
 * - e_improve: Auto-enhance colors/contrast for poorly lit photos
 */
function getOptimizedPhotoUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,e_improve/');
}

/**
 * Generate photo thumbnail for mobile list views
 * - Smaller size for fast loading on mobile
 * - c_fill with g_auto for smart cropping
 */
function getPhotoThumbnailUrl(url: string, width = 300, height = 150): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},h_${height},c_fill,g_auto/`);
}

/**
 * Convert Cloudinary video URL to MP4 format for better mobile compatibility
 * - f_mp4: Convert to MP4 format (universally supported)
 * - vc_h264: Use H.264 codec for wide compatibility
 * - q_auto: Smart compression
 */
function getVideoPlaybackUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_mp4,vc_h264,q_auto/');
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'InspectionChecklist'>;

interface LocalAnswers {
  [checklistItemId: number]: {
    answer_value: string;
    comment?: string;
    photo_uri?: string;       // Local URI for preview while uploading
    photo_url?: string;       // Cloudinary URL after upload
    video_uri?: string;       // Local URI for video preview
    video_url?: string;       // Cloudinary URL for video
    voice_note_id?: number;   // Voice note file ID
    voice_note_url?: string;  // Cloudinary URL for voice note
    voice_transcription?: { en: string; ar: string };  // Voice transcription
    isUploading?: boolean;    // Upload in progress
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
  const [showOnlyUnanswered, setShowOnlyUnanswered] = useState(false);
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const {
    data: inspection,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
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

  // Helper to extract voice transcription from comment
  const extractVoiceTranscription = (comment: string | null | undefined): { en: string; ar: string } | undefined => {
    if (!comment) return undefined;
    let en = '';
    let ar = '';
    const lines = comment.split('\n');
    for (const line of lines) {
      if (line.startsWith('EN:')) {
        en = line.replace('EN:', '').trim();
      } else if (line.startsWith('AR:')) {
        ar = line.replace('AR:', '').trim();
      }
    }
    if (en || ar) return { en, ar };
    return undefined;
  };

  // Sync server answers into local state when inspection data loads
  useEffect(() => {
    if (inspection?.answers) {
      const answers = inspection.answers;
      setLocalAnswers((prev) => {
        const merged: LocalAnswers = { ...prev };
        answers.forEach((ans: InspectionAnswer) => {
          // Get Cloudinary URLs from file records if available
          const photoUrl = (ans.photo_file as any)?.url || null;
          const videoUrl = (ans.video_file as any)?.url || null;
          const voiceNoteUrl = (ans.voice_note as any)?.url || null;

          // Extract voice transcription from comment if present
          const voiceTranscription = extractVoiceTranscription(ans.comment);

          const serverData = {
            answer_value: ans.answer_value,
            comment: ans.comment ?? undefined,
            photo_url: photoUrl ?? undefined,
            video_url: videoUrl ?? undefined,
            voice_note_id: ans.voice_note_id ?? undefined,
            voice_note_url: voiceNoteUrl ?? undefined,
            voice_transcription: voiceTranscription,
          };

          // Merge: keep local upload state, but update from server
          merged[ans.checklist_item_id] = {
            ...serverData,
            ...prev[ans.checklist_item_id],
            // Always use server comment if it has AI analysis
            comment: (ans.comment && (ans.comment.includes('🔍') || ans.comment.includes('🎬') || ans.comment.includes('[Photo]:') || ans.comment.includes('[Video]:')))
              ? ans.comment
              : (prev[ans.checklist_item_id]?.comment ?? ans.comment ?? undefined),
            // Use server URLs if available
            photo_url: photoUrl || prev[ans.checklist_item_id]?.photo_url,
            video_url: videoUrl || prev[ans.checklist_item_id]?.video_url,
            voice_note_url: voiceNoteUrl || prev[ans.checklist_item_id]?.voice_note_url,
            // Restore voice transcription from server if not already in local state
            voice_transcription: prev[ans.checklist_item_id]?.voice_transcription || voiceTranscription,
          };
        });
        return merged;
      });
    }
  }, [inspection]);

  const {
    data: progress,
  } = useOfflineQuery<InspectionProgress>({
    queryKey: ['inspectionProgress', inspectionId],
    queryFn: async () => {
      const res = await inspectionsApi.getProgress(inspectionId!);
      const data = res.data.data ?? res.data;
      return data as InspectionProgress;
    },
    enabled: !!inspectionId,
    cacheKey: inspectionId ? `inspection-progress-${inspectionId}` : 'inspection-progress-unknown',
  });

  const answerMutation = useMutation({
    mutationFn: (payload: { checklist_item_id: number; answer_value: string; comment?: string; voice_note_id?: number }) =>
      inspectionsApi.answerQuestion(inspectionId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspectionProgress', inspectionId] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => inspectionsApi.submit(inspectionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });
      navigation.replace('Assessment', { id });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        t('common.error');
      Alert.alert(t('common.error'), message);
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


  // Upload photo to Cloudinary via API and run AI analysis
  const uploadPhoto = useCallback(
    async (checklistItemId: number, uri: string, fileName: string) => {
      // Set uploading state
      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          photo_uri: uri,
          isUploading: true,
        },
      }));

      try {
        // Create FormData for React Native - must use this format
        const formData = new FormData();
        formData.append('file', {
          uri,
          name: fileName || 'photo.jpg',
          type: 'image/jpeg',
        } as any);
        formData.append('checklist_item_id', String(checklistItemId));

        // Upload directly via API client (not through shared API which rebuilds FormData)
        const response = await getApiClient().post(
          `/api/inspections/${inspectionId}/upload-media`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        const data = (response.data as any)?.data;
        const cloudinaryUrl = data?.photo_file?.url || data?.url;

        // Update state with Cloudinary URL
        setLocalAnswers((prev) => ({
          ...prev,
          [checklistItemId]: {
            ...prev[checklistItemId],
            photo_uri: undefined,
            photo_url: cloudinaryUrl,
            isUploading: false,
          },
        }));

        // Run AI analysis if we got a Cloudinary URL
        if (cloudinaryUrl && cloudinaryUrl.includes('cloudinary.com')) {
          try {
            // Analyze in both languages
            const [enResult, arResult] = await Promise.all([
              aiApi.analyzeDefect(cloudinaryUrl, 'en').catch(() => null),
              aiApi.analyzeDefect(cloudinaryUrl, 'ar').catch(() => null),
            ]);

            const enData = (enResult?.data as any)?.data;
            const arData = (arResult?.data as any)?.data;

            if (enData?.success || arData?.success) {
              // Format analysis like web does
              const parts: string[] = [];
              if (enData?.success) {
                parts.push(`🔍 Photo Analysis (EN)\n• Issue: ${enData.description}\n• Severity: ${enData.severity}\n• Cause: ${enData.cause}\n• Action: ${enData.recommendation}\n• Safety: ${enData.safety_risk}`);
              }
              if (arData?.success) {
                parts.push(`🔍 تحليل الصورة (AR)\n• المشكلة: ${arData.description}\n• الخطورة: ${arData.severity}\n• السبب: ${arData.cause}\n• الإجراء: ${arData.recommendation}\n• السلامة: ${arData.safety_risk}`);
              }

              const analysisComment = parts.join('\n\n');
              const currentAnswer = localAnswers[checklistItemId];

              // Save the analysis as comment
              if (currentAnswer?.answer_value) {
                answerMutation.mutate({
                  checklist_item_id: checklistItemId,
                  answer_value: currentAnswer.answer_value,
                  comment: analysisComment,
                });
              }

              // Update local state with analysis
              setLocalAnswers((prev) => ({
                ...prev,
                [checklistItemId]: {
                  ...prev[checklistItemId],
                  comment: analysisComment,
                },
              }));
            }
          } catch (aiError) {
            console.warn('AI analysis failed:', aiError);
          }
        }

        // Refresh inspection data
        queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });
      } catch (error: any) {
        console.error('Photo upload failed:', error);
        const message = error?.response?.data?.message || error?.message || 'Failed to upload photo';
        Alert.alert(t('common.error'), message);

        // Clear uploading state on error
        setLocalAnswers((prev) => ({
          ...prev,
          [checklistItemId]: {
            ...prev[checklistItemId],
            photo_uri: undefined,
            isUploading: false,
          },
        }));
      }
    },
    [id, inspectionId, queryClient, t, localAnswers, answerMutation],
  );

  const handleTakePhoto = useCallback(
    async (checklistItemId: number) => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('checklist.camera_permission_required'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        uploadPhoto(checklistItemId, asset.uri, asset.fileName || 'photo.jpg');
      }
    },
    [t, uploadPhoto],
  );

  const handlePickImage = useCallback(
    async (checklistItemId: number) => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('checklist.gallery_permission_required'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        uploadPhoto(checklistItemId, asset.uri, asset.fileName || 'photo.jpg');
      }
    },
    [t, uploadPhoto],
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

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: (checklistItemId: number) =>
      inspectionsApi.deletePhoto(inspectionId!, checklistItemId),
    onSuccess: (_, checklistItemId) => {
      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          photo_url: undefined,
          photo_uri: undefined,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });
      Alert.alert(t('common.success', 'Success'), t('inspection.photoDeleted', 'Photo deleted'));
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || t('common.error');
      Alert.alert(t('common.error'), message);
    },
  });

  // Delete video mutation
  const deleteVideoMutation = useMutation({
    mutationFn: (checklistItemId: number) =>
      inspectionsApi.deleteVideo(inspectionId!, checklistItemId),
    onSuccess: (_, checklistItemId) => {
      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          video_url: undefined,
          video_uri: undefined,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });
      Alert.alert(t('common.success', 'Success'), t('inspection.videoDeleted', 'Video deleted'));
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || t('common.error');
      Alert.alert(t('common.error'), message);
    },
  });

  // Handle delete photo with confirmation
  const handleDeletePhoto = useCallback((checklistItemId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('inspection.deletePhotoConfirm', 'Delete this photo?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => deletePhotoMutation.mutate(checklistItemId),
        },
      ],
    );
  }, [t, deletePhotoMutation]);

  // Handle delete video with confirmation
  const handleDeleteVideo = useCallback((checklistItemId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('inspection.deleteVideoConfirm', 'Delete this video?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => deleteVideoMutation.mutate(checklistItemId),
        },
      ],
    );
  }, [t, deleteVideoMutation]);

  const renderYesNo = (item: ChecklistItem) => {
    const val = localAnswers[item.id]?.answer_value;
    return (
      <View style={styles.yesNoRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, val === 'yes' && styles.toggleBtnActiveGreen]}
          onPress={() => handleAnswer(item.id, 'yes')}
        >
          <Text style={[styles.toggleBtnText, val === 'yes' && styles.toggleBtnTextActive]}>
            {t('checklist.yes')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, val === 'no' && styles.toggleBtnActiveRed]}
          onPress={() => handleAnswer(item.id, 'no')}
        >
          <Text style={[styles.toggleBtnText, val === 'no' && styles.toggleBtnTextActive]}>
            {t('checklist.no')}
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
            {t('checklist.pass')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, val === 'fail' && styles.toggleBtnActiveRed]}
          onPress={() => handleAnswer(item.id, 'fail')}
        >
          <Text style={[styles.toggleBtnText, val === 'fail' && styles.toggleBtnTextActive]}>
            {t('checklist.fail')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTextInput = (item: ChecklistItem) => {
    const val = localAnswers[item.id]?.answer_value ?? '';
    return (
      <VoiceTextInput
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

  // Handle voice note recorded
  const handleVoiceNoteRecorded = useCallback((checklistItemId: number, voiceNoteId: number, transcription?: { en: string; ar: string }) => {
    setLocalAnswers((prev) => ({
      ...prev,
      [checklistItemId]: {
        ...prev[checklistItemId],
        voice_note_id: voiceNoteId,
        voice_transcription: transcription,
      },
    }));

    // Save voice note ID with answer
    const current = localAnswers[checklistItemId];
    if (current?.answer_value) {
      answerMutation.mutate({
        checklist_item_id: checklistItemId,
        answer_value: current.answer_value,
        comment: current.comment,
        voice_note_id: voiceNoteId,
      });
    }
  }, [localAnswers, answerMutation]);

  // Handle video recording
  const handleRecordVideo = useCallback(
    async (checklistItemId: number) => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('checklist.camera_permission_required'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        quality: 0.7,
        videoMaxDuration: 60, // Max 60 seconds
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        uploadVideo(checklistItemId, asset.uri, asset.fileName || 'video.mp4');
      }
    },
    [t],
  );

  // Upload video to Cloudinary and run AI analysis
  const uploadVideo = useCallback(
    async (checklistItemId: number, uri: string, fileName: string) => {
      setLocalAnswers((prev) => ({
        ...prev,
        [checklistItemId]: {
          ...prev[checklistItemId],
          video_uri: uri,
          isUploading: true,
        },
      }));

      try {
        // Create FormData for React Native
        const formData = new FormData();
        formData.append('file', {
          uri,
          name: fileName || 'video.mp4',
          type: 'video/mp4',
        } as any);
        formData.append('checklist_item_id', String(checklistItemId));

        // Upload directly via API client
        const response = await getApiClient().post(
          `/api/inspections/${inspectionId}/upload-media`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        const data = (response.data as any)?.data;
        const cloudinaryUrl = data?.video_file?.url || data?.url;

        setLocalAnswers((prev) => ({
          ...prev,
          [checklistItemId]: {
            ...prev[checklistItemId],
            video_uri: undefined,
            video_url: cloudinaryUrl,
            isUploading: false,
          },
        }));

        // Run AI analysis on video thumbnail if we got a Cloudinary URL
        if (cloudinaryUrl && cloudinaryUrl.includes('cloudinary.com')) {
          try {
            // Extract thumbnail from video for analysis
            const thumbnailUrl = cloudinaryUrl
              .replace('/upload/', '/upload/so_auto,w_640,h_480,c_fill,f_jpg/')
              .replace(/\.(mp4|mov|webm|avi|mkv)$/i, '.jpg');

            // Analyze in both languages
            const [enResult, arResult] = await Promise.all([
              aiApi.analyzeDefect(thumbnailUrl, 'en').catch(() => null),
              aiApi.analyzeDefect(thumbnailUrl, 'ar').catch(() => null),
            ]);

            const enData = (enResult?.data as any)?.data;
            const arData = (arResult?.data as any)?.data;

            if (enData?.success || arData?.success) {
              // Format analysis like web does
              const parts: string[] = [];
              if (enData?.success) {
                parts.push(`🎬 Video Analysis (EN)\n• Issue: ${enData.description}\n• Severity: ${enData.severity}\n• Cause: ${enData.cause}\n• Action: ${enData.recommendation}\n• Safety: ${enData.safety_risk}`);
              }
              if (arData?.success) {
                parts.push(`🎬 تحليل الفيديو (AR)\n• المشكلة: ${arData.description}\n• الخطورة: ${arData.severity}\n• السبب: ${arData.cause}\n• الإجراء: ${arData.recommendation}\n• السلامة: ${arData.safety_risk}`);
              }

              const analysisComment = parts.join('\n\n');
              const currentAnswer = localAnswers[checklistItemId];

              // Save the analysis as comment
              if (currentAnswer?.answer_value) {
                answerMutation.mutate({
                  checklist_item_id: checklistItemId,
                  answer_value: currentAnswer.answer_value,
                  comment: analysisComment,
                });
              }

              // Update local state with analysis
              setLocalAnswers((prev) => ({
                ...prev,
                [checklistItemId]: {
                  ...prev[checklistItemId],
                  comment: analysisComment,
                },
              }));
            }
          } catch (aiError) {
            console.warn('Video AI analysis failed:', aiError);
          }
        }

        queryClient.invalidateQueries({ queryKey: ['inspection', 'by-assignment', id] });
      } catch (error: any) {
        console.error('Video upload failed:', error);
        const message = error?.response?.data?.message || error?.message || 'Failed to upload video';
        Alert.alert(t('common.error'), message);
        setLocalAnswers((prev) => ({
          ...prev,
          [checklistItemId]: {
            ...prev[checklistItemId],
            video_uri: undefined,
            isUploading: false,
          },
        }));
      }
    },
    [id, inspectionId, queryClient, t, localAnswers, answerMutation],
  );

  // Helper to extract AI analysis from comment (supports new bilingual format)
  const extractAnalysis = (comment: string | undefined, type: 'photo' | 'video' | 'voice'): { en: string; ar: string } | null => {
    if (!comment) return null;

    // Check for new bilingual format (🔍 Photo Analysis (EN) / 🔍 Video Analysis (EN))
    const typeLabel = type === 'photo' ? 'Photo' : type === 'video' ? 'Video' : 'Voice';
    const enMarker = type === 'voice' ? 'EN:' : `🔍 ${typeLabel} Analysis (EN)`;
    const arMarker = type === 'voice' ? 'AR:' : `🔍 تحليل`;

    let enContent = '';
    let arContent = '';
    let inEnSection = false;
    let inArSection = false;

    const lines = comment.split('\n');
    for (const line of lines) {
      if (type === 'voice') {
        // Voice transcription format: EN: ... / AR: ...
        if (line.startsWith('EN:')) {
          enContent = line.replace('EN:', '').trim();
        } else if (line.startsWith('AR:')) {
          arContent = line.replace('AR:', '').trim();
        }
      } else {
        // Photo/Video analysis format
        if (line.includes(enMarker)) {
          inEnSection = true;
          inArSection = false;
          enContent = '';
        } else if (line.includes(arMarker) && (line.includes('(AR)') || line.includes('صورة') || line.includes('فيديو'))) {
          inEnSection = false;
          inArSection = true;
          arContent = '';
        } else if (inEnSection && line.startsWith('•')) {
          enContent += (enContent ? '\n' : '') + line;
        } else if (inArSection && line.startsWith('•')) {
          arContent += (arContent ? '\n' : '') + line;
        }
      }
    }

    // Fallback to old format [Photo]: / [Video]:
    if (!enContent && !arContent) {
      const oldPrefix = type === 'photo' ? '[Photo]:' : type === 'video' ? '[Video]:' : null;
      if (oldPrefix) {
        for (const line of lines) {
          if (line.startsWith(oldPrefix)) {
            enContent = line.substring(oldPrefix.length).trim();
            break;
          }
        }
      }
    }

    if (enContent || arContent) {
      return { en: enContent, ar: arContent };
    }
    return null;
  };

  const renderChecklistItem = (item: ChecklistItem) => {
    const questionText = isArabic && item.question_text_ar
      ? item.question_text_ar
      : item.question_text;
    const currentAnswer = localAnswers[item.id];

    // Photo URL: prefer Cloudinary URL, fallback to local URI during upload
    const photoSource = currentAnswer?.photo_url || currentAnswer?.photo_uri;
    // Video URL: prefer Cloudinary URL, fallback to local URI
    const videoSource = currentAnswer?.video_url || currentAnswer?.video_uri;
    // Voice note URL
    const voiceNoteUrl = currentAnswer?.voice_note_url;
    const isUploading = currentAnswer?.isUploading;

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
            style={[styles.cameraButton, isUploading && styles.buttonDisabled]}
            onPress={() => handleTakePhoto(item.id)}
            disabled={isUploading}
          >
            <Text style={styles.cameraButtonText}>{t('inspection.take_photo')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.galleryButton, isUploading && styles.buttonDisabled]}
            onPress={() => handlePickImage(item.id)}
            disabled={isUploading}
          >
            <Text style={styles.galleryButtonText}>{t('inspection.photo')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.videoButton, isUploading && styles.buttonDisabled]}
            onPress={() => handleRecordVideo(item.id)}
            disabled={isUploading}
          >
            <Text style={styles.videoButtonText}>{t('inspection.video', 'Video')}</Text>
          </TouchableOpacity>
        </View>

        {/* Voice Note Recorder */}
        <VoiceNoteRecorder
          onVoiceNoteRecorded={(voiceNoteId, transcription) => handleVoiceNoteRecorded(item.id, voiceNoteId, transcription)}
          existingVoiceUrl={voiceNoteUrl}
          existingTranscription={currentAnswer?.voice_transcription}
          disabled={isUploading}
          language={i18n.language}
        />

        {/* Validation warnings for failed items */}
        {(() => {
          const isFailed = currentAnswer?.answer_value === 'fail' || currentAnswer?.answer_value === 'no';
          const hasVoice = !!currentAnswer?.voice_note_id || !!voiceNoteUrl;
          const hasMedia = !!photoSource || !!videoSource;

          if (isFailed && inspData.status === 'draft') {
            return (
              <View style={styles.validationWarnings}>
                {!hasVoice && (
                  <Text style={styles.validationWarningText}>
                    ⚠️ {t('inspection.fail_requires_voice', 'Voice recording is required for failed items')}
                  </Text>
                )}
                {!hasMedia && (
                  <Text style={styles.validationWarningText}>
                    ⚠️ {t('inspection.fail_requires_media', 'Photo or video is required for failed items')}
                  </Text>
                )}
              </View>
            );
          }
          return null;
        })()}

        {/* Photo preview with upload indicator and Cloudinary optimizations */}
        {photoSource ? (
          <View style={styles.photoContainer}>
            <Image
              source={{ uri: isUploading ? photoSource : getPhotoThumbnailUrl(photoSource) }}
              style={styles.photoPreview}
              resizeMode="cover"
            />
            {isUploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.uploadingText}>{t('checklist.uploading')}</Text>
              </View>
            )}
            {!isUploading && inspData.status === 'draft' && (
              <TouchableOpacity
                style={styles.deleteMediaButton}
                onPress={() => handleDeletePhoto(item.id)}
                disabled={deletePhotoMutation.isPending}
              >
                {deletePhotoMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.deleteMediaButtonText}>✕</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Voice Transcription Box */}
        {(() => {
          const voiceAnalysis = currentAnswer?.voice_transcription || extractAnalysis(currentAnswer?.comment, 'voice');
          if (voiceAnalysis && (voiceAnalysis.en || voiceAnalysis.ar)) {
            return (
              <View style={[styles.analysisContainer, { borderLeftColor: '#722ed1' }]}>
                <Text style={[styles.analysisLabel, { color: '#722ed1' }]}>🎤 Voice Transcription / النص الصوتي</Text>
                {voiceAnalysis.en ? (
                  <View style={styles.bilingualSection}>
                    <Text style={styles.langTag}>EN</Text>
                    <Text style={styles.analysisText}>{voiceAnalysis.en}</Text>
                  </View>
                ) : null}
                {voiceAnalysis.ar ? (
                  <View style={[styles.bilingualSection, { marginTop: 8 }]}>
                    <Text style={[styles.langTag, { backgroundColor: '#52c41a' }]}>AR</Text>
                    <Text style={[styles.analysisText, { textAlign: 'right' }]}>{voiceAnalysis.ar}</Text>
                  </View>
                ) : null}
              </View>
            );
          }
          return null;
        })()}

        {/* Photo AI Analysis */}
        {(() => {
          const photoAnalysis = extractAnalysis(currentAnswer?.comment, 'photo');
          if (photoAnalysis && photoSource && !isUploading && (photoAnalysis.en || photoAnalysis.ar)) {
            return (
              <View style={[styles.analysisContainer, { borderLeftColor: '#52c41a' }]}>
                <Text style={[styles.analysisLabel, { color: '#52c41a' }]}>📷 Photo Analysis / تحليل الصورة</Text>
                {photoAnalysis.en ? (
                  <View style={styles.bilingualSection}>
                    <Text style={styles.langTag}>EN</Text>
                    <Text style={styles.analysisText}>{photoAnalysis.en}</Text>
                  </View>
                ) : null}
                {photoAnalysis.ar ? (
                  <View style={[styles.bilingualSection, { marginTop: 8 }]}>
                    <Text style={[styles.langTag, { backgroundColor: '#52c41a' }]}>AR</Text>
                    <Text style={[styles.analysisText, { textAlign: 'right' }]}>{photoAnalysis.ar}</Text>
                  </View>
                ) : null}
              </View>
            );
          }
          return null;
        })()}

        {/* Video preview */}
        {videoSource ? (
          <View style={styles.videoContainer}>
            <Video
              source={{ uri: getVideoPlaybackUrl(videoSource) }}
              style={styles.videoPreview}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping={false}
            />
            {isUploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.uploadingText}>{t('checklist.uploading_video')}</Text>
              </View>
            )}
            {!isUploading && inspData.status === 'draft' && (
              <TouchableOpacity
                style={styles.deleteMediaButton}
                onPress={() => handleDeleteVideo(item.id)}
                disabled={deleteVideoMutation.isPending}
              >
                {deleteVideoMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.deleteMediaButtonText}>✕</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Video AI Analysis */}
        {(() => {
          const videoAnalysis = extractAnalysis(currentAnswer?.comment, 'video');
          if (videoAnalysis && videoSource && !isUploading && (videoAnalysis.en || videoAnalysis.ar)) {
            return (
              <View style={[styles.analysisContainer, { borderLeftColor: '#1890ff' }]}>
                <Text style={[styles.analysisLabel, { color: '#1890ff' }]}>🎬 Video Analysis / تحليل الفيديو</Text>
                {videoAnalysis.en ? (
                  <View style={styles.bilingualSection}>
                    <Text style={styles.langTag}>EN</Text>
                    <Text style={styles.analysisText}>{videoAnalysis.en}</Text>
                  </View>
                ) : null}
                {videoAnalysis.ar ? (
                  <View style={[styles.bilingualSection, { marginTop: 8 }]}>
                    <Text style={[styles.langTag, { backgroundColor: '#52c41a' }]}>AR</Text>
                    <Text style={[styles.analysisText, { textAlign: 'right' }]}>{videoAnalysis.ar}</Text>
                  </View>
                ) : null}
              </View>
            );
          }
          return null;
        })()}
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
    const errorMessage =
      (error as any)?.response?.data?.message ||
      (error as any)?.response?.data?.error ||
      (error as any)?.message ||
      t('common.error');
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: '#757575', marginTop: 8 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryButtonText}>{t('common.back', 'Back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const inspData = inspection as Inspection;
  const equipmentId = (inspData as any).equipment_id ?? (inspData as any).equipment?.id;

  // Query open field-reported defects for this equipment
  const fieldReportsQuery = useQuery({
    queryKey: ['field-reports', equipmentId],
    queryFn: () => defectsApi.listQuickReports({ type: 'all', per_page: 10 }),
    enabled: !!equipmentId,
    select: (res) => {
      const items = (res.data as any)?.data ?? [];
      return items.filter((d: any) =>
        d.status === 'open' &&
        d.equipment_id === equipmentId &&
        d.report_source &&
        d.report_source !== 'inspection'
      );
    },
  });
  const fieldReports: any[] = fieldReportsQuery.data ?? [];

  // Merge checklist items from two sources:
  // 1. checklist_items array from getByAssignment response (includes all template items)
  // 2. checklist_item objects nested in each answer (includes answered items)
  const rawChecklistItems: ChecklistItem[] = (inspData as any).checklist_items ?? [];
  const itemsFromAnswers: ChecklistItem[] = (inspData.answers ?? [])
    .map((a: InspectionAnswer) => a.checklist_item)
    .filter((item): item is ChecklistItem => item !== null);
  const allItems = [...rawChecklistItems, ...itemsFromAnswers];
  const checklistItems = Array.from(
    new Map(allItems.map((item) => [item.id, item])).values(),
  ).sort((a, b) => a.order_index - b.order_index);

  // If no checklist items, we still show the equipment info
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

      {/* Field-reported defects banner */}
      {fieldReports.length > 0 && (
        <View style={styles.fieldReportsBanner}>
          <Text style={styles.fieldReportsBannerTitle}>
            ⚠️ {t('quick_report.pending_reports', { defaultValue: `${fieldReports.length} Field Report(s)`, count: fieldReports.length })}
          </Text>
          {fieldReports.slice(0, 3).map((report: any) => (
            <Text key={report.id} style={styles.fieldReportItem} numberOfLines={1}>
              • {report.description}
            </Text>
          ))}
          {fieldReports.length > 3 && (
            <Text style={styles.fieldReportMore}>
              +{fieldReports.length - 3} more
            </Text>
          )}
        </View>
      )}

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

      {/* Checklist Items with filter toggle */}
      {(() => {
        const unansweredCount = checklistItems.filter(
          (item) => !localAnswers[item.id]?.answer_value
        ).length;
        const displayItems = showOnlyUnanswered
          ? checklistItems.filter((item) => !localAnswers[item.id]?.answer_value)
          : checklistItems;

        return (
          <>
            <View style={styles.checklistHeaderRow}>
              <Text style={styles.sectionTitle}>{t('inspection.checklist')}</Text>
              <TouchableOpacity
                style={[styles.filterToggle, showOnlyUnanswered && styles.filterToggleActive]}
                onPress={() => setShowOnlyUnanswered(!showOnlyUnanswered)}
              >
                <Text style={[styles.filterToggleText, showOnlyUnanswered && styles.filterToggleTextActive]}>
                  {showOnlyUnanswered
                    ? t('checklist.show_all')
                    : t('checklist.unanswered')}
                </Text>
                {unansweredCount > 0 && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{unansweredCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
            {displayItems.length === 0 ? (
              <Text style={styles.noItemsText}>
                {showOnlyUnanswered
                  ? t('checklist.all_answered')
                  : t('common.noData')}
              </Text>
            ) : (
              displayItems.map(renderChecklistItem)
            )}
          </>
        );
      })()}

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
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
  },
  fieldReportsBanner: {
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  fieldReportsBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 6,
  },
  fieldReportItem: {
    fontSize: 13,
    color: '#424242',
    marginBottom: 2,
    paddingLeft: 4,
  },
  fieldReportMore: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
    fontStyle: 'italic',
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
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
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
  checklistHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  filterToggleActive: {
    backgroundColor: '#FFF3E0',
  },
  filterToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
  },
  filterToggleTextActive: {
    color: '#E65100',
  },
  filterBadge: {
    backgroundColor: '#FF9800',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  checklistCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
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
  buttonDisabled: {
    opacity: 0.5,
  },
  videoButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#E8F5E9',
  },
  videoButtonText: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '500',
  },
  videoContainer: {
    position: 'relative',
    marginTop: 8,
  },
  videoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  photoContainer: {
    position: 'relative',
    marginTop: 8,
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
  uploadingText: {
    color: '#fff',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  analysisContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1976D2',
  },
  analysisLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 4,
  },
  analysisText: {
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
    flex: 1,
  },
  bilingualSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  langTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#1890ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 2,
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
  deleteMediaButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    boxShadow: '0px 2px 2px rgba(0, 0, 0, 0.3)',
  },
  deleteMediaButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  validationWarnings: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  validationWarningText: {
    fontSize: 12,
    color: '#E65100',
    marginBottom: 4,
  },
});
