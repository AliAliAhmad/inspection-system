import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  I18nManager,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { compressImage } from '../utils/compress-image';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import { getApiClient } from '@inspection/shared';
import { useOffline } from '../providers/OfflineProvider';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface AdHocDefectSheetProps {
  visible: boolean;
  onClose: () => void;
  inspectionId: number;
  onSuccess: () => void;
}

const SEVERITY_CONFIG: { key: Severity; urgency: number; color: string }[] = [
  { key: 'low', urgency: 0, color: '#52c41a' },
  { key: 'medium', urgency: 1, color: '#faad14' },
  { key: 'high', urgency: 2, color: '#fa8c16' },
  { key: 'critical', urgency: 3, color: '#f5222d' },
];

export default function AdHocDefectSheet({
  visible,
  onClose,
  inspectionId,
  onSuccess,
}: AdHocDefectSheetProps) {
  const { t } = useTranslation();
  const { isOnline } = useOffline();
  const isRtl = I18nManager.isRTL;

  // Form state
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [voiceNoteId, setVoiceNoteId] = useState<number | null>(null);
  const [voiceTranscription, setVoiceTranscription] = useState<{ en: string; ar: string } | null>(null);
  const [, setVoiceUrl] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setPhotoUri(null);
    setIsUploadingPhoto(false);
    setVoiceNoteId(null);
    setVoiceTranscription(null);
    setVoiceUrl(null);
    setSeverity(null);
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // Take photo — same flow as checklist answers
  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('checklist.camera_permission_required', 'Camera permission required'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      // Compress image — same as checklist
      const compressed = await compressImage(result.assets[0].uri);
      setPhotoUri(compressed || result.assets[0].uri);
    }
  }, [t]);

  // Voice note callback — same as checklist
  const handleVoiceNote = useCallback(
    (noteId: number, transcription?: { en: string; ar: string }, noteUrl?: string) => {
      setVoiceNoteId(noteId);
      if (transcription) setVoiceTranscription(transcription);
      if (noteUrl) setVoiceUrl(noteUrl);
    },
    []
  );

  // Submit the ad-hoc finding
  const handleSubmit = useCallback(async () => {
    // Validate
    if (!photoUri) {
      Alert.alert(t('adhoc_defect.photo_missing', 'Photo is required'));
      return;
    }
    if (!voiceNoteId) {
      Alert.alert(t('adhoc_defect.voice_missing', 'Voice note is required'));
      return;
    }
    if (!severity) {
      Alert.alert(t('adhoc_defect.severity_missing', 'Select a severity level'));
      return;
    }

    setIsSubmitting(true);
    try {
      const urgencyLevel = SEVERITY_CONFIG.find((s) => s.key === severity)?.urgency ?? 1;

      // Build description from transcription
      const comment = voiceTranscription
        ? voiceTranscription.en || voiceTranscription.ar || 'Additional finding'
        : 'Additional finding';

      // Step 1: Create the ad-hoc answer (same endpoint as checklist answers)
      const answerRes = await getApiClient().post(
        `/api/inspections/${inspectionId}/answer`,
        {
          checklist_item_id: null,
          answer_value: 'fail',
          comment,
          voice_note_id: voiceNoteId,
          voice_transcription: voiceTranscription,
          urgency_level: urgencyLevel,
        },
        { timeout: 30000 }
      );

      const answerId = (answerRes.data as any)?.answer?.id;

      // Step 2: Upload photo linked to this answer (same endpoint as checklist photos)
      if (photoUri && answerId) {
        setIsUploadingPhoto(true);
        try {
          const formData = new FormData();
          const filename = `adhoc_defect_${Date.now()}.jpg`;
          formData.append('file', {
            uri: photoUri,
            type: 'image/jpeg',
            name: filename,
          } as any);
          formData.append('answer_id', String(answerId));

          await getApiClient().post(
            `/api/inspections/${inspectionId}/upload-media`,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: 120000,
            }
          );
        } catch (uploadErr: any) {
          console.warn('Ad-hoc photo upload failed:', uploadErr?.message);
          // Photo will need to be re-uploaded manually if offline
        } finally {
          setIsUploadingPhoto(false);
        }
      }

      // Success
      Alert.alert(t('adhoc_defect.success', 'Defect reported successfully'));
      resetForm();
      onSuccess();
    } catch (err: any) {
      console.error('Ad-hoc defect submission failed:', err);
      const message = err?.response?.data?.message || err?.message || 'Failed to submit';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [photoUri, voiceNoteId, voiceTranscription, severity, inspectionId, isOnline, t, resetForm, onSuccess]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isRtl && styles.rtlText]}>
            {t('adhoc_defect.title', 'Report Additional Defect')}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. Photo Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, isRtl && styles.rtlText]}>
              📷 {t('adhoc_defect.photo_required', 'Take a photo of the defect')} *
            </Text>
            {photoUri ? (
              <View style={styles.photoPreview}>
                <Image source={{ uri: photoUri }} style={styles.photoImage} />
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={handleTakePhoto}
                >
                  <Text style={styles.retakeBtnText}>↻</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                <Text style={styles.photoButtonIcon}>📷</Text>
                <Text style={styles.photoButtonText}>
                  {t('quick_report.take_photo', 'Take Photo')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 2. Voice Note Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, isRtl && styles.rtlText]}>
              🎤 {t('adhoc_defect.voice_required', 'Record a voice description')} *
            </Text>
            <VoiceNoteRecorder
              onVoiceNoteRecorded={handleVoiceNote}
              isOnline={isOnline}
              inspectionId={inspectionId}
              checklistItemId={0}
              currentAnswerValue="fail"
              urgency_level={SEVERITY_CONFIG.find((s) => s.key === severity)?.urgency}
            />
            {voiceTranscription?.en && (
              <View style={styles.transcriptionBox}>
                <Text style={styles.transcriptionText} numberOfLines={3}>
                  {voiceTranscription.en}
                </Text>
              </View>
            )}
          </View>

          {/* 3. Severity Picker */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, isRtl && styles.rtlText]}>
              ⚠️ {t('adhoc_defect.severity', 'Severity')} *
            </Text>
            <View style={styles.severityRow}>
              {SEVERITY_CONFIG.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.severityBtn,
                    { borderColor: item.color },
                    severity === item.key && { backgroundColor: item.color },
                  ]}
                  onPress={() => setSeverity(item.key)}
                >
                  <Text
                    style={[
                      styles.severityBtnText,
                      severity === item.key && { color: '#fff' },
                    ]}
                  >
                    {t(`adhoc_defect.severity_${item.key}`, item.key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!photoUri || !voiceNoteId || !severity || isSubmitting) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!photoUri || !voiceNoteId || !severity || isSubmitting}
          >
            {isSubmitting || isUploadingPhoto ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {t('adhoc_defect.submit', 'Add Finding')}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'center',
  },
  rtlText: {
    textAlign: 'right',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  // Photo
  photoButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#d9d9d9',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  photoButtonIcon: {
    fontSize: 32,
  },
  photoButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  photoPreview: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  retakeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retakeBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  // Transcription
  transcriptionBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#f0fdf0',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#52c41a',
  },
  transcriptionText: {
    fontSize: 13,
    color: '#555',
    fontStyle: 'italic',
  },
  // Severity
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
  },
  severityBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
  },
  // Submit
  submitBtn: {
    backgroundColor: '#f5222d',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
