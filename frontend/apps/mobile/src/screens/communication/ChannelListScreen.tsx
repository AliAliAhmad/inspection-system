import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { teamCommunicationApi } from '@inspection/shared';
import type { TeamChannel } from '@inspection/shared';

const CHANNEL_ICONS: Record<string, string> = {
  general: '💬',
  shift: '🔄',
  role: '👥',
  job: '🔧',
  emergency: '🚨',
};

export default function ChannelListScreen() {
  const { i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const isAr = i18n.language === 'ar';
  const [search, setSearch] = useState('');

  const { data: channels = [], isLoading, refetch } = useQuery({
    queryKey: ['channels'],
    queryFn: () => teamCommunicationApi.getChannels().then(r => r.data.data),
  });

  const filteredChannels = channels.filter((ch: TeamChannel) =>
    ch.name.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {isAr ? '💬 المحادثات' : '💬 Team Chat'}
        </Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate('NewChannel')}
        >
          <Text style={styles.newBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={isAr ? '🔍 بحث...' : '🔍 Search...'}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#bfbfbf"
        />
      </View>

      {/* Channel List */}
      <FlatList
        data={filteredChannels}
        renderItem={renderChannel}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>
              {isAr ? 'لا محادثات بعد' : 'No channels yet'}
            </Text>
          </View>
        }
        contentContainerStyle={filteredChannels.length === 0 ? styles.emptyContainer : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#262626' },
  newBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1677ff', justifyContent: 'center', alignItems: 'center',
  },
  newBtnText: { color: '#fff', fontSize: 24, fontWeight: '600', marginTop: -2 },
  searchContainer: { padding: 12, backgroundColor: '#fff' },
  searchInput: {
    backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, color: '#262626',
  },
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
  channelName: { fontSize: 16, fontWeight: '700', color: '#262626', flex: 1 },
  timeText: { fontSize: 12, color: '#bfbfbf', marginLeft: 8 },
  channelFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  lastMessage: { fontSize: 13, color: '#8c8c8c', flex: 1 },
  unreadBadge: {
    backgroundColor: '#1677ff', borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#bfbfbf' },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
