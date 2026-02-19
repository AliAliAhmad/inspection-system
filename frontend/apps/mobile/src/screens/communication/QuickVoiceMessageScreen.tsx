import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamCommunicationApi, getApiClient } from '@inspection/shared';
import type { TeamChannel } from '@inspection/shared';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const CHANNEL_ICONS: Record<string, string> = {
  general: '💬',
  shift: '🔄',
  role: '👥',
  job: '🔧',
  emergency: '🚨',
  dm: '👤',
};

export default function QuickVoiceMessageScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';

  // State
  const [selectedChannel, setSelectedChannel] = useState<TeamChannel | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);

  // Refs
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Fetch channels
  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => teamCommunicationApi.getChannels().then(r => r.data.data),
  });

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Recording logic
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
      setRecordedAudioUri(null);
      Vibration.vibrate(50);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert(
        isAr ? 'خطأ' : 'Error',
        isAr ? 'فشل بدء التسجيل' : 'Failed to start recording'
      );
    }
  }, [isAr]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);
    const duration = recordingTime;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri || duration < 1) return;

      setRecordedAudioUri(uri);
      setRecordedDuration(duration);
      Vibration.vibrate(30);
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  }, [recordingTime]);

  const handleMicPress = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const discardRecording = useCallback(() => {
    setRecordedAudioUri(null);
    setRecordedDuration(0);
    setRecordingTime(0);
  }, []);

  // Send voice message
  const handleSend = useCallback(async () => {
    if (!selectedChannel || !recordedAudioUri) return;

    setIsSending(true);
    try {
      // Read audio as base64
      const base64 = await FileSystem.readAsStringAsync(recordedAudioUri, {
        encoding: 'base64',
      });
      if (!base64) throw new Error('File read returned empty');

      setIsUploading(true);

      // Upload to /api/voice/transcribe for transcription + cloud storage
      const response = await getApiClient().post(
        '/api/voice/transcribe',
        {
          audio_base64: base64,
          file_name: 'quick_voice_msg.m4a',
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

      setIsUploading(false);

      // Send voice message to selected channel
      await teamCommunicationApi.sendMessage(selectedChannel.id, {
        message_type: 'voice',
        content,
        media_url: audioUrl,
        duration_seconds: recordedDuration,
        language: isAr ? 'ar' : 'en',
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['messages', selectedChannel.id] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });

      // Show success and navigate back
      Alert.alert(
        '',
        t('voice_message.sent'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      console.error('Voice send failed:', err);
      const msg = err?.message?.includes('timeout')
        ? (isAr ? 'انتهت المهلة. حاول مرة أخرى.' : 'Upload timeout. Try again.')
        : (isAr ? 'فشل إرسال الرسالة الصوتية' : 'Failed to send voice message');
      Alert.alert(isAr ? 'خطأ' : 'Error', msg);
    } finally {
      setIsSending(false);
      setIsUploading(false);
    }
  }, [selectedChannel, recordedAudioUri, recordedDuration, isAr, queryClient, navigation, t]);

  const renderChannel = ({ item }: { item: TeamChannel }) => {
    const isSelected = selectedChannel?.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.channelCard, isSelected && styles.channelCardSelected]}
        onPress={() => setSelectedChannel(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.channelIcon, isSelected && styles.channelIconSelected]}>
          <Text style={styles.channelIconText}>
            {CHANNEL_ICONS[item.channel_type] || '💬'}
          </Text>
        </View>
        <View style={styles.channelInfo}>
          <Text style={[styles.channelName, isSelected && styles.channelNameSelected]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.memberCount}>
            {item.member_count} {isAr ? 'عضو' : 'members'}
          </Text>
        </View>
        {isSelected && (
          <View style={styles.checkMark}>
            <Text style={styles.checkMarkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const hasRecording = !!recordedAudioUri;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{isAr ? '→' : '←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('voice_message.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Step 1: Select channel */}
      <Text style={styles.sectionLabel}>
        {t('voice_message.select_channel')}
      </Text>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7B1FA2" />
        </View>
      ) : channels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyText}>{t('voice_message.no_channels')}</Text>
        </View>
      ) : (
        <FlatList
          data={channels}
          renderItem={renderChannel}
          keyExtractor={(item) => String(item.id)}
          style={styles.channelList}
          contentContainerStyle={styles.channelListContent}
        />
      )}

      {/* Step 2: Record voice */}
      {selectedChannel && (
        <View style={styles.recordSection}>
          <View style={styles.selectedChannelBanner}>
            <Text style={styles.selectedChannelText}>
              {CHANNEL_ICONS[selectedChannel.channel_type] || '💬'} {selectedChannel.name}
            </Text>
          </View>

          {/* Recording UI */}
          <View style={styles.recordingArea}>
            {isRecording ? (
              <View style={styles.recordingStatus}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
              </View>
            ) : hasRecording ? (
              <View style={styles.recordedStatus}>
                <Text style={styles.recordedIcon}>✓</Text>
                <Text style={styles.recordedText}>
                  {formatTime(recordedDuration)}
                </Text>
                <TouchableOpacity onPress={discardRecording} style={styles.discardBtn}>
                  <Text style={styles.discardBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.hintText}>
                {t('voice_message.record')}
              </Text>
            )}

            {/* Mic button */}
            <TouchableOpacity
              style={[
                styles.micButton,
                isRecording && styles.micButtonRecording,
                (isSending || isUploading) && styles.micButtonDisabled,
              ]}
              onPress={handleMicPress}
              disabled={isSending || isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎙️'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Send button */}
          {hasRecording && !isRecording && (
            <TouchableOpacity
              style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={isSending}
            >
              {isSending ? (
                <View style={styles.sendingRow}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.sendButtonText}>
                    {t('voice_message.sending')}
                  </Text>
                </View>
              ) : (
                <Text style={styles.sendButtonText}>
                  {t('voice_message.send')}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  backBtnText: {
    fontSize: 25,
    color: '#7B1FA2',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#262626',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8c8c8c',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#bfbfbf',
  },
  channelList: {
    flex: 1,
  },
  channelListContent: {
    paddingBottom: 8,
  },
  channelCard: {
    flexDirection: 'row',
    padding: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  channelCardSelected: {
    backgroundColor: '#f3e5f5',
  },
  channelIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  channelIconSelected: {
    backgroundColor: '#CE93D8',
  },
  channelIconText: {
    fontSize: 22,
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#262626',
  },
  channelNameSelected: {
    color: '#7B1FA2',
  },
  memberCount: {
    fontSize: 14,
    color: '#8c8c8c',
    marginTop: 2,
  },
  checkMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7B1FA2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkMarkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Record section
  recordSection: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fafafa',
    padding: 16,
    paddingBottom: 24,
  },
  selectedChannelBanner: {
    backgroundColor: '#f3e5f5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  selectedChannelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7B1FA2',
  },
  recordingArea: {
    alignItems: 'center',
    gap: 12,
  },
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f5222d',
  },
  recordingTime: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f5222d',
    fontVariant: ['tabular-nums'],
  },
  recordedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e8f5e9',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  recordedIcon: {
    fontSize: 16,
    color: '#4caf50',
    fontWeight: '700',
  },
  recordedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4caf50',
  },
  discardBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffcdd2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  discardBtnText: {
    fontSize: 12,
    color: '#f44336',
    fontWeight: '700',
  },
  hintText: {
    fontSize: 15,
    color: '#8c8c8c',
    marginBottom: 4,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#7B1FA2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    boxShadow: '0px 3px 6px rgba(123, 31, 162, 0.3)',
  },
  micButtonRecording: {
    backgroundColor: '#f5222d',
    boxShadow: '0px 3px 6px rgba(242, 34, 45, 0.3)',
  },
  micButtonDisabled: {
    opacity: 0.5,
  },
  micIcon: {
    fontSize: 30,
  },
  sendButton: {
    backgroundColor: '#7B1FA2',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
