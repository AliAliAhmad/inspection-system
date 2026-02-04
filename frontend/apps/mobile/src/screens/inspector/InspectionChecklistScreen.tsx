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
  Inspection,
  InspectionAnswer,
  ChecklistItem,
  InspectionProgress,
} from '@inspection/shared';

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
    select: (res) => {
      const ins = (res.data as any).data ?? res.data;
      return ins as Inspection;
    },
  });

  // Sync server answers into local state when inspection data loads
  useEffect(() => {
    if (inspection?.answers) {
      setLocalAnswers((prev) => {
        const merged: LocalAnswers = { ...prev };
        inspection.answers.forEach((ans: InspectionAnswer) => {
          // Get Cloudinary URLs from file records if available
          const photoUrl = (ans.photo_file as any)?.url || null;
          const videoUrl = (ans.video_file as any)?.url || null;
          const voiceNoteUrl = (ans.voice_note as any)?.url || null;

          const serverData = {
            answer_value: ans.answer_value,
            comment: ans.comment ?? undefined,
            photo_url: photoUrl ?? undefined,
            video_url: videoUrl ?? undefined,
            voice_note_id: ans.voice_note_id ?? undefined,
            voice_note_url: voiceNoteUrl ?? undefined,
          };

          // Merge: keep local upload state, but update comment from server (for AI analysis)
          merged[ans.checklist_item_id] = {
            ...serverData,
            ...prev[ans.checklist_item_id],
            // Always use server comment if it has AI analysis
            comment: (ans.comment && (ans.comment.includes('[Photo]:') || ans.comment.includes('[Video]:')))
              ? ans.comment
              : (prev[ans.checklist_item_id]?.comment ?? ans.comment ?? undefined),
            // Use server URLs if available
            photo_url: photoUrl || prev[ans.checklist_item_id]?.photo_url,
            video_url: videoUrl || prev[ans.checklist_item_id]?.video_url,
            voice_note_url: voiceNoteUrl || prev[ans.checklist_item_id]?.voice_note_url,
          };
        });
        return merged;
      });
    }
  }, [inspection]);

  const {
    data: progress,
  } = useQuery({
    queryKey: ['inspectionProgress', id],
    queryFn: () => inspectionsApi.getProgress(id),
    select: (res) => res.data.data ?? res.data,
  });

  const answerMutation = useMutation({
    mutationFn: (payload: { checklist_item_id: number; answer_value: string; comment?: string; voice_note_id?: number }) =>
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

  // Upload photo to Cloudinary via API
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
        // Create FormData for React Native
        const formData = new FormData();
        formData.append('file', {
          uri,
          name: fileName || 'photo.jpg',
          type: 'image/jpeg',
        } as any);
        formData.append('checklist_item_id', String(checklistItemId));

        // Upload to Cloudinary via API
        const response = await inspectionsApi.uploadMedia(id, checklistItemId, formData as any);
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

        // Refresh inspection data immediately
        queryClient.invalidateQueries({ queryKey: ['inspection', id] });

        // Poll for AI analysis (runs in background, takes a few seconds)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['inspection', id] });
        }, 5000);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['inspection', id] });
        }, 10000);
      } catch (error) {
        console.error('Photo upload failed:', error);
        Alert.alert(t('common.error'), 'Failed to upload photo');

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
    [id, queryClient, t],
  );

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
        Alert.alert(t('common.error'), 'Gallery permission is required.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
        Alert.alert(t('common.error'), 'Camera permission is required.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
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

  // Upload video to Cloudinary
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
        const formData = new FormData();
        formData.append('file', {
          uri,
          name: fileName || 'video.mp4',
          type: 'video/mp4',
        } as any);
        formData.append('checklist_item_id', String(checklistItemId));

        const response = await inspectionsApi.uploadMedia(id, checklistItemId, formData as any);
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

        queryClient.invalidateQueries({ queryKey: ['inspection', id] });

        // Poll for AI analysis (runs in background, takes a few seconds)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['inspection', id] });
        }, 5000);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['inspection', id] });
        }, 10000);
      } catch (error) {
        console.error('Video upload failed:', error);
        Alert.alert(t('common.error'), 'Failed to upload video');
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
    [id, queryClient, t],
  );

  // Helper to extract AI analysis from comment
  const extractAnalysis = (comment: string | undefined, type: 'photo' | 'video'): string | null => {
    if (!comment) return null;
    const prefix = type === 'photo' ? '[Photo]:' : '[Video]:';
    const lines = comment.split('\n');
    for (const line of lines) {
      if (line.startsWith(prefix)) {
        return line.substring(prefix.length).trim();
      }
    }
    return null;
  };

  const renderChecklistItem = (item: ChecklistItem) => {
    const questionText = isArabic && item.question_text_ar
      ? item.question_text_ar
      : item.question_text;
    const commentExpanded = expandedComments.has(item.id);
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
            style={styles.commentToggle}
            onPress={() => toggleComment(item.id)}
          >
            <Text style={styles.commentToggleText}>{t('inspection.comment')}</Text>
          </TouchableOpacity>

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

        {commentExpanded ? (
          <VoiceTextInput
            style={styles.commentInput}
            value={currentAnswer?.comment ?? ''}
            onChangeText={(text) => handleComment(item.id, text)}
            onBlur={() => saveComment(item.id)}
            placeholder={t('inspection.comment')}
            multiline
            numberOfLines={2}
          />
        ) : null}

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
                <Text style={styles.uploadingText}>Uploading...</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Photo AI Analysis */}
        {(() => {
          const photoAnalysis = extractAnalysis(currentAnswer?.comment, 'photo');
          if (photoAnalysis && photoSource && !isUploading) {
            return (
              <View style={styles.analysisContainer}>
                <Text style={styles.analysisLabel}>🤖 AI Analysis:</Text>
                <Text style={styles.analysisText}>{photoAnalysis}</Text>
              </View>
            );
          }
          return null;
        })()}

        {/* Video preview */}
        {videoSource ? (
          <View style={styles.videoContainer}>
            <Video
              source={{ uri: videoSource }}
              style={styles.videoPreview}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping={false}
            />
            {isUploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.uploadingText}>Uploading video...</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Video AI Analysis */}
        {(() => {
          const videoAnalysis = extractAnalysis(currentAnswer?.comment, 'video');
          if (videoAnalysis && videoSource && !isUploading) {
            return (
              <View style={styles.analysisContainer}>
                <Text style={styles.analysisLabel}>🤖 AI Analysis:</Text>
                <Text style={styles.analysisText}>{videoAnalysis}</Text>
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
