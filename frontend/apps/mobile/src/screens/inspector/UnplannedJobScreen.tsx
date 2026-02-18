import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import VoiceNoteRecorder from '../../components/VoiceNoteRecorder';
import { useTheme } from '../../hooks/useTheme';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { getApiClient } from '@inspection/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type JobType = 'assist_team' | 'requested_job';

export default function UnplannedJobScreen() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigation = useNavigation<NavigationProp>();
  const { colors, isDark } = useTheme();

  const [jobType, setJobType] = useState<JobType>('assist_team');
  const [equipmentName, setEquipmentName] = useState('');
  const [description, setDescription] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [voiceNoteId, setVoiceNoteId] = useState<number | null>(null);
  const [voiceTranscription, setVoiceTranscription] = useState<{ en: string; ar: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRequested = jobType === 'requested_job';
  const accentColor = jobType === 'assist_team' ? '#1677ff' : '#fa8c16';
  const accentBg = jobType === 'assist_team'
    ? (isDark ? '#111d2c' : '#e6f4ff')
    : (isDark ? '#2b1d11' : '#fff7e6');

  const handleVoiceNote = useCallback(
    (noteId: number, transcription?: { en: string; ar: string }) => {
      setVoiceNoteId(noteId);
      if (transcription) setVoiceTranscription(transcription);
    },
    []
  );

  const canSubmit = useMemo(() => {
    if (!equipmentName.trim()) return false;
    if (!description.trim()) return false;
    if (!workDone.trim()) return false;
    if (isRequested && !requestedBy.trim()) return false;
    return true;
  }, [equipmentName, description, workDone, isRequested, requestedBy]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const voiceText = voiceTranscription
        ? `${voiceTranscription.en}${voiceTranscription.ar ? ` | ${voiceTranscription.ar}` : ''}`
        : undefined;

      const api = getApiClient();
      await api.post('/api/unplanned-jobs', {
        job_type: jobType,
        equipment_name: equipmentName.trim(),
        description: description.trim(),
        work_done: workDone.trim(),
        requested_by: isRequested ? requestedBy.trim() : undefined,
        voice_note_id: voiceNoteId || undefined,
        voice_transcription: voiceText,
      });

      Alert.alert(t('unplanned_job.submitted'), '', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert(t('unplanned_job.failed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, jobType, equipmentName, description, workDone, isRequested, requestedBy, voiceNoteId, voiceTranscription, t, navigation]);

  const styles = useMemo(
    () => createStyles(colors, isDark, accentColor, accentBg, isAr),
    [colors, isDark, accentColor, accentBg, isAr]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons
            name={isAr ? 'chevron-forward' : 'chevron-back'}
            size={28}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('unplanned_job.title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Job Type Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              { borderColor: '#1677ff' },
              jobType === 'assist_team' && { backgroundColor: '#1677ff' },
            ]}
            onPress={() => setJobType('assist_team')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="people"
              size={22}
              color={jobType === 'assist_team' ? '#fff' : '#1677ff'}
            />
            <Text
              style={[
                styles.toggleText,
                { color: jobType === 'assist_team' ? '#fff' : '#1677ff' },
              ]}
            >
              {t('unplanned_job.assist_team')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.toggleBtn,
              { borderColor: '#fa8c16' },
              jobType === 'requested_job' && { backgroundColor: '#fa8c16' },
            ]}
            onPress={() => setJobType('requested_job')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="document-text"
              size={22}
              color={jobType === 'requested_job' ? '#fff' : '#fa8c16'}
            />
            <Text
              style={[
                styles.toggleText,
                { color: jobType === 'requested_job' ? '#fff' : '#fa8c16' },
              ]}
            >
              {t('unplanned_job.requested_job')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Equipment Name */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('unplanned_job.equipment_name')}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                textAlign: isAr ? 'right' : 'left',
              },
            ]}
            placeholder={t('unplanned_job.equipment_name')}
            placeholderTextColor={colors.textTertiary}
            value={equipmentName}
            onChangeText={setEquipmentName}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('unplanned_job.description')}
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                textAlign: isAr ? 'right' : 'left',
              },
            ]}
            placeholder={t('unplanned_job.description')}
            placeholderTextColor={colors.textTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* What You Did */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('unplanned_job.work_done')}
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                textAlign: isAr ? 'right' : 'left',
              },
            ]}
            placeholder={t('unplanned_job.work_done')}
            placeholderTextColor={colors.textTertiary}
            value={workDone}
            onChangeText={setWorkDone}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Requested By (conditional) */}
        {isRequested && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {t('unplanned_job.requested_by')}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  textAlign: isAr ? 'right' : 'left',
                },
              ]}
              placeholder={t('unplanned_job.requested_by')}
              placeholderTextColor={colors.textTertiary}
              value={requestedBy}
              onChangeText={setRequestedBy}
            />
          </View>
        )}

        {/* Voice Note */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('unplanned_job.voice_note')}
          </Text>
          <VoiceNoteRecorder
            onVoiceNoteRecorded={handleVoiceNote}
            language={isAr ? 'ar' : 'en'}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: canSubmit ? accentColor : colors.disabled },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          activeOpacity={0.7}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={20} color={canSubmit ? '#fff' : colors.disabledText} />
              <Text
                style={[
                  styles.submitText,
                  { color: canSubmit ? '#fff' : colors.disabledText },
                ]}
              >
                {isSubmitting ? t('unplanned_job.submitting') : t('unplanned_job.submit')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(
  colors: any,
  isDark: boolean,
  accentColor: string,
  accentBg: string,
  isAr: boolean,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: isAr ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },

    // Toggle
    toggleRow: {
      flexDirection: isAr ? 'row-reverse' : 'row',
      gap: 12,
      marginBottom: 20,
    },
    toggleBtn: {
      flex: 1,
      flexDirection: isAr ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
      borderRadius: 12,
      borderWidth: 2,
    },
    toggleText: {
      fontSize: 15,
      fontWeight: '700',
    },

    // Form sections
    section: {
      marginTop: 16,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: isAr ? 'right' : 'left',
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      fontSize: 15,
    },
    textArea: {
      minHeight: 100,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },

    // Submit
    submitBtn: {
      flexDirection: isAr ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 56,
      borderRadius: 14,
      marginTop: 28,
    },
    submitText: {
      fontSize: 17,
      fontWeight: '700',
    },
  });
}
