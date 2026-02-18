import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi, usersApi } from '@inspection/shared';
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

export default function ChannelListScreen() {
  const { i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const isAr = i18n.language === 'ar';
  const [search, setSearch] = useState('');
  const [showUsers, setShowUsers] = useState(false);

  const { data: channels = [], isLoading, refetch } = useQuery({
    queryKey: ['channels'],
    queryFn: () => teamCommunicationApi.getChannels().then(r => r.data.data),
  });

  // Prefetch all users so search is instant
  const { data: usersData } = useQuery({
    queryKey: ['all-users-chat'],
    queryFn: () => usersApi.list({ per_page: 500, is_active: true }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  const allUsers: User[] = (usersData as any) || [];

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
      const channel = response.data.data;
      setSearch('');
      setShowUsers(false);
      navigation.navigate('ChatRoom', {
        channelId: channel.id,
        channelName: targetUser.full_name,
      });
    },
  });

  const filteredChannels = channels.filter((ch: TeamChannel) =>
    ch.name.toLowerCase().includes(search.toLowerCase())
  );

  // Filter users matching search (exclude self) — progressive name filtering
  const searchLower = search.toLowerCase().trim();
  const filteredUsers = searchLower.length > 0
    ? allUsers.filter((u: User) =>
        u.id !== currentUser?.id &&
        (u.full_name.toLowerCase().includes(searchLower) ||
         (u.employee_id && String(u.employee_id).includes(searchLower)) ||
         (u.role && u.role.toLowerCase().includes(searchLower)))
      )
    : showUsers
    ? allUsers.filter((u: User) => u.id !== currentUser?.id)
    : [];

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

  const handleUserPress = useCallback((targetUser: User) => {
    // Check if DM channel already exists
    const existingDm = channels.find((ch: TeamChannel) =>
      ch.name.includes(targetUser.full_name) && ch.member_count <= 3
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

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => handleUserPress(item)}
      activeOpacity={0.7}
      disabled={createDmMutation.isPending}
    >
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>
          {(item.full_name || '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.full_name}</Text>
        <Text style={styles.userRole}>
          {item.role} {item.shift ? `· ${item.shift}` : ''}
        </Text>
      </View>
      <Text style={styles.chatIcon}>💬</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isAr ? 'المحادثات' : 'Team Chat'}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.peopleBtn, showUsers && styles.peopleBtnActive]}
            onPress={() => setShowUsers(!showUsers)}
          >
            <Text style={styles.peopleBtnText}>👥</Text>
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
            if (text.length > 0) setShowUsers(true);
          }}
          placeholderTextColor="#bfbfbf"
        />
      </View>

      {/* User results when searching or People mode */}
      {filteredUsers.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>
            {isAr ? '👥 الأشخاص' : '👥 People'}
          </Text>
          <FlatList
            data={filteredUsers.slice(0, 20)}
            renderItem={renderUser}
            keyExtractor={(item) => `user-${item.id}`}
            scrollEnabled={false}
          />
          {filteredUsers.length > 20 && (
            <Text style={styles.moreText}>
              {isAr ? `+${filteredUsers.length - 20} أشخاص آخرين` : `+${filteredUsers.length - 20} more people`}
            </Text>
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

      {/* Channel section label */}
      {(filteredUsers.length > 0 || showUsers) && filteredChannels.length > 0 && (
        <Text style={styles.sectionLabel}>
          {isAr ? '💬 القنوات' : '💬 Channels'}
        </Text>
      )}

      {/* Channel List */}
      <FlatList
        data={filteredChannels}
        renderItem={renderChannel}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
        ListEmptyComponent={
          !showUsers ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyText}>
                {isAr ? 'لا محادثات بعد' : 'No channels yet'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={filteredChannels.length === 0 && !showUsers ? styles.emptyContainer : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
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
  backBtnText: { fontSize: 25, color: '#1677ff' },
  headerTitle: { fontSize: 21, fontWeight: '800', color: '#262626', flex: 1 },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  peopleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center',
  },
  peopleBtnActive: { backgroundColor: '#e6f4ff' },
  peopleBtnText: { fontSize: 20 },
  newBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1677ff', justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
  },
  newBtnText: { color: '#fff', fontSize: 27, fontWeight: '600', lineHeight: 28 },
  searchContainer: { padding: 12, backgroundColor: '#fff' },
  searchInput: {
    backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 17, color: '#262626',
  },
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
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f5ff',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  userAvatarText: { fontSize: 19, fontWeight: '700', color: '#1677ff' },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '600', color: '#262626' },
  userRole: { fontSize: 15, color: '#8c8c8c', marginTop: 2 },
  chatIcon: { fontSize: 20, opacity: 0.5 },
  moreText: {
    fontSize: 15, color: '#8c8c8c', textAlign: 'center',
    paddingVertical: 8, backgroundColor: '#fff',
  },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, backgroundColor: '#fff',
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
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
