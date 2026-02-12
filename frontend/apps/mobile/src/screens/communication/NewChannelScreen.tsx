import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi } from '@inspection/shared';
import type { ChannelType } from '@inspection/shared';

const CHANNEL_TYPES: { value: ChannelType; label: string; labelAr: string; icon: string }[] = [
  { value: 'general', label: 'General', labelAr: 'عام', icon: '💬' },
  { value: 'shift', label: 'Shift', labelAr: 'وردية', icon: '🔄' },
  { value: 'role', label: 'By Role', labelAr: 'حسب الدور', icon: '👥' },
  { value: 'job', label: 'Job Chat', labelAr: 'محادثة عمل', icon: '🔧' },
  { value: 'emergency', label: 'Emergency', labelAr: 'طوارئ', icon: '🚨' },
];

const SHIFTS = [
  { value: 'morning', label: 'Morning', labelAr: 'صباحي', icon: '🌅' },
  { value: 'afternoon', label: 'Afternoon', labelAr: 'مسائي', icon: '☀️' },
  { value: 'night', label: 'Night', labelAr: 'ليلي', icon: '🌙' },
];

const ROLES = [
  { value: 'inspector', label: 'Inspectors', labelAr: 'المفتشين', icon: '🔍' },
  { value: 'specialist', label: 'Specialists', labelAr: 'الفنيين', icon: '🔧' },
  { value: 'engineer', label: 'Engineers', labelAr: 'المهندسين', icon: '👷' },
  { value: 'quality_engineer', label: 'QE', labelAr: 'جودة', icon: '✅' },
  { value: 'admin', label: 'Admins', labelAr: 'المسؤولين', icon: '🛡️' },
];

export default function NewChannelScreen() {
  const { i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState<ChannelType>('general');
  const [shift, setShift] = useState<string | undefined>();
  const [roleFilter, setRoleFilter] = useState<string | undefined>();

  const createMutation = useMutation({
    mutationFn: () => teamCommunicationApi.createChannel({
      name,
      description: description || undefined,
      channel_type: channelType,
      shift,
      role_filter: roleFilter,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      navigation.goBack();
    },
    onError: () => {
      Alert.alert(isAr ? 'خطأ' : 'Error', isAr ? 'فشل إنشاء القناة' : 'Failed to create channel');
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isAr ? 'قناة جديدة' : 'New Channel'}
        </Text>
        <TouchableOpacity
          onPress={() => name.trim() && createMutation.mutate()}
          disabled={!name.trim()}
        >
          <Text style={[styles.createText, !name.trim() && styles.createTextDisabled]}>
            {isAr ? 'إنشاء' : 'Create'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {/* Name */}
        <Text style={styles.label}>{isAr ? 'اسم القناة' : 'Channel Name'}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={isAr ? 'مثال: فريق الصيانة' : 'e.g. Maintenance Team'}
          placeholderTextColor="#bfbfbf"
        />

        {/* Description */}
        <Text style={styles.label}>{isAr ? 'الوصف (اختياري)' : 'Description (optional)'}</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={description}
          onChangeText={setDescription}
          placeholder={isAr ? 'وصف القناة...' : 'Channel description...'}
          placeholderTextColor="#bfbfbf"
          multiline
        />

        {/* Channel Type */}
        <Text style={styles.label}>{isAr ? 'نوع القناة' : 'Channel Type'}</Text>
        <View style={styles.chips}>
          {CHANNEL_TYPES.map((ct) => (
            <TouchableOpacity
              key={ct.value}
              style={[styles.chip, channelType === ct.value && styles.chipActive]}
              onPress={() => setChannelType(ct.value)}
            >
              <Text style={styles.chipIcon}>{ct.icon}</Text>
              <Text style={[styles.chipText, channelType === ct.value && styles.chipTextActive]}>
                {isAr ? ct.labelAr : ct.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Shift filter */}
        {channelType === 'shift' && (
          <>
            <Text style={styles.label}>{isAr ? 'الوردية' : 'Shift'}</Text>
            <View style={styles.chips}>
              {SHIFTS.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.chip, shift === s.value && styles.chipActive]}
                  onPress={() => setShift(shift === s.value ? undefined : s.value)}
                >
                  <Text style={styles.chipIcon}>{s.icon}</Text>
                  <Text style={[styles.chipText, shift === s.value && styles.chipTextActive]}>
                    {isAr ? s.labelAr : s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Role filter */}
        {channelType === 'role' && (
          <>
            <Text style={styles.label}>{isAr ? 'الدور' : 'Role'}</Text>
            <View style={styles.chips}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.chip, roleFilter === r.value && styles.chipActive]}
                  onPress={() => setRoleFilter(roleFilter === r.value ? undefined : r.value)}
                >
                  <Text style={styles.chipIcon}>{r.icon}</Text>
                  <Text style={[styles.chipText, roleFilter === r.value && styles.chipTextActive]}>
                    {isAr ? r.labelAr : r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#262626' },
  cancelText: { fontSize: 16, color: '#8c8c8c' },
  createText: { fontSize: 16, fontWeight: '700', color: '#1677ff' },
  createTextDisabled: { color: '#d9d9d9' },
  form: { padding: 20 },
  label: {
    fontSize: 14, fontWeight: '600', color: '#595959', marginBottom: 8, marginTop: 16,
  },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 12, fontSize: 15, color: '#262626',
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  chips: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: '#f0f0f0',
  },
  chipActive: {
    backgroundColor: '#e6f4ff', borderColor: '#1677ff',
  },
  chipIcon: { fontSize: 16, marginRight: 6 },
  chipText: { fontSize: 14, color: '#595959', fontWeight: '500' },
  chipTextActive: { color: '#1677ff', fontWeight: '700' },
});
