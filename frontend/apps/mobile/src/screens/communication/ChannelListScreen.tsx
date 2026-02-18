import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  SectionList,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi } from '@inspection/shared';
import type { TeamChannel, User } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';

const CHANNEL_ICONS: Record<string, string> = {
  general: '💬',
  shift: '🔄',
  role: '👥',
  job: '🔧',
  emergency: '🚨',
  dm: '👤',
};

const ROLE_LABELS: Record<string, { en: string; ar: string; color: string }> = {
  admin: { en: 'Admin', ar: 'مدير', color: '#722ed1' },
  inspector: { en: 'Inspector', ar: 'مفتش', color: '#1677ff' },
  specialist: { en: 'Specialist', ar: 'أخصائي', color: '#52c41a' },
  engineer: { en: 'Engineer', ar: 'مهندس', color: '#fa8c16' },
  quality_engineer: { en: 'Quality Eng.', ar: 'مهندس جودة', color: '#13c2c2' },
  maintenance: { en: 'Maintenance', ar: 'صيانة', color: '#eb2f96' },
};

const SHIFT_LABELS: Record<string, { en: string; ar: string }> = {
  day: { en: 'Day Shift', ar: 'وردية نهارية' },
  night: { en: 'Night Shift', ar: 'وردية ليلية' },
};

export default function ChannelListScreen() {
  const { i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const isAr = i18n.language === 'ar';
  const [search, setSearch] = useState('');
  const [showUsers, setShowUsers] = useState(false);

  const { data: channels = [], isLoading: isChannelsLoading, refetch: refetchChannels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => teamCommunicationApi.getChannels().then(r => r.data.data),
  });

  // Fetch all active users for the members/people list
  const { data: usersData, isLoading: isUsersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['all-users-chat'],
    queryFn: async () => {
      try {
        const res = await teamCommunicationApi.getChatUsers();
        const data = res.data?.data;
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.error('Failed to fetch users:', err);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  const allUsers: User[] = useMemo(() => {
    if (!usersData) return [];
    if (Array.isArray(usersData)) return usersData;
    return [];
  }, [usersData]);

  // Filter out current user from the list
  const otherUsers = useMemo(
    () => allUsers.filter((u: User) => u.id !== currentUser?.id),
    [allUsers, currentUser?.id],
  );

  // Create DM channel mutation
  const createDmMutation = useMutation({
    mutationFn: (targetUser: User) => {
      const dmName = `${currentUser?.full_name || 'Me'} & ${targetUser.full_name}`;
      return teamCommunicationApi.createChannel({
        name: dmName,
        channel_type: 'general',
        member_ids: [targetUser.id],
      });
    },
    onSuccess: (response, targetUser) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      const channel = response.data?.data;
      setSearch('');
      setShowUsers(false);
      if (channel) {
        navigation.navigate('ChatRoom', {
          channelId: channel.id,
          channelName: targetUser.full_name,
        });
      }
    },
    onError: (err) => {
      console.error('Failed to create DM:', err);
    },
  });

  // Filtered channels based on search
  const filteredChannels = useMemo(
    () =>
      channels.filter((ch: TeamChannel) =>
        ch.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [channels, search],
  );

  // Filter users: search matches name, employee ID, or role. Show all when people mode toggled.
  const filteredUsers = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    if (searchLower.length > 0) {
      return otherUsers.filter((u: User) =>
        u.full_name.toLowerCase().includes(searchLower) ||
        (u.employee_id && String(u.employee_id).toLowerCase().includes(searchLower)) ||
        (u.role && u.role.toLowerCase().includes(searchLower)) ||
        (u.shift && u.shift.toLowerCase().includes(searchLower)),
      );
    }
    if (showUsers) {
      return otherUsers;
    }
    return [];
  }, [otherUsers, search, showUsers]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return isAr ? 'الآن' : 'Now';
    if (mins < 60) return `${mins}${isAr ? 'د' : 'm'}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${isAr ? 'س' : 'h'}`;
    const days = Math.floor(hrs / 24);
    return `${days}${isAr ? 'ي' : 'd'}`;
  };

  const getRoleBadge = (role: string) => {
    const info = ROLE_LABELS[role];
    if (!info) return { label: role, color: '#8c8c8c' };
    return { label: isAr ? info.ar : info.en, color: info.color };
  };

  const getShiftLabel = (shift: string | null) => {
    if (!shift) return null;
    const info = SHIFT_LABELS[shift];
    if (!info) return shift;
    return isAr ? info.ar : info.en;
  };

  const handleUserPress = useCallback((targetUser: User) => {
    // Check if DM channel already exists (search by name match)
    const targetName = targetUser.full_name.toLowerCase();
    const existingDm = channels.find((ch: TeamChannel) =>
      ch.name.toLowerCase().includes(targetName) && ch.member_count <= 3,
    );

    if (existingDm) {
      setSearch('');
      setShowUsers(false);
      navigation.navigate('ChatRoom', {
        channelId: existingDm.id,
        channelName: targetUser.full_name,
      });
    } else {
      createDmMutation.mutate(targetUser);
    }
  }, [channels, navigation, createDmMutation]);

  const handleToggleUsers = useCallback(() => {
    const next = !showUsers;
    setShowUsers(next);
    if (next && allUsers.length === 0) {
      // Force refetch users if the list is empty (may have failed initially)
      refetchUsers();
    }
  }, [showUsers, allUsers.length, refetchUsers]);

  const handleRefresh = useCallback(() => {
    refetchChannels();
    if (showUsers) refetchUsers();
  }, [refetchChannels, refetchUsers, showUsers]);

  const renderChannel = ({ item }: { item: TeamChannel }) => (
    <TouchableOpacity
      style={styles.channelCard}
      onPress={() => navigation.navigate('ChatRoom', { channelId: item.id, channelName: item.name })}
      activeOpacity={0.7}
    >
      <View style={styles.channelIcon}>
        <Text style={styles.channelIconText}>
          {CHANNEL_ICONS[item.channel_type] || '💬'}
        </Text>
      </View>
      <View style={styles.channelInfo}>
        <View style={styles.channelHeader}>
          <Text style={styles.channelName} numberOfLines={1}>{item.name}</Text>
          {item.last_message && (
            <Text style={styles.timeText}>
              {formatTime(item.last_message.created_at)}
            </Text>
          )}
        </View>
        <View style={styles.channelFooter}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.last_message
              ? item.last_message.message_type === 'voice'
                ? `🎤 ${isAr ? 'رسالة صوتية' : 'Voice message'}`
                : item.last_message.message_type === 'photo'
                ? `📸 ${isAr ? 'صورة' : 'Photo'}`
                : item.last_message.message_type === 'video'
                ? `🎥 ${isAr ? 'فيديو' : 'Video'}`
                : item.last_message.message_type === 'system'
                ? `📢 ${item.last_message.content || ''}`
                : `${item.last_message.sender_name}: ${item.last_message.content || ''}`
              : (isAr ? 'لا رسائل بعد' : 'No messages yet')}
          </Text>
          {(item.unread_count ?? 0) > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderUser = ({ item }: { item: User }) => {
    const badge = getRoleBadge(item.role);
    const shiftLabel = getShiftLabel(item.shift);

    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => handleUserPress(item)}
        activeOpacity={0.7}
        disabled={createDmMutation.isPending}
      >
        {/* Avatar */}
        <View style={[styles.userAvatar, { borderColor: badge.color }]}>
          <Text style={[styles.userAvatarText, { color: badge.color }]}>
            {(item.full_name || '?')[0].toUpperCase()}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{item.full_name}</Text>
          <View style={styles.userMeta}>
            {/* Role badge */}
            <View style={[styles.roleBadge, { backgroundColor: badge.color + '18' }]}>
              <Text style={[styles.roleBadgeText, { color: badge.color }]}>
                {badge.label}
              </Text>
            </View>
            {/* Shift badge */}
            {shiftLabel && (
              <View style={styles.shiftBadge}>
                <Text style={styles.shiftBadgeText}>
                  {item.shift === 'day' ? '☀️' : '🌙'} {shiftLabel}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Chat action */}
        <View style={styles.chatAction}>
          <Text style={styles.chatActionIcon}>💬</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Determine what to show in the main area
  const isShowingPeopleView = showUsers || search.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isAr ? 'المحادثات' : 'Team Chat'}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.peopleBtn, showUsers && styles.peopleBtnActive]}
            onPress={handleToggleUsers}
          >
            <Text style={styles.peopleBtnText}>👥</Text>
            {showUsers && <View style={styles.peopleBtnDot} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => navigation.navigate('NewChannel')}
          >
            <Text style={styles.newBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={isAr ? '🔍 بحث عن محادثة أو شخص...' : '🔍 Search channels or people...'}
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            // Auto-switch to people mode when typing
            if (text.length > 0 && !showUsers) setShowUsers(true);
          }}
          placeholderTextColor="#bfbfbf"
        />
        {search.length > 0 && (
          <TouchableOpacity
            style={styles.clearSearch}
            onPress={() => { setSearch(''); }}
          >
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* People mode active indicator */}
      {showUsers && (
        <View style={styles.modeBar}>
          <Text style={styles.modeBarText}>
            {isAr ? `👥 عرض الأشخاص (${otherUsers.length})` : `👥 People View (${otherUsers.length})`}
          </Text>
          <TouchableOpacity onPress={() => { setShowUsers(false); setSearch(''); }}>
            <Text style={styles.modeBarClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.mainScroll}
        refreshControl={
          <RefreshControl
            refreshing={isChannelsLoading || isUsersLoading}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* User results when searching or People mode */}
        {isShowingPeopleView && (
          <View>
            <Text style={styles.sectionLabel}>
              {isAr ? '👥 الأشخاص' : '👥 People'}
              {filteredUsers.length > 0 ? ` (${filteredUsers.length})` : ''}
            </Text>

            {/* Loading state for users */}
            {isUsersLoading && filteredUsers.length === 0 && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#1677ff" />
                <Text style={styles.loadingText}>
                  {isAr ? 'جارٍ تحميل الأشخاص...' : 'Loading people...'}
                </Text>
              </View>
            )}

            {/* Empty state for users */}
            {!isUsersLoading && filteredUsers.length === 0 && (
              <View style={styles.emptyUsers}>
                <Text style={styles.emptyUsersIcon}>👥</Text>
                <Text style={styles.emptyUsersText}>
                  {search.trim().length > 0
                    ? (isAr ? 'لا نتائج مطابقة' : 'No matching people')
                    : (isAr ? 'لا يوجد أعضاء' : 'No team members found')}
                </Text>
                {search.trim().length > 0 && (
                  <Text style={styles.emptyUsersHint}>
                    {isAr ? 'حاول البحث باسم أو دور مختلف' : 'Try a different name or role'}
                  </Text>
                )}
              </View>
            )}

            {/* User list */}
            {filteredUsers.length > 0 && (
              <FlatList
                data={filteredUsers}
                renderItem={renderUser}
                keyExtractor={(item) => `user-${item.id}`}
                scrollEnabled={false}
              />
            )}
          </View>
        )}

        {/* DM creation loading */}
        {createDmMutation.isPending && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#1677ff" />
            <Text style={styles.loadingText}>
              {isAr ? 'جارٍ إنشاء المحادثة...' : 'Creating conversation...'}
            </Text>
          </View>
        )}

        {/* Channel section */}
        {(isShowingPeopleView && filteredChannels.length > 0) && (
          <Text style={styles.sectionLabel}>
            {isAr ? '💬 القنوات' : '💬 Channels'}
          </Text>
        )}

        {/* Channel List */}
        {filteredChannels.length > 0 ? (
          <FlatList
            data={filteredChannels}
            renderItem={renderChannel}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
          />
        ) : !isShowingPeopleView ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>
              {isAr ? 'لا محادثات بعد' : 'No channels yet'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  mainScroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBtn: { padding: 4, marginRight: 8 },
  backBtnText: { fontSize: 25, color: '#1677ff', fontWeight: '600' },
  headerTitle: { fontSize: 21, fontWeight: '800', color: '#262626', flex: 1 },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  peopleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  peopleBtnActive: { backgroundColor: '#e6f4ff', borderWidth: 2, borderColor: '#1677ff' },
  peopleBtnText: { fontSize: 20 },
  peopleBtnDot: {
    position: 'absolute', top: -2, right: -2,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#1677ff', borderWidth: 1.5, borderColor: '#fff',
  },
  newBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1677ff', justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
  },
  newBtnText: { color: '#fff', fontSize: 27, fontWeight: '600', lineHeight: 28 },
  searchContainer: { padding: 12, backgroundColor: '#fff', position: 'relative' },
  searchInput: {
    backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 10, paddingRight: 40, fontSize: 17, color: '#262626',
  },
  clearSearch: {
    position: 'absolute', right: 24, top: 0, bottom: 0,
    justifyContent: 'center', paddingHorizontal: 8,
  },
  clearSearchText: { fontSize: 16, color: '#8c8c8c', fontWeight: '600' },
  modeBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#e6f4ff', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#bae0ff',
  },
  modeBarText: { fontSize: 15, fontWeight: '600', color: '#1677ff' },
  modeBarClose: { fontSize: 16, color: '#1677ff', fontWeight: '700', padding: 4 },
  sectionLabel: {
    fontSize: 16, fontWeight: '700', color: '#8c8c8c',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
    backgroundColor: '#fff',
  },
  // User cards
  userCard: {
    flexDirection: 'row', padding: 12, paddingHorizontal: 16,
    backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  userAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#f0f5ff',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
    borderWidth: 2,
  },
  userAvatarText: { fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '600', color: '#262626', marginBottom: 4 },
  userMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  roleBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  roleBadgeText: { fontSize: 13, fontWeight: '700' },
  shiftBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  shiftBadgeText: { fontSize: 12, color: '#595959' },
  chatAction: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0f5ff', justifyContent: 'center', alignItems: 'center',
  },
  chatActionIcon: { fontSize: 20 },
  emptyUsers: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  emptyUsersIcon: { fontSize: 40, marginBottom: 8 },
  emptyUsersText: { fontSize: 16, color: '#8c8c8c', fontWeight: '600', textAlign: 'center' },
  emptyUsersHint: { fontSize: 14, color: '#bfbfbf', marginTop: 4, textAlign: 'center' },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, backgroundColor: '#fff',
  },
  loadingText: { fontSize: 16, color: '#1677ff' },
  // Channel cards
  channelCard: {
    flexDirection: 'row', padding: 14, backgroundColor: '#fff',
    borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0',
  },
  channelIcon: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#e6f4ff',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  channelIconText: { fontSize: 24 },
  channelInfo: { flex: 1 },
  channelHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  channelName: { fontSize: 18, fontWeight: '700', color: '#262626', flex: 1 },
  timeText: { fontSize: 15, color: '#bfbfbf', marginLeft: 8 },
  channelFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  lastMessage: { fontSize: 16, color: '#8c8c8c', flex: 1 },
  unreadBadge: {
    backgroundColor: '#1677ff', borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, color: '#bfbfbf' },
});
