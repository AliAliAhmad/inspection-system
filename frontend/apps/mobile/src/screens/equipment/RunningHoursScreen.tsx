/**
 * RunningHoursScreen
 * Mobile screen for viewing and entering equipment running hours
 * Shows current hours, service status, and allows recording new readings
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

// Import API - graceful fallback
let runningHoursApi: any = null;
try {
  runningHoursApi = require('@inspection/shared').runningHoursApi;
} catch {
  // API not available
}

const STATUS_CONFIG = {
  ok: { color: '#52c41a', bg: '#f6ffed', icon: '✅', label: 'OK', labelAr: 'سليم' },
  approaching: { color: '#faad14', bg: '#fffbe6', icon: '⚠️', label: 'Service Soon', labelAr: 'صيانة قريبة' },
  overdue: { color: '#f5222d', bg: '#fff1f0', icon: '🔴', label: 'Overdue', labelAr: 'متأخر' },
};

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual', labelAr: 'يدوي', icon: '✍️' },
  { value: 'meter', label: 'Meter', labelAr: 'عداد', icon: '🔢' },
  { value: 'estimated', label: 'Estimated', labelAr: 'تقديري', icon: '📏' },
];

export default function RunningHoursScreen() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();

  const equipmentId = route.params?.equipmentId;
  const equipmentName = route.params?.equipmentName || '';

  const [showInput, setShowInput] = useState(false);
  const [newHours, setNewHours] = useState('');
  const [source, setSource] = useState('manual');
  const [notes, setNotes] = useState('');

  // Fetch running hours data
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['runningHours', equipmentId],
    queryFn: async () => {
      if (!runningHoursApi) return null;
      const res = await runningHoursApi.getRunningHours(equipmentId);
      return res.data?.data;
    },
    enabled: !!equipmentId,
  });

  // Fetch history
  const { data: history } = useQuery({
    queryKey: ['runningHoursHistory', equipmentId],
    queryFn: async () => {
      if (!runningHoursApi) return null;
      const res = await runningHoursApi.getRunningHoursHistory(equipmentId, { limit: 10 });
      return res.data?.data;
    },
    enabled: !!equipmentId,
  });

  // Submit new reading
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!runningHoursApi) throw new Error('API not available');
      const res = await runningHoursApi.updateRunningHours(equipmentId, {
        hours: parseFloat(newHours),
        source,
        notes: notes || undefined,
      });
      return res.data?.data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowInput(false);
      setNewHours('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['runningHours', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['runningHoursHistory', equipmentId] });
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        isAr ? 'خطأ' : 'Error',
        err?.response?.data?.message || (isAr ? 'فشل تسجيل القراءة' : 'Failed to record reading')
      );
    },
  });

  const handleSubmit = useCallback(() => {
    const hours = parseFloat(newHours);
    if (isNaN(hours) || hours < 0) {
      Alert.alert(isAr ? 'خطأ' : 'Error', isAr ? 'أدخل قراءة صالحة' : 'Enter a valid reading');
      return;
    }

    if (data?.current_hours && hours < data.current_hours) {
      Alert.alert(
        isAr ? 'تحذير' : 'Warning',
        isAr
          ? `القراءة الجديدة (${hours}) أقل من القراءة الحالية (${data.current_hours})`
          : `New reading (${hours}) is less than current (${data.current_hours})`
      );
      return;
    }

    submitMutation.mutate();
  }, [newHours, data, isAr, submitMutation]);

  const statusConfig = data?.service_status
    ? STATUS_CONFIG[data.service_status as keyof typeof STATUS_CONFIG]
    : STATUS_CONFIG.ok;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#1677ff" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="running-hours-screen" style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isAr && styles.rtlRow]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{isAr ? '→' : '←'}</Text>
        </TouchableOpacity>
        <View style={[styles.headerText, isAr && { alignItems: 'flex-end' }]}>
          <Text style={[styles.headerTitle, isAr && styles.rtlText]}>
            {isAr ? 'ساعات التشغيل' : 'Running Hours'}
          </Text>
          <Text style={[styles.headerSubtitle, isAr && styles.rtlText]} numberOfLines={1}>
            {equipmentName}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Current Hours Card */}
        <View style={[styles.currentCard, { borderColor: statusConfig.color }]}>
          <Text style={styles.currentIcon}>{statusConfig.icon}</Text>
          <Text style={styles.currentHours}>
            {data?.current_hours?.toLocaleString() || '0'}
          </Text>
          <Text style={[styles.currentLabel, isAr && styles.rtlText]}>
            {isAr ? 'ساعات' : 'hours'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {isAr ? statusConfig.labelAr : statusConfig.label}
            </Text>
          </View>

          {data?.hours_until_service !== null && data?.hours_until_service !== undefined && (
            <Text style={[styles.serviceInfo, { color: statusConfig.color }]}>
              {data.hours_until_service > 0
                ? isAr
                  ? `${Math.round(data.hours_until_service)} ساعة حتى الصيانة`
                  : `${Math.round(data.hours_until_service)}h until service`
                : isAr
                ? `متأخر بـ ${Math.abs(Math.round(data.hours_until_service))} ساعة`
                : `${Math.abs(Math.round(data.hours_until_service))}h overdue`}
            </Text>
          )}

          {/* Progress bar */}
          {data?.progress_percent !== undefined && (
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(data.progress_percent, 100)}%`,
                    backgroundColor: statusConfig.color,
                  },
                ]}
              />
            </View>
          )}
        </View>

        {/* Record New Reading Button */}
        {!showInput && (
          <TouchableOpacity
            testID="running-hours-record-btn"
            style={styles.recordBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowInput(true);
            }}
          >
            <Text style={styles.recordBtnText}>
              {isAr ? '➕ تسجيل قراءة جديدة' : '➕ Record New Reading'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Input Form */}
        {showInput && (
          <View style={styles.inputCard}>
            <Text style={[styles.inputTitle, isAr && styles.rtlText]}>
              {isAr ? 'قراءة جديدة' : 'New Reading'}
            </Text>

            <TextInput
              testID="running-hours-input"
              style={[styles.hoursInput, isAr && styles.rtlText]}
              placeholder={isAr ? 'أدخل الساعات' : 'Enter hours'}
              value={newHours}
              onChangeText={setNewHours}
              keyboardType="numeric"
              autoFocus
            />

            {/* Source selector */}
            <View style={[styles.sourceRow, isAr && styles.rtlRow]}>
              {SOURCE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.sourceChip, source === opt.value && styles.sourceChipActive]}
                  onPress={() => setSource(opt.value)}
                >
                  <Text style={styles.sourceIcon}>{opt.icon}</Text>
                  <Text
                    style={[
                      styles.sourceLabel,
                      source === opt.value && styles.sourceLabelActive,
                    ]}
                  >
                    {isAr ? opt.labelAr : opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.notesInput, isAr && styles.rtlText]}
              placeholder={isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <View style={[styles.inputActions, isAr && styles.rtlRow]}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowInput(false)}
              >
                <Text style={styles.cancelBtnText}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="running-hours-submit-btn"
                style={[styles.submitBtn, submitMutation.isPending && styles.disabledBtn]}
                onPress={handleSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {isAr ? '✅ حفظ' : '✅ Save'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Reading History */}
        {history?.readings && history.readings.length > 0 && (
          <View style={styles.historySection}>
            <Text style={[styles.historyTitle, isAr && styles.rtlText]}>
              {isAr ? '📜 سجل القراءات' : '📜 Reading History'}
            </Text>

            {history.readings.map((reading: any, idx: number) => (
              <View key={reading.id || idx} style={styles.historyItem}>
                <View style={[styles.historyRow, isAr && styles.rtlRow]}>
                  <Text style={styles.historyHours}>
                    {reading.hours?.toLocaleString()} h
                  </Text>
                  {reading.hours_since_last !== null && (
                    <Text style={styles.historyDelta}>
                      +{reading.hours_since_last}
                    </Text>
                  )}
                  <Text style={styles.historySource}>
                    {reading.source === 'meter' ? '🔢' : reading.source === 'estimated' ? '📏' : '✍️'}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(reading.recorded_at).toLocaleDateString(
                      isAr ? 'ar' : 'en',
                      { month: 'short', day: 'numeric' }
                    )}
                  </Text>
                </View>
                {reading.notes && (
                  <Text style={[styles.historyNotes, isAr && styles.rtlText]} numberOfLines={1}>
                    {reading.notes}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
    gap: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    padding: 4,
  },
  backText: {
    fontSize: 22,
    color: '#1677ff',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#262626',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8c8c8c',
  },
  scroll: {
    flex: 1,
    padding: 16,
  },
  currentCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    elevation: 2,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    marginBottom: 16,
  },
  currentIcon: {
    fontSize: 32,
  },
  currentHours: {
    fontSize: 42,
    fontWeight: '900',
    color: '#262626',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  currentLabel: {
    fontSize: 14,
    color: '#8c8c8c',
    marginTop: -4,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  serviceInfo: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBg: {
    width: '80%',
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  recordBtn: {
    backgroundColor: '#1677ff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  recordBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  inputCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
    elevation: 1,
  },
  inputTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#262626',
  },
  hoursInput: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sourceChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  sourceChipActive: {
    backgroundColor: '#e6f4ff',
    borderColor: '#1677ff',
  },
  sourceIcon: {
    fontSize: 14,
  },
  sourceLabel: {
    fontSize: 12,
    color: '#595959',
  },
  sourceLabelActive: {
    color: '#1677ff',
    fontWeight: '600',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  inputActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#595959',
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#52c41a',
  },
  submitBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  historySection: {
    gap: 8,
    marginBottom: 24,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#262626',
  },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyHours: {
    fontSize: 14,
    fontWeight: '700',
    color: '#262626',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  historyDelta: {
    fontSize: 11,
    color: '#52c41a',
    fontWeight: '600',
    backgroundColor: '#f6ffed',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  historySource: {
    fontSize: 12,
  },
  historyDate: {
    fontSize: 11,
    color: '#8c8c8c',
    marginLeft: 'auto',
  },
  historyNotes: {
    fontSize: 11,
    color: '#8c8c8c',
    paddingLeft: 4,
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
