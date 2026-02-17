import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  shiftHandoverApi,
  type PendingItem,
  type SafetyAlert,
  type EquipmentIssue,
  type CreateHandoverPayload,
} from '@inspection/shared';
import { useTheme } from '../../hooks/useTheme';

const SHIFT_TYPES = ['day', 'night', 'morning', 'afternoon'] as const;
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;
const SEVERITY_OPTIONS = ['info', 'warning', 'critical'] as const;
const ISSUE_STATUS = ['new', 'ongoing', 'resolved'] as const;

export default function CreateHandoverScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';

  // Form state
  const [shiftType, setShiftType] = useState<string>('day');
  const [notes, setNotes] = useState('');
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>([]);
  const [equipmentIssues, setEquipmentIssues] = useState<EquipmentIssue[]>([]);

  // Inline add forms
  const [newPendingDesc, setNewPendingDesc] = useState('');
  const [newPendingPriority, setNewPendingPriority] = useState<PendingItem['priority']>('medium');
  const [newPendingEquipment, setNewPendingEquipment] = useState('');

  const [newAlertText, setNewAlertText] = useState('');
  const [newAlertSeverity, setNewAlertSeverity] = useState<SafetyAlert['severity']>('warning');

  const [newIssueName, setNewIssueName] = useState('');
  const [newIssueDesc, setNewIssueDesc] = useState('');
  const [newIssueStatus, setNewIssueStatus] = useState<EquipmentIssue['status']>('new');

  const shiftLabel = (s: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      day: { en: 'Day', ar: 'نهاري' },
      night: { en: 'Night', ar: 'ليلي' },
      morning: { en: 'Morning', ar: 'صباحي' },
      afternoon: { en: 'Afternoon', ar: 'مسائي' },
    };
    return isAr ? labels[s]?.ar ?? s : labels[s]?.en ?? s;
  };

  const priorityLabel = (p: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      low: { en: 'Low', ar: 'منخفض' },
      medium: { en: 'Medium', ar: 'متوسط' },
      high: { en: 'High', ar: 'عالي' },
      critical: { en: 'Critical', ar: 'حرج' },
    };
    return isAr ? labels[p]?.ar ?? p : labels[p]?.en ?? p;
  };

  const severityLabel = (s: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      info: { en: 'Info', ar: 'معلومات' },
      warning: { en: 'Warning', ar: 'تحذير' },
      critical: { en: 'Critical', ar: 'حرج' },
    };
    return isAr ? labels[s]?.ar ?? s : labels[s]?.en ?? s;
  };

  const statusLabel = (s: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      new: { en: 'New', ar: 'جديد' },
      ongoing: { en: 'Ongoing', ar: 'مستمر' },
      resolved: { en: 'Resolved', ar: 'تم الحل' },
    };
    return isAr ? labels[s]?.ar ?? s : labels[s]?.en ?? s;
  };

  const priorityColor = (p: string) => {
    const map: Record<string, string> = { low: '#4CAF50', medium: '#FF9800', high: '#F44336', critical: '#9C27B0' };
    return map[p] ?? '#999';
  };

  const severityColor = (s: string) => {
    const map: Record<string, string> = { info: '#2196F3', warning: '#FF9800', critical: '#F44336' };
    return map[s] ?? '#999';
  };

  // Add helpers
  const addPendingItem = useCallback(() => {
    if (!newPendingDesc.trim()) return;
    setPendingItems(prev => [...prev, {
      description: newPendingDesc.trim(),
      priority: newPendingPriority,
      equipment_name: newPendingEquipment.trim() || undefined,
    }]);
    setNewPendingDesc('');
    setNewPendingEquipment('');
    setNewPendingPriority('medium');
  }, [newPendingDesc, newPendingPriority, newPendingEquipment]);

  const removePendingItem = useCallback((index: number) => {
    setPendingItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addSafetyAlert = useCallback(() => {
    if (!newAlertText.trim()) return;
    setSafetyAlerts(prev => [...prev, {
      alert: newAlertText.trim(),
      severity: newAlertSeverity,
    }]);
    setNewAlertText('');
    setNewAlertSeverity('warning');
  }, [newAlertText, newAlertSeverity]);

  const removeSafetyAlert = useCallback((index: number) => {
    setSafetyAlerts(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addEquipmentIssue = useCallback(() => {
    if (!newIssueName.trim() || !newIssueDesc.trim()) return;
    setEquipmentIssues(prev => [...prev, {
      equipment_name: newIssueName.trim(),
      issue: newIssueDesc.trim(),
      status: newIssueStatus,
    }]);
    setNewIssueName('');
    setNewIssueDesc('');
    setNewIssueStatus('new');
  }, [newIssueName, newIssueDesc, newIssueStatus]);

  const removeEquipmentIssue = useCallback((index: number) => {
    setEquipmentIssues(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Submit
  const submitMutation = useMutation({
    mutationFn: (payload: CreateHandoverPayload) => shiftHandoverApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-handover-pending'] });
      queryClient.invalidateQueries({ queryKey: ['shift-handover-latest'] });
      queryClient.invalidateQueries({ queryKey: ['my-handovers'] });
      Alert.alert(
        isAr ? 'تم' : 'Done',
        isAr ? 'تم إنشاء تسليم الوردية بنجاح' : 'Shift handover created successfully',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || (isAr ? 'فشل في الإنشاء' : 'Failed to create');
      Alert.alert(isAr ? 'خطأ' : 'Error', msg);
    },
  });

  const handleSubmit = () => {
    if (!notes.trim() && pendingItems.length === 0 && safetyAlerts.length === 0 && equipmentIssues.length === 0) {
      Alert.alert(
        isAr ? 'تنبيه' : 'Notice',
        isAr ? 'يرجى إضافة ملاحظات أو عناصر معلقة' : 'Please add notes or pending items',
      );
      return;
    }

    submitMutation.mutate({
      shift_type: shiftType,
      notes: notes.trim() || undefined,
      pending_items: pendingItems.length > 0 ? pendingItems : undefined,
      safety_alerts: safetyAlerts.length > 0 ? safetyAlerts : undefined,
      equipment_issues: equipmentIssues.length > 0 ? equipmentIssues : undefined,
    });
  };

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[st.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <Text style={[st.backText, { color: colors.primary }]}>
              {isAr ? '←' : '←'}
            </Text>
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: colors.text }]}>
            {isAr ? 'إنشاء تسليم وردية' : 'Create Shift Handover'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent}>
          {/* Shift Type */}
          <Text style={[st.label, { color: colors.text }]}>
            {isAr ? 'نوع الوردية' : 'Shift Type'}
          </Text>
          <View style={st.chipRow}>
            {SHIFT_TYPES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  st.chip,
                  { borderColor: colors.border },
                  shiftType === s && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setShiftType(s)}
              >
                <Text style={[st.chipText, { color: colors.text }, shiftType === s && { color: '#fff' }]}>
                  {shiftLabel(s)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Notes */}
          <Text style={[st.label, { color: colors.text }]}>
            {isAr ? 'ملاحظات عامة' : 'General Notes'}
          </Text>
          <TextInput
            style={[st.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={notes}
            onChangeText={setNotes}
            placeholder={isAr ? 'أي ملاحظات للوردية القادمة...' : 'Any notes for the incoming shift...'}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* ─── Pending Items Section ─── */}
          <View style={st.sectionHeader}>
            <Text style={[st.label, { color: colors.text, marginBottom: 0 }]}>
              {isAr ? 'عناصر معلقة' : 'Pending Items'}
            </Text>
            <Text style={[st.countBadge, { color: colors.textSecondary }]}>
              {pendingItems.length}
            </Text>
          </View>

          {pendingItems.map((item, idx) => (
            <View key={idx} style={[st.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={st.itemCardContent}>
                <View style={[st.priorityDot, { backgroundColor: priorityColor(item.priority) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.itemText, { color: colors.text }]}>{item.description}</Text>
                  {item.equipment_name && (
                    <Text style={[st.itemSub, { color: colors.textTertiary }]}>{item.equipment_name}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => removePendingItem(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={st.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={[st.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[st.input, { color: colors.text, borderColor: colors.border }]}
              value={newPendingDesc}
              onChangeText={setNewPendingDesc}
              placeholder={isAr ? 'وصف العنصر المعلق...' : 'Pending item description...'}
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[st.input, st.inputSmall, { color: colors.text, borderColor: colors.border }]}
              value={newPendingEquipment}
              onChangeText={setNewPendingEquipment}
              placeholder={isAr ? 'اسم المعدة (اختياري)' : 'Equipment name (optional)'}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={st.chipRow}>
              {PRIORITY_OPTIONS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    st.miniChip,
                    { borderColor: priorityColor(p) },
                    newPendingPriority === p && { backgroundColor: priorityColor(p) },
                  ]}
                  onPress={() => setNewPendingPriority(p)}
                >
                  <Text style={[st.miniChipText, { color: priorityColor(p) }, newPendingPriority === p && { color: '#fff' }]}>
                    {priorityLabel(p)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[st.addBtn, { backgroundColor: colors.primary, opacity: newPendingDesc.trim() ? 1 : 0.4 }]}
              onPress={addPendingItem}
              disabled={!newPendingDesc.trim()}
            >
              <Text style={st.addBtnText}>{isAr ? '+ إضافة' : '+ Add'}</Text>
            </TouchableOpacity>
          </View>

          {/* ─── Safety Alerts Section ─── */}
          <View style={st.sectionHeader}>
            <Text style={[st.label, { color: colors.text, marginBottom: 0 }]}>
              {isAr ? 'تنبيهات الأمان' : 'Safety Alerts'}
            </Text>
            <Text style={[st.countBadge, { color: colors.textSecondary }]}>
              {safetyAlerts.length}
            </Text>
          </View>

          {safetyAlerts.map((alert, idx) => (
            <View key={idx} style={[st.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={st.itemCardContent}>
                <View style={[st.priorityDot, { backgroundColor: severityColor(alert.severity) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.itemText, { color: colors.text }]}>{alert.alert}</Text>
                  <Text style={[st.itemSub, { color: severityColor(alert.severity) }]}>{severityLabel(alert.severity)}</Text>
                </View>
                <TouchableOpacity onPress={() => removeSafetyAlert(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={st.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={[st.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[st.input, { color: colors.text, borderColor: colors.border }]}
              value={newAlertText}
              onChangeText={setNewAlertText}
              placeholder={isAr ? 'وصف التنبيه...' : 'Alert description...'}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={st.chipRow}>
              {SEVERITY_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    st.miniChip,
                    { borderColor: severityColor(s) },
                    newAlertSeverity === s && { backgroundColor: severityColor(s) },
                  ]}
                  onPress={() => setNewAlertSeverity(s)}
                >
                  <Text style={[st.miniChipText, { color: severityColor(s) }, newAlertSeverity === s && { color: '#fff' }]}>
                    {severityLabel(s)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[st.addBtn, { backgroundColor: '#E53935', opacity: newAlertText.trim() ? 1 : 0.4 }]}
              onPress={addSafetyAlert}
              disabled={!newAlertText.trim()}
            >
              <Text style={st.addBtnText}>{isAr ? '+ إضافة تنبيه' : '+ Add Alert'}</Text>
            </TouchableOpacity>
          </View>

          {/* ─── Equipment Issues Section ─── */}
          <View style={st.sectionHeader}>
            <Text style={[st.label, { color: colors.text, marginBottom: 0 }]}>
              {isAr ? 'مشاكل المعدات' : 'Equipment Issues'}
            </Text>
            <Text style={[st.countBadge, { color: colors.textSecondary }]}>
              {equipmentIssues.length}
            </Text>
          </View>

          {equipmentIssues.map((issue, idx) => (
            <View key={idx} style={[st.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={st.itemCardContent}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.itemText, { color: colors.text }]}>{issue.equipment_name}</Text>
                  <Text style={[st.itemSub, { color: colors.textSecondary }]}>{issue.issue}</Text>
                  <Text style={[st.itemTag, { color: colors.textTertiary }]}>{statusLabel(issue.status)}</Text>
                </View>
                <TouchableOpacity onPress={() => removeEquipmentIssue(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={st.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={[st.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[st.input, { color: colors.text, borderColor: colors.border }]}
              value={newIssueName}
              onChangeText={setNewIssueName}
              placeholder={isAr ? 'اسم المعدة...' : 'Equipment name...'}
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[st.input, { color: colors.text, borderColor: colors.border }]}
              value={newIssueDesc}
              onChangeText={setNewIssueDesc}
              placeholder={isAr ? 'وصف المشكلة...' : 'Issue description...'}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={st.chipRow}>
              {ISSUE_STATUS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    st.miniChip,
                    { borderColor: colors.border },
                    newIssueStatus === s && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setNewIssueStatus(s)}
                >
                  <Text style={[st.miniChipText, { color: colors.text }, newIssueStatus === s && { color: '#fff' }]}>
                    {statusLabel(s)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[st.addBtn, { backgroundColor: '#FF9800', opacity: (newIssueName.trim() && newIssueDesc.trim()) ? 1 : 0.4 }]}
              onPress={addEquipmentIssue}
              disabled={!newIssueName.trim() || !newIssueDesc.trim()}
            >
              <Text style={st.addBtnText}>{isAr ? '+ إضافة مشكلة' : '+ Add Issue'}</Text>
            </TouchableOpacity>
          </View>

          {/* Summary */}
          <View style={[st.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[st.summaryTitle, { color: colors.text }]}>
              {isAr ? 'ملخص التسليم' : 'Handover Summary'}
            </Text>
            <Text style={[st.summaryLine, { color: colors.textSecondary }]}>
              {isAr ? 'الوردية:' : 'Shift:'} {shiftLabel(shiftType)}
            </Text>
            <Text style={[st.summaryLine, { color: colors.textSecondary }]}>
              {isAr ? 'ملاحظات:' : 'Notes:'} {notes.trim() ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No')}
            </Text>
            <Text style={[st.summaryLine, { color: colors.textSecondary }]}>
              {isAr ? 'عناصر معلقة:' : 'Pending items:'} {pendingItems.length}
            </Text>
            <Text style={[st.summaryLine, { color: colors.textSecondary }]}>
              {isAr ? 'تنبيهات أمان:' : 'Safety alerts:'} {safetyAlerts.length}
            </Text>
            <Text style={[st.summaryLine, { color: colors.textSecondary }]}>
              {isAr ? 'مشاكل معدات:' : 'Equipment issues:'} {equipmentIssues.length}
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[st.submitBtn, submitMutation.isPending && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitMutation.isPending}
          >
            <Text style={st.submitBtnText}>
              {submitMutation.isPending
                ? (isAr ? 'جاري الإرسال...' : 'Submitting...')
                : (isAr ? 'إنشاء تسليم الوردية' : 'Create Shift Handover')}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 24, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 8 },
  countBadge: { fontSize: 13, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  miniChip: {
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4,
  },
  miniChipText: { fontSize: 11, fontWeight: '600' },

  textArea: {
    borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14,
    minHeight: 90, textAlignVertical: 'top',
  },

  input: {
    borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 8,
  },
  inputSmall: { marginBottom: 8 },

  addForm: {
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 4,
  },
  addBtn: {
    borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  itemCard: {
    borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6,
  },
  itemCardContent: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  itemText: { fontSize: 13, fontWeight: '600' },
  itemSub: { fontSize: 11, marginTop: 2 },
  itemTag: { fontSize: 10, marginTop: 2 },
  removeBtn: { fontSize: 16, color: '#999', fontWeight: '700', padding: 4 },

  summary: {
    borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 24,
  },
  summaryTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  summaryLine: { fontSize: 13, marginBottom: 4 },

  submitBtn: {
    backgroundColor: '#1976D2', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
    shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
