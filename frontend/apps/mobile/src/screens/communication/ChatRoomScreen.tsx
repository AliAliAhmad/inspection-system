import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi, getApiClient } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import type { TeamMessage } from '@inspection/shared';
import { MessageReactions } from '../../components/chat/MessageReactions';
import { TranslatedMessage } from '../../components/chat/TranslatedMessage';
import { MediaAttachment } from '../../components/chat/MediaAttachment';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { filesApi } from '@inspection/shared';

export default function ChatRoomScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';
  const flatListRef = useRef<FlatList>(null);

  const { channelId, channelName } = route.params || {};
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isVoiceUploading, setIsVoiceUploading] = useState(false);
  const [isMediaUploading, setIsMediaUploading] = useState(false);

  // Recording refs
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback state
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const { data: messages = [], refetch } = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => teamCommunicationApi.getMessages(channelId).then(r => r.data.data),
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: (data: any) => teamCommunicationApi.sendMessage(channelId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  // Mark as read on open
  useEffect(() => {
    teamCommunicationApi.markRead(channelId).catch(() => {});
  }, [channelId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

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
    teamCommunicationApi.sendMessage(channelId, {
      message_type: 'text',
      content: `[reaction:${emoji}:${messageId}]`,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    }).catch(() => {});
  }, [channelId, queryClient]);

  // === Voice Recording ===
  const startRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          isAr ? 'صلاحية الميكروفون' : 'Microphone Permission',
          isAr ? 'يرجى تفعيل صلاحية الميكروفون' : 'Please enable microphone access'
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingTime(0);
      Vibration.vibrate(50);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [isAr]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);
    const durationSecs = recordingTime;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri || durationSecs < 1) return;

      setIsVoiceUploading(true);
      Vibration.vibrate(30);

      // Read audio as base64
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      if (!base64) throw new Error('File read returned empty');

      // Upload to /api/voice/transcribe for transcription + cloud storage
      const response = await getApiClient().post(
        '/api/voice/transcribe',
        {
          audio_base64: base64,
          file_name: 'voice_msg.m4a',
          file_type: 'audio/m4a',
          language: isAr ? 'ar' : 'en',
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 180000,
        }
      );

      const result = (response.data as any)?.data;
      const audioUrl = result?.audio_file?.url || null;
      const transcriptionEn = result?.en || '';
      const transcriptionAr = result?.ar || '';

      // Build content with transcription
      let content = '';
      if (transcriptionEn) content += transcriptionEn;
      if (transcriptionAr && transcriptionAr !== transcriptionEn) {
        content += content ? `\n${transcriptionAr}` : transcriptionAr;
      }
      if (!content) content = isAr ? 'رسالة صوتية' : 'Voice message';

      // Send voice message to channel
      sendMutation.mutate({
        message_type: 'voice',
        content,
        media_url: audioUrl,
        duration_seconds: durationSecs,
        language: isAr ? 'ar' : 'en',
      });
    } catch (err: any) {
      console.error('Voice upload failed:', err);
      const msg = err?.message?.includes('timeout')
        ? (isAr ? 'انتهت المهلة. حاول مرة أخرى.' : 'Upload timeout. Try again.')
        : (isAr ? 'فشل رفع الصوت' : 'Voice upload failed');
      Alert.alert(isAr ? 'خطأ' : 'Error', msg);
    } finally {
      setIsVoiceUploading(false);
      setRecordingTime(0);
    }
  }, [recordingTime, isAr, sendMutation]);

  // WhatsApp-style: hold to record, release to send
  const handleMicPressIn = useCallback(() => {
    if (!isVoiceUploading) {
      startRecording();
    }
  }, [isVoiceUploading, startRecording]);

  const handleMicPressOut = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording]);

  // === Voice Playback ===
  const playVoiceMessage = useCallback(async (msgId: number, mediaUrl: string) => {
    try {
      // Stop current playback
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      if (playingMessageId === msgId) {
        setPlayingMessageId(null);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Convert to mp3 for iOS compatibility
      const playUrl = mediaUrl.includes('cloudinary.com')
        ? mediaUrl.replace('/upload/', '/upload/f_mp3/')
        : mediaUrl;

      const { sound } = await Audio.Sound.createAsync({ uri: playUrl });
      soundRef.current = sound;
      setPlayingMessageId(msgId);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingMessageId(null);
        }
      });

      await sound.playAsync();
    } catch (err) {
      console.error('Playback error:', err);
      setPlayingMessageId(null);
    }
  }, [playingMessageId]);

  // === Media Picker (Photo/Video) ===
  const pickMedia = useCallback(async (source: 'camera' | 'gallery', mediaType: 'photo' | 'video') => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(isAr ? 'صلاحية الكاميرا' : 'Camera Permission', isAr ? 'يرجى تفعيل صلاحية الكاميرا' : 'Please enable camera access');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: mediaType === 'video' ? ['videos'] : ['images'],
          quality: 0.8,
          videoMaxDuration: 60,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(isAr ? 'صلاحية المعرض' : 'Gallery Permission', isAr ? 'يرجى تفعيل صلاحية المعرض' : 'Please enable gallery access');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: mediaType === 'video' ? ['videos'] : ['images'],
          quality: 0.8,
          videoMaxDuration: 60,
        });
      }

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setIsMediaUploading(true);

      // Upload via FormData
      const formData = new FormData();
      const fileName = asset.fileName || (mediaType === 'video' ? 'video.mp4' : 'photo.jpg');
      const mimeType = asset.mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');

      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      } as any);
      formData.append('related_type', 'chat_message');
      formData.append('related_id', String(channelId));
      formData.append('category', mediaType);

      const uploadRes = await filesApi.uploadFormData(formData);
      const fileRecord = (uploadRes.data as any)?.data;
      const mediaUrl = fileRecord?.url || fileRecord?.cloudinary_url;

      if (!mediaUrl) throw new Error('Upload returned no URL');

      // Send media message
      sendMutation.mutate({
        message_type: mediaType,
        content: mediaType === 'video' ? (isAr ? 'فيديو' : 'Video') : (isAr ? 'صورة' : 'Photo'),
        media_url: mediaUrl,
        language: isAr ? 'ar' : 'en',
      });
    } catch (err: any) {
      console.error('Media upload failed:', err);
      Alert.alert(isAr ? 'خطأ' : 'Error', isAr ? 'فشل رفع الملف' : 'Media upload failed');
    } finally {
      setIsMediaUploading(false);
    }
  }, [isAr, channelId, sendMutation]);

  const showMediaOptions = useCallback(() => {
    Alert.alert(
      isAr ? 'إرفاق ملف' : 'Attach Media',
      isAr ? 'اختر المصدر' : 'Choose source',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        { text: isAr ? '📷 كاميرا (صورة)' : '📷 Camera (Photo)', onPress: () => pickMedia('camera', 'photo') },
        { text: isAr ? '🎥 كاميرا (فيديو)' : '🎥 Camera (Video)', onPress: () => pickMedia('camera', 'video') },
        { text: isAr ? '🖼️ معرض الصور' : '🖼️ Gallery (Photo)', onPress: () => pickMedia('gallery', 'photo') },
        { text: isAr ? '📹 معرض الفيديو' : '📹 Gallery (Video)', onPress: () => pickMedia('gallery', 'video') },
      ]
    );
  }, [isAr, pickMedia]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Stable random heights for voice wave bars
  const voiceBarHeights = useMemo(() => Array.from({ length: 12 }, () => 8 + Math.random() * 16), []);

  const renderMessage = ({ item }: { item: TeamMessage }) => {
    const isMe = item.sender_id === user?.id;
    const isSystem = item.message_type === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemMsg}>
          <Text style={styles.systemMsgText}>{item.content}</Text>
        </View>
      );
    }

    const isVoice = item.message_type === 'voice';
    const isPlayingThis = playingMessageId === item.id;

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

          {/* Voice message with playback + transcription */}
          {isVoice && (
            <View>
              <TouchableOpacity
                style={styles.voiceMsg}
                onPress={() => item.media_url ? playVoiceMessage(item.id, item.media_url) : undefined}
                activeOpacity={item.media_url ? 0.6 : 1}
              >
                <Text style={styles.voiceIcon}>{isPlayingThis ? '⏹' : '▶️'}</Text>
                <View style={styles.voiceWave}>
                  {voiceBarHeights.map((h, i) => (
                    <View
                      key={i}
                      style={[
                        styles.voiceBar,
                        { height: h },
                        isPlayingThis && { backgroundColor: '#52c41a' },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.voiceDuration, isMe && { color: 'rgba(255,255,255,0.7)' }]}>
                  {item.duration_seconds ? `${Math.floor(item.duration_seconds / 60)}:${String(item.duration_seconds % 60).padStart(2, '0')}` : '0:00'}
                </Text>
              </TouchableOpacity>
              {/* Transcription text */}
              {item.content && item.content !== 'Voice message' && item.content !== 'رسالة صوتية' && (
                <Text style={[
                  styles.voiceTranscription,
                  isMe && { color: 'rgba(255,255,255,0.8)' },
                ]} numberOfLines={4}>
                  {item.content}
                </Text>
              )}
            </View>
          )}

          {(item.message_type === 'photo' || item.message_type === 'video') && (item as any).media_url ? (
            <MediaAttachment
              type={item.message_type as 'photo' | 'video'}
              mediaUrl={(item as any).media_url}
              thumbnailUrl={(item as any).thumbnail_url || (item as any).media_thumbnail}
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

          {item.message_type === 'video' && !(item as any).media_url && (
            <View style={styles.photoMsg}>
              <Text style={styles.photoIcon}>🎥</Text>
              <Text style={styles.photoText}>
                {isAr ? 'فيديو' : 'Video'}
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
            <Text style={styles.priorityBadge}>{isAr ? 'عاجل' : 'URGENT'}</Text>
          )}

          <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>
            {formatTime(item.created_at)}
            {isMe && ' ✓'}
          </Text>

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

      {/* Recording indicator bar */}
      {(isRecording || isVoiceUploading) && (
        <View style={styles.recordingBar}>
          {isRecording && <View style={styles.recordingDot} />}
          <Text style={styles.recordingBarText}>
            {isVoiceUploading
              ? (isAr ? 'جارٍ الرفع...' : 'Uploading...')
              : `${formatRecordingTime(recordingTime)}`}
          </Text>
          {isRecording && (
            <Text style={styles.recordingHint}>
              {isAr ? '◄ ارفع إصبعك للإرسال' : 'Release to send ►'}
            </Text>
          )}
          {isVoiceUploading && <ActivityIndicator size="small" color="#fff" />}
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputContainer}>
          {/* WhatsApp-style mic: hold to record, release to send */}
          <TouchableOpacity
            style={[
              styles.micBtn,
              isRecording && styles.micBtnActive,
            ]}
            onPressIn={handleMicPressIn}
            onPressOut={handleMicPressOut}
            disabled={isVoiceUploading}
            activeOpacity={0.7}
            delayPressIn={0}
          >
            {isVoiceUploading ? (
              <ActivityIndicator size="small" color="#1677ff" />
            ) : (
              <Text style={styles.micBtnText}>{isRecording ? '🔴' : '🎤'}</Text>
            )}
          </TouchableOpacity>

          {/* Attachment button: photo/video */}
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={showMediaOptions}
            disabled={isMediaUploading || isRecording}
          >
            {isMediaUploading ? (
              <ActivityIndicator size="small" color="#1677ff" />
            ) : (
              <Text style={styles.attachBtnText}>📎</Text>
            )}
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
  voiceTranscription: {
    fontSize: 11, color: '#595959', marginTop: 4, lineHeight: 15, fontStyle: 'italic',
  },
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
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#25D366',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15, shadowRadius: 2,
  },
  micBtnActive: { backgroundColor: '#ff4d4f', width: 56, height: 56, borderRadius: 28 },
  micBtnText: { fontSize: 24 },
  attachBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: 6,
  },
  attachBtnText: { fontSize: 22 },
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
  // Recording bar
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#ff4d4f', paddingVertical: 6, paddingHorizontal: 16,
  },
  recordingDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff',
  },
  recordingBarText: {
    color: '#fff', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] as any,
  },
  recordingHint: {
    color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500',
  },
});
