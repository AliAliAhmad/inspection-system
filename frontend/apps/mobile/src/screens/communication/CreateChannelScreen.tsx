import React, { useState, useCallback } from 'react';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { teamCommunicationApi, usersApi } from '@inspection/shared';
import { useTheme } from '../../hooks/useTheme';

type ChannelType = 'group' | 'announcement' | 'shift';

export default function CreateChannelScreen() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState<ChannelType>('group');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);

  const usersQuery = useQuery({
    queryKey: ['users-for-channel'],
    queryFn: () => usersApi.list({ per_page: 200, is_active: true }),
    select: (res) => (res.data as any)?.data ?? [],
  });
  const users: any[] = usersQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      teamCommunicationApi.createChannel({
        name: name.trim(),
        description: description.trim() || undefined,
        channel_type: channelType,
        member_ids: selectedMembers.length > 0 ? selectedMembers : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      Alert.alert(
        isAr ? 'تم' : 'Done',
        isAr ? 'تم إنشاء القناة بنجاح' : 'Channel created successfully',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    },
    onError: (err: any) => {
      Alert.alert(
        isAr ? 'خطأ' : 'Error',
        err?.response?.data?.message || (isAr ? 'فشل في الإنشاء' : 'Failed to create'),
      );
    },
  });

  const toggleMember = useCallback((id: number) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }, []);

  const canSubmit = name.trim().length >= 2;

  const TYPES: { key: ChannelType; icon: string; en: string; ar: string }[] = [
    { key: 'group', icon: '👥', en: 'Group', ar: 'مجموعة' },
    { key: 'announcement', icon: '📢', en: 'Announcement', ar: 'إعلانات' },
    { key: 'shift', icon: '🔄', en: 'Shift', ar: 'وردية' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name={isAr ? 'chevron-forward' : 'chevron-back'} size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isAr ? 'إنشاء قناة' : 'Create Channel'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Channel Type */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {isAr ? 'نوع القناة' : 'Channel Type'}
        </Text>
        <View style={styles.typeRow}>
          {TYPES.map((tp) => (
            <TouchableOpacity
              key={tp.key}
              style={[
                styles.typeChip,
                { borderColor: colors.border },
                channelType === tp.key && { backgroundColor: '#1677ff', borderColor: '#1677ff' },
              ]}
              onPress={() => setChannelType(tp.key)}
            >
              <Text style={[styles.typeText, channelType === tp.key && { color: '#fff' }]}>
                {tp.icon} {isAr ? tp.ar : tp.en}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Name */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
          {isAr ? 'اسم القناة' : 'Channel Name'}
        </Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          value={name}
          onChangeText={setName}
          placeholder={isAr ? 'مثال: فريق الصيانة' : 'e.g., Maintenance Team'}
          placeholderTextColor={colors.textTertiary}
        />

        {/* Description */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
          {isAr ? 'الوصف (اختياري)' : 'Description (optional)'}
        </Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          value={description}
          onChangeText={setDescription}
          placeholder={isAr ? 'وصف القناة...' : 'Channel description...'}
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={3}
        />

        {/* Members */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
          {isAr ? `الأعضاء (${selectedMembers.length})` : `Members (${selectedMembers.length})`}
        </Text>
        <View style={styles.membersList}>
          {users.map((u: any) => {
            const selected = selectedMembers.includes(u.id);
            return (
              <TouchableOpacity
                key={u.id}
                style={[styles.memberItem, selected && { backgroundColor: '#E3F2FD' }]}
                onPress={() => toggleMember(u.id)}
              >
                <Text style={[styles.memberName, { color: colors.text }]}>{u.full_name}</Text>
                <Text style={[styles.memberRole, { color: colors.textTertiary }]}>{u.role}</Text>
                {selected && <Ionicons name="checkmark-circle" size={20} color="#1677ff" />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
          onPress={() => createMutation.mutate()}
          disabled={!canSubmit || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>
              {isAr ? 'إنشاء القناة' : 'Create Channel'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center',
  },
  typeText: { fontSize: 13, fontWeight: '600', color: '#424242' },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  membersList: { gap: 4 },
  memberItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
  },
  memberName: { flex: 1, fontSize: 14, fontWeight: '600' },
  memberRole: { fontSize: 12 },
  submitBtn: {
    backgroundColor: '#1677ff', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 24,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
