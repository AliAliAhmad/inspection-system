import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi, usersApi } from '@inspection/shared';
import type { ChannelType, User } from '@inspection/shared';

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

// Suggested channels with auto-membership
const SUGGESTED_CHANNELS = [
  {
    name: 'Job Chat',
    nameAr: 'محادثة العمل',
    description: 'General job discussion for all team members',
    descriptionAr: 'محادثة عمل عامة لجميع أعضاء الفريق',
    type: 'general' as ChannelType,
    icon: '🔧',
    includeAllUsers: true,
    roleFilter: undefined as string | undefined,
  },
  {
    name: 'Inspectors Team',
    nameAr: 'فريق المفتشين',
    description: 'Channel for all inspectors',
    descriptionAr: 'قناة لجميع المفتشين',
    type: 'role' as ChannelType,
    icon: '🔍',
    includeAllUsers: false,
    roleFilter: 'inspector',
  },
  {
    name: 'Specialists Team',
    nameAr: 'فريق الفنيين',
    description: 'Channel for all specialists',
    descriptionAr: 'قناة لجميع الفنيين',
    type: 'role' as ChannelType,
    icon: '🔧',
    includeAllUsers: false,
    roleFilter: 'specialist',
  },
  {
    name: 'Engineers Team',
    nameAr: 'فريق المهندسين',
    description: 'Channel for all engineers',
    descriptionAr: 'قناة لجميع المهندسين',
    type: 'role' as ChannelType,
    icon: '👷',
    includeAllUsers: false,
    roleFilter: 'engineer',
  },
  {
    name: 'Emergency',
    nameAr: 'طوارئ',
    description: 'Emergency communications',
    descriptionAr: 'اتصالات الطوارئ',
    type: 'emergency' as ChannelType,
    icon: '🚨',
    includeAllUsers: true,
    roleFilter: undefined,
  },
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
  const [creatingSuggested, setCreatingSuggested] = useState<string | null>(null);

  // Fetch all users for auto-populating channels
  const { data: usersData } = useQuery({
    queryKey: ['all-users-chat'],
    queryFn: () => usersApi.list({ per_page: 500, is_active: true }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  const allUsers: User[] = (usersData as any) || [];

  // Get member IDs based on channel config
  const getMemberIds = (includeAll: boolean, role?: string): number[] => {
    if (includeAll) {
      return allUsers.map(u => u.id);
    }
    if (role) {
      return allUsers.filter(u => u.role === role).map(u => u.id);
    }
    return [];
  };

  // Get member IDs for manual channel creation based on type/role
  const autoMemberIds = useMemo(() => {
    if (channelType === 'role' && roleFilter) {
      return allUsers.filter(u => u.role === roleFilter).map(u => u.id);
    }
    if (channelType === 'general' || channelType === 'emergency' || channelType === 'job') {
      return allUsers.map(u => u.id);
    }
    if (channelType === 'shift' && shift) {
      return allUsers.filter(u => u.shift === shift).map(u => u.id);
    }
    return [];
  }, [channelType, roleFilter, shift, allUsers]);

  // Create channel mutation
  const createMutation = useMutation({
    mutationFn: () => teamCommunicationApi.createChannel({
      name: name.trim(),
      description: description || undefined,
      channel_type: channelType,
      shift,
      role_filter: roleFilter,
      member_ids: autoMemberIds.length > 0 ? autoMemberIds : undefined,
    }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      const channel = (response.data as any).data ?? response.data;
      navigation.navigate('ChatRoom', { channelId: channel.id, channelName: name.trim() });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || (isAr ? 'فشل إنشاء القناة' : 'Failed to create channel');
      Alert.alert(isAr ? 'خطأ' : 'Error', msg);
    },
  });

  // Quick-create suggested channel
  const createSuggested = async (suggested: typeof SUGGESTED_CHANNELS[0]) => {
    setCreatingSuggested(suggested.name);
    try {
      const memberIds = getMemberIds(suggested.includeAllUsers, suggested.roleFilter);
      const channelName = isAr ? suggested.nameAr : suggested.name;
      const res = await teamCommunicationApi.createChannel({
        name: channelName,
        description: isAr ? suggested.descriptionAr : suggested.description,
        channel_type: suggested.type,
        role_filter: suggested.roleFilter,
        member_ids: memberIds,
      });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      const channel = (res.data as any).data ?? res.data;
      navigation.navigate('ChatRoom', { channelId: channel.id, channelName });
    } catch (err: any) {
      const msg = err?.response?.data?.message || (isAr ? 'فشل إنشاء القناة' : 'Failed to create channel');
      Alert.alert(isAr ? 'خطأ' : 'Error', msg);
    } finally {
      setCreatingSuggested(null);
    }
  };

  // Member count preview
  const memberCountLabel = autoMemberIds.length > 0
    ? `${autoMemberIds.length} ${isAr ? 'عضو' : 'members'}`
    : '';

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
          style={styles.createBtn}
          onPress={() => {
            if (name.trim() && !createMutation.isPending) {
              createMutation.mutate();
            }
          }}
          disabled={!name.trim() || createMutation.isPending}
          activeOpacity={0.6}
        >
          {createMutation.isPending ? (
            <ActivityIndicator size="small" color="#1677ff" />
          ) : (
            <Text style={[styles.createText, !name.trim() && styles.createTextDisabled]}>
              {isAr ? 'إنشاء' : 'Create'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {/* Suggested Channels */}
        <Text style={styles.sectionTitle}>
          {isAr ? '⚡ إنشاء سريع' : '⚡ Quick Create'}
        </Text>
        <Text style={styles.sectionHint}>
          {isAr ? 'قنوات مقترحة مع الأعضاء المناسبين تلقائياً' : 'Suggested channels with auto-populated members'}
        </Text>
        <View style={styles.suggestedGrid}>
          {SUGGESTED_CHANNELS.map((s) => (
            <TouchableOpacity
              key={s.name}
              style={styles.suggestedCard}
              onPress={() => createSuggested(s)}
              disabled={creatingSuggested !== null}
              activeOpacity={0.7}
            >
              {creatingSuggested === s.name ? (
                <ActivityIndicator size="small" color="#1677ff" />
              ) : (
                <>
                  <Text style={styles.suggestedIcon}>{s.icon}</Text>
                  <Text style={styles.suggestedName} numberOfLines={1}>
                    {isAr ? s.nameAr : s.name}
                  </Text>
                  <Text style={styles.suggestedDesc} numberOfLines={1}>
                    {s.includeAllUsers
                      ? (isAr ? 'جميع المستخدمين' : 'All users')
                      : (isAr ? `فقط ${ROLES.find(r => r.value === s.roleFilter)?.labelAr || s.roleFilter}` : `Only ${ROLES.find(r => r.value === s.roleFilter)?.label || s.roleFilter}`)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{isAr ? 'أو أنشئ مخصص' : 'or create custom'}</Text>
          <View style={styles.dividerLine} />
        </View>

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
              onPress={() => {
                setChannelType(ct.value);
                setShift(undefined);
                setRoleFilter(undefined);
              }}
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

        {/* Auto-members preview */}
        {memberCountLabel ? (
          <View style={styles.memberPreview}>
            <Text style={styles.memberPreviewText}>
              👥 {isAr ? 'سيتم إضافة' : 'Will auto-add'} {memberCountLabel}
            </Text>
          </View>
        ) : null}

        <View style={{ height: 40 }} />
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
  createBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  createText: { fontSize: 16, fontWeight: '700', color: '#1677ff' },
  createTextDisabled: { color: '#d9d9d9' },
  form: { padding: 16 },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#262626', marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12, color: '#8c8c8c', marginBottom: 12,
  },
  // Suggested channels grid
  suggestedGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  suggestedCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#f0f0f0',
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.06)', elevation: 1,
    minHeight: 90, justifyContent: 'center',
  },
  suggestedIcon: { fontSize: 28, marginBottom: 6 },
  suggestedName: { fontSize: 13, fontWeight: '700', color: '#262626', textAlign: 'center' },
  suggestedDesc: { fontSize: 10, color: '#8c8c8c', textAlign: 'center', marginTop: 2 },
  // Divider
  divider: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e8e8e8' },
  dividerText: { fontSize: 12, color: '#bfbfbf' },
  // Form
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
  // Member preview
  memberPreview: {
    backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12, marginTop: 16,
    borderLeftWidth: 3, borderLeftColor: '#1677ff',
  },
  memberPreviewText: { fontSize: 13, color: '#1677ff', fontWeight: '500' },
});
