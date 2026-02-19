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
import VoiceNoteRecorder from '../../components/VoiceNoteRecorder';

const SHIFT_TYPES = ['day', 'night', 'morning', 'afternoon'] as const;

type HandoverItem = {
  text: string;
  type: 'pending' | 'safety' | 'equipment';
};

const ITEM_TYPES = [
  { key: 'pending' as const, emoji: '📋', en: 'Task', ar: 'مهمة', color: '#1976D2' },
  { key: 'safety' as const, emoji: '⚠️', en: 'Safety', ar: 'أمان', color: '#E53935' },
  { key: 'equipment' as const, emoji: '🔧', en: 'Equipment', ar: 'معدة', color: '#FF9800' },
];

export default function CreateHandoverScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';

  // Form state
  const [shiftType, setShiftType] = useState<string>('day');
  const [notes, setNotes] = useState('');
  const [voiceNoteId, setVoiceNoteId] = useState<number | null>(null);
  const [voiceTranscription, setVoiceTranscription] = useState<string>('');
  const [items, setItems] = useState<HandoverItem[]>([]);

  // Inline add
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState<HandoverItem['type']>('pending');

  const shiftLabel = (s: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      day: { en: 'Day', ar: 'نهاري' },
      night: { en: 'Night', ar: 'ليلي' },
      morning: { en: 'Morning', ar: 'صباحي' },
      afternoon: { en: 'Afternoon', ar: 'مسائي' },
    };
    return isAr ? labels[s]?.ar ?? s : labels[s]?.en ?? s;
  };

  const addItem = useCallback(() => {
    if (!newText.trim()) return;
    setItems(prev => [...prev, { text: newText.trim(), type: newType }]);
    setNewText('');
  }, [newText, newType]);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleVoiceNote = useCallback(
    (noteId: number, transcription?: { en: string; ar: string }) => {
      setVoiceNoteId(noteId);
      if (transcription) {
        const text = isAr
          ? transcription.ar || transcription.en
          : transcription.en || transcription.ar;
        setVoiceTranscription(text);
      }
    },
    [isAr]
  );

  // Convert flat items back to the API's expected shape
  const buildPayload = (): CreateHandoverPayload => {
    const pendingItems: PendingItem[] = items
      .filter(i => i.type === 'pending')
      .map(i => ({ description: i.text, priority: 'medium' as const }));

    const safetyAlerts: SafetyAlert[] = items
      .filter(i => i.type === 'safety')
      .map(i => ({ alert: i.text, severity: 'warning' as const }));

    const equipmentIssues: EquipmentIssue[] = items
      .filter(i => i.type === 'equipment')
      .map(i => ({ equipment_name: i.text, issue: i.text, status: 'new' as const }));

    // Combine text notes + voice transcription
    const allNotes = [notes.trim(), voiceTranscription].filter(Boolean).join('\n\n---\n🎙️ ');

    return {
      shift_type: shiftType,
      notes: allNotes || undefined,
      pending_items: pendingItems.length > 0 ? pendingItems : undefined,
      safety_alerts: safetyAlerts.length > 0 ? safetyAlerts : undefined,
      equipment_issues: equipmentIssues.length > 0 ? equipmentIssues : undefined,
    };
  };

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
    if (!notes.trim() && items.length === 0) {
      Alert.alert(
        isAr ? 'تنبيه' : 'Notice',
        isAr ? 'يرجى إضافة ملاحظات أو عناصر' : 'Please add notes or items',
      );
      return;
    }
    submitMutation.mutate(buildPayload());
  };

  const typeConfig = ITEM_TYPES.find(t => t.key === newType)!;

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[st.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
            <Text style={[st.backText, { color: colors.primary }]}>{'←'}</Text>
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: colors.text }]}>
            {isAr ? 'تسليم وردية' : 'Shift Handover'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent}>
          {/* Shift Type */}
          <Text style={[st.label, { color: colors.text }]}>
            {isAr ? 'الوردية' : 'Shift'}
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
          <Text style={[st.label, { color: colors.text, marginTop: 16 }]}>
            {isAr ? 'ملاحظات' : 'Notes'}
          </Text>
          <TextInput
            style={[st.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            value={notes}
            onChangeText={setNotes}
            placeholder={isAr ? 'ملاحظات للوردية القادمة...' : 'Notes for the incoming shift...'}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Voice Note */}
          <Text style={[st.label, { color: colors.text, marginTop: 16 }]}>
            {isAr ? 'ملاحظة صوتية' : 'Voice Note'}
          </Text>
          <VoiceNoteRecorder
            onVoiceNoteRecorded={handleVoiceNote}
            language={isAr ? 'ar' : 'en'}
          />
          {voiceTranscription ? (
            <Text style={[st.voiceTranscription, { color: colors.textSecondary }]}>
              🎙️ {voiceTranscription}
            </Text>
          ) : null}

          {/* Items */}
          <Text style={[st.label, { color: colors.text, marginTop: 20 }]}>
            {isAr ? 'العناصر' : 'Items'} ({items.length})
          </Text>

          {items.map((item, idx) => {
            const cfg = ITEM_TYPES.find(t => t.key === item.type)!;
            return (
              <View key={idx} style={[st.itemCard, { backgroundColor: colors.surface, borderLeftColor: cfg.color }]}>
                <View style={st.itemRow}>
                  <Text style={st.itemEmoji}>{cfg.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.itemText, { color: colors.text }]}>{item.text}</Text>
                    <Text style={[st.itemType, { color: cfg.color }]}>
                      {isAr ? cfg.ar : cfg.en}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={st.removeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* Add Item */}
          <View style={[st.addSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Type selector */}
            <View style={st.typeRow}>
              {ITEM_TYPES.map((tp) => (
                <TouchableOpacity
                  key={tp.key}
                  style={[
                    st.typeChip,
                    { borderColor: tp.color },
                    newType === tp.key && { backgroundColor: tp.color },
                  ]}
                  onPress={() => setNewType(tp.key)}
                >
                  <Text style={[st.typeChipText, { color: tp.color }, newType === tp.key && { color: '#fff' }]}>
                    {tp.emoji} {isAr ? tp.ar : tp.en}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input + Add button */}
            <View style={st.addRow}>
              <TextInput
                style={[st.addInput, { color: colors.text, borderColor: colors.border, flex: 1 }]}
                value={newText}
                onChangeText={setNewText}
                placeholder={isAr ? 'اكتب هنا...' : 'Type here...'}
                placeholderTextColor={colors.textTertiary}
                onSubmitEditing={addItem}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[st.addBtn, { backgroundColor: typeConfig.color, opacity: newText.trim() ? 1 : 0.4 }]}
                onPress={addItem}
                disabled={!newText.trim()}
              >
                <Text style={st.addBtnText}>+</Text>
              </TouchableOpacity>
            </View>
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
                : (isAr ? 'إنشاء التسليم' : 'Create Handover')}
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

  label: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600' },

  textArea: {
    borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14,
    minHeight: 70, textAlignVertical: 'top',
  },
  voiceTranscription: {
    fontSize: 13, fontStyle: 'italic', marginTop: 6, paddingHorizontal: 4,
  },

  itemCard: {
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderLeftWidth: 4,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  itemEmoji: { fontSize: 18 },
  itemText: { fontSize: 14, fontWeight: '600' },
  itemType: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  removeBtn: { fontSize: 16, color: '#999', fontWeight: '700', padding: 4 },

  addSection: {
    borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4,
  },
  typeRow: {
    flexDirection: 'row', gap: 8, marginBottom: 10,
  },
  typeChip: {
    borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  typeChipText: { fontSize: 12, fontWeight: '700' },
  addRow: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
  },
  addInput: {
    borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14,
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 22, fontWeight: '700' },

  submitBtn: {
    backgroundColor: '#1976D2', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 24,
    boxShadow: '0px 4px 8px rgba(25, 118, 210, 0.3)', elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
