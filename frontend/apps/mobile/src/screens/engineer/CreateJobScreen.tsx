import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import VoiceTextInput from '../../components/VoiceTextInput';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import { engineerJobsApi } from '@inspection/shared';
import type { CreateEngineerJobPayload } from '@inspection/shared';

type JobType = 'custom_project' | 'system_review' | 'special_task';
type Category = 'major' | 'minor';

const JOB_TYPES: { key: JobType; icon: string }[] = [
  { key: 'custom_project', icon: '\u2699' },
  { key: 'system_review', icon: '\u{1F50D}' },
  { key: 'special_task', icon: '\u2605' },
];

export default function CreateJobScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [jobType, setJobType] = useState<JobType | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [majorReason, setMajorReason] = useState('');

  const createMutation = useMutation({
    mutationFn: (payload: CreateEngineerJobPayload) => engineerJobsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engineerJobs'] });
      navigation.goBack();
    },
    onError: () => {
      Alert.alert(
        t('common.error', 'Error'),
        t('common.create_error', 'Failed to create job. Please try again.')
      );
    },
  });

  const handleSubmit = () => {
    if (!jobType) {
      Alert.alert(t('common.error', 'Error'), t('common.select_job_type', 'Please select a job type.'));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t('common.error', 'Error'), t('common.enter_title', 'Please enter a title.'));
      return;
    }
    if (!description.trim()) {
      Alert.alert(t('common.error', 'Error'), t('common.enter_description', 'Please enter a description.'));
      return;
    }
    if (category === 'major' && !majorReason.trim()) {
      Alert.alert(t('common.error', 'Error'), t('common.enter_major_reason', 'Please enter a reason for major category.'));
      return;
    }

    const payload: CreateEngineerJobPayload = {
      engineer_id: user?.id,
      job_type: jobType,
      title: title.trim(),
      description: description.trim(),
      category: category ?? undefined,
      major_reason: category === 'major' ? majorReason.trim() : undefined,
    };

    createMutation.mutate(payload);
  };

  const getTypeLabel = (type: JobType) => {
    switch (type) {
      case 'custom_project': return t('common.custom_project', 'Custom Project');
      case 'system_review': return t('common.system_review', 'System Review');
      case 'special_task': return t('common.special_task', 'Special Task');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t('nav.create_job', 'Create Job')}</Text>

      {/* Job Type */}
      <Text style={styles.label}>{t('common.job_type', 'Job Type')}</Text>
      <View style={styles.typeRow}>
        {JOB_TYPES.map(({ key, icon }) => (
          <TouchableOpacity
            key={key}
            style={[styles.typeCard, jobType === key && styles.typeCardActive]}
            onPress={() => setJobType(key)}
          >
            <Text style={styles.typeIcon}>{icon}</Text>
            <Text style={[styles.typeLabel, jobType === key && styles.typeLabelActive]}>
              {getTypeLabel(key)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Title */}
      <Text style={styles.label}>{t('common.title', 'Title')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('common.enter_title', 'Enter job title')}
        placeholderTextColor="#9E9E9E"
      />

      {/* Description */}
      <Text style={styles.label}>{t('common.description', 'Description')}</Text>
      <VoiceTextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder={t('common.enter_description', 'Enter job description')}
        placeholderTextColor="#9E9E9E"
        multiline
        numberOfLines={4}
      />

      {/* Category */}
      <Text style={styles.label}>{t('common.category', 'Category')}</Text>
      <View style={styles.categoryRow}>
        <TouchableOpacity
          style={[styles.categoryButton, category === 'major' && styles.categoryMajorActive]}
          onPress={() => setCategory(category === 'major' ? null : 'major')}
        >
          <Text style={[styles.categoryText, category === 'major' && styles.categoryTextActive]}>
            {t('common.major', 'Major')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.categoryButton, category === 'minor' && styles.categoryMinorActive]}
          onPress={() => setCategory(category === 'minor' ? null : 'minor')}
        >
          <Text style={[styles.categoryText, category === 'minor' && styles.categoryTextActive]}>
            {t('common.minor', 'Minor')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Major Reason */}
      {category === 'major' && (
        <>
          <Text style={styles.label}>{t('common.major_reason', 'Major Reason')}</Text>
          <VoiceTextInput
            style={[styles.input, styles.textArea]}
            value={majorReason}
            onChangeText={setMajorReason}
            placeholder={t('common.enter_major_reason', 'Explain why this is a major job')}
            placeholderTextColor="#9E9E9E"
            multiline
            numberOfLines={3}
          />
        </>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.cancelButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>{t('common.cancel', 'Cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.submitButton]}
          onPress={handleSubmit}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('common.submit', 'Submit')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '600', color: '#424242', marginBottom: 10, marginTop: 16 },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  typeCardActive: { borderColor: '#1976D2', backgroundColor: '#E3F2FD' },
  typeIcon: { fontSize: 28, marginBottom: 8 },
  typeLabel: { fontSize: 12, fontWeight: '500', color: '#616161', textAlign: 'center' },
  typeLabelActive: { color: '#1976D2', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#212121',
  },
  textArea: { textAlignVertical: 'top', minHeight: 100 },
  categoryRow: { flexDirection: 'row', gap: 12 },
  categoryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  categoryMajorActive: { borderColor: '#F44336', backgroundColor: '#FFEBEE' },
  categoryMinorActive: { borderColor: '#FF9800', backgroundColor: '#FFF3E0' },
  categoryText: { fontSize: 15, fontWeight: '500', color: '#616161' },
  categoryTextActive: { color: '#212121', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 32 },
  actionButton: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  cancelButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#BDBDBD' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#616161' },
  submitButton: { backgroundColor: '#1976D2' },
  submitButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
