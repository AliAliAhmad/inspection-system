import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import type { TeamMessage } from '@inspection/shared';
import { MessageReactions } from '../../components/chat/MessageReactions';
import { TranslatedMessage } from '../../components/chat/TranslatedMessage';
import { MediaAttachment } from '../../components/chat/MediaAttachment';

export default function ChatRoomScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';
  const flatListRef = useRef<FlatList>(null);

  const { channelId, channelName } = route.params || {};
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const { data: messages = [], refetch } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => teamCommunicationApi.getMessages(channelId).then(r => r.data.data),
    refetchInterval: 3000, // Poll every 3s
  });

  const sendMutation = useMutation({
    mutationFn: (data: any) => teamCommunicationApi.sendMessage(channelId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  // Mark as read on open
  React.useEffect(() => {
    teamCommunicationApi.markRead(channelId).catch(() => {});
  }, [channelId]);

  const handleSend = useCallback(() => {
    if (!message.trim()) return;
    Vibration.vibrate(30);
    sendMutation.mutate({
      message_type: 'text',
      content: message.trim(),
      language: isAr ? 'ar' : 'en',
    });
    setMessage('');
  }, [message, isAr, sendMutation]);

  const handlePriorityMessage = useCallback(() => {
    if (!message.trim()) return;
    Vibration.vibrate([0, 50, 50, 50]);
    sendMutation.mutate({
      message_type: 'text',
      content: message.trim(),
      is_priority: true,
      language: isAr ? 'ar' : 'en',
    });
    setMessage('');
  }, [message, isAr, sendMutation]);

  const handleReaction = useCallback((messageId: number, emoji: string) => {
    // Send reaction to server (fire and forget)
    teamCommunicationApi.sendMessage(channelId, {
      message_type: 'text',
      content: `[reaction:${emoji}:${messageId}]`,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    }).catch(() => {});
  }, [channelId, queryClient]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Stable random heights for voice wave bars (avoid re-randomizing on render)
  const voiceBarHeights = useMemo(() => Array.from({ length: 12 }, () => 8 + Math.random() * 16), []);

  const renderMessage = ({ item }: { item: TeamMessage }) => {
    const isMe = item.sender_id === user?.id;
    const isSystem = item.message_type === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemMsg}>
          <Text style={styles.systemMsgText}>📢 {item.content}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {!isMe && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(item.sender_name || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={[
          styles.msgBubble,
          isMe ? styles.msgBubbleMe : styles.msgBubbleOther,
          item.is_priority && styles.msgPriority,
        ]}>
          {!isMe && (
            <Text style={styles.senderName}>{item.sender_name}</Text>
          )}

          {item.message_type === 'voice' && (
            <View style={styles.voiceMsg}>
              <Text style={styles.voiceIcon}>🎤</Text>
              <View style={styles.voiceWave}>
                {voiceBarHeights.map((h, i) => (
                  <View
                    key={i}
                    style={[styles.voiceBar, { height: h }]}
                  />
                ))}
              </View>
              <Text style={styles.voiceDuration}>
                {item.duration_seconds ? `${Math.floor(item.duration_seconds / 60)}:${String(item.duration_seconds % 60).padStart(2, '0')}` : '0:00'}
              </Text>
            </View>
          )}

          {item.message_type === 'photo' && (item as any).media_url ? (
            <MediaAttachment
              type="photo"
              mediaUrl={(item as any).media_url}
              thumbnailUrl={(item as any).thumbnail_url}
              isMe={isMe}
              caption={item.content}
              isAr={isAr}
            />
          ) : item.message_type === 'photo' && (
            <View style={styles.photoMsg}>
              <Text style={styles.photoIcon}>📸</Text>
              <Text style={styles.photoText}>
                {isAr ? 'صورة' : 'Photo'}
              </Text>
            </View>
          )}

          {item.message_type === 'location' && (
            <View style={styles.locationMsg}>
              <Text style={styles.locationIcon}>📍</Text>
              <Text style={styles.locationText}>
                {item.location_label || (isAr ? 'موقع' : 'Location')}
              </Text>
            </View>
          )}

          {(item.message_type === 'text' || !item.message_type) && item.content && (
            <TranslatedMessage
              content={item.content}
              originalLanguage={(item as any).language}
              translatedContent={(item as any).translated_content}
              isMe={isMe}
              userLanguage={isAr ? 'ar' : 'en'}
              autoTranslate={true}
            />
          )}

          {item.is_priority && (
            <Text style={styles.priorityBadge}>🚨 {isAr ? 'عاجل' : 'URGENT'}</Text>
          )}

          <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>
            {formatTime(item.created_at)}
            {isMe && ' ✓'}
          </Text>

          {/* Message Reactions */}
          <MessageReactions
            messageId={item.id}
            reactions={(item as any).reactions}
            isMe={isMe}
            isAr={isAr}
            onReact={handleReaction}
          />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{channelName || 'Chat'}</Text>
          <Text style={styles.headerSubtitle}>
            {messages.length} {isAr ? 'رسالة' : 'messages'}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>
              {isAr ? 'ابدأ المحادثة' : 'Start the conversation'}
            </Text>
          </View>
        }
      />

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputContainer}>
          {/* Walkie-talkie button */}
          <TouchableOpacity
            style={[styles.micBtn, isRecording && styles.micBtnActive]}
            onPressIn={() => { setIsRecording(true); Vibration.vibrate(50); }}
            onPressOut={() => { setIsRecording(false); }}
          >
            <Text style={styles.micBtnText}>{isRecording ? '🔴' : '🎤'}</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={message}
            onChangeText={setMessage}
            placeholder={isAr ? 'اكتب رسالة...' : 'Type a message...'}
            placeholderTextColor="#bfbfbf"
            multiline
            maxLength={2000}
          />

          {/* Priority send */}
          {message.trim() && (
            <TouchableOpacity
              style={styles.priorityBtn}
              onPress={handlePriorityMessage}
            >
              <Text style={styles.priorityBtnText}>🚨</Text>
            </TouchableOpacity>
          )}

          {/* Send button */}
          <TouchableOpacity
            style={[styles.sendBtn, !message.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!message.trim()}
          >
            <Text style={styles.sendBtnText}>
              {isAr ? '↩️' : '➤'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    elevation: 2,
  },
  backBtn: { padding: 8 },
  backBtnText: { fontSize: 24, color: '#1677ff' },
  headerInfo: { flex: 1, marginLeft: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#262626' },
  headerSubtitle: { fontSize: 12, color: '#8c8c8c' },
  messageList: { padding: 12, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-end' },
  msgRowMe: { flexDirection: 'row-reverse' },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#e6f4ff',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#1677ff' },
  msgBubble: {
    maxWidth: '75%', borderRadius: 16, padding: 10,
    elevation: 1,
  },
  msgBubbleMe: {
    backgroundColor: '#1677ff', borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: '#fff', borderBottomLeftRadius: 4,
  },
  msgPriority: {
    borderWidth: 2, borderColor: '#ff4d4f',
  },
  senderName: {
    fontSize: 12, fontWeight: '700', color: '#1677ff', marginBottom: 4,
  },
  msgText: { fontSize: 15, color: '#262626', lineHeight: 20 },
  msgTextMe: { color: '#fff' },
  msgTime: { fontSize: 10, color: '#bfbfbf', marginTop: 4, textAlign: 'right' },
  msgTimeMe: { color: 'rgba(255,255,255,0.7)' },
  priorityBadge: {
    fontSize: 11, fontWeight: '700', color: '#ff4d4f', marginTop: 4,
  },
  voiceMsg: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceIcon: { fontSize: 20 },
  voiceWave: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  voiceBar: { width: 3, backgroundColor: '#91caff', borderRadius: 1.5 },
  voiceDuration: { fontSize: 12, color: '#8c8c8c' },
  photoMsg: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoIcon: { fontSize: 20 },
  photoText: { fontSize: 14, color: '#595959' },
  locationMsg: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationIcon: { fontSize: 20 },
  locationText: { fontSize: 14, color: '#1677ff' },
  systemMsg: {
    alignItems: 'center', paddingVertical: 8, marginBottom: 8,
  },
  systemMsgText: {
    fontSize: 13, color: '#8c8c8c', fontWeight: '500',
    backgroundColor: '#fafafa', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 6,
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  micBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#f5f5f5',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  micBtnActive: { backgroundColor: '#ff4d4f' },
  micBtnText: { fontSize: 22 },
  textInput: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, color: '#262626',
  },
  priorityBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginLeft: 4,
  },
  priorityBtnText: { fontSize: 18 },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#1677ff',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: '#d9d9d9' },
  sendBtnText: { fontSize: 20, color: '#fff' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#bfbfbf' },
});
