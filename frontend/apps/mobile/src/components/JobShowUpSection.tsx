/**
 * JobShowUpSection — Mobile component for Show Up Photo + Challenge Voice + Review Marks
 * Used in Specialist and Engineer job detail screens.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getApiClient } from '@inspection/shared';

interface Props {
  jobType: 'specialist' | 'engineer';
  jobId: number;
  jobOwnerId: number;
  jobStatus: string;
  userRole: string;
  userId: number;
}

interface ShowUpSummary {
  showup_photos: any[];
  challenge_voices: any[];
  review_marks: {
    stars: any[];
    points: any[];
    star_count: number;
    point_count: number;
  };
  has_showup_photo: boolean;
  has_challenges: boolean;
}

export default function JobShowUpSection({ jobType, jobId, jobOwnerId, jobStatus, userRole, userId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [markNote, setMarkNote] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const isOwner = userId === jobOwnerId;
  const isAdmin = userRole === 'admin';
  const isEngineer = userRole === 'engineer';
  const canMark = isAdmin || isEngineer;
  const canUpload = isOwner || isAdmin;

  // Query
  const summaryQuery = useQuery({
    queryKey: ['job-showup', jobType, jobId],
    queryFn: () => getApiClient().get(`/api/job-showup/${jobType}/${jobId}/showup-summary`),
    select: (res: any) => (res.data?.data ?? res.data) as ShowUpSummary,
    enabled: !!jobId,
  });

  const summary = summaryQuery.data;

  // Upload show-up photo
  const uploadPhotoMutation = useMutation({
    mutationFn: async (uri: string) => {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return getApiClient().post(
        `/api/job-showup/${jobType}/${jobId}/showup-photo`,
        { file_base64: base64, file_name: 'showup_photo.jpg', file_type: 'image/jpeg' },
        { headers: { 'Content-Type': 'application/json' }, timeout: 180000 },
      );
    },
    onSuccess: () => {
      Alert.alert('Success', 'Show-up photo uploaded');
      queryClient.invalidateQueries({ queryKey: ['job-showup', jobType, jobId] });
    },
    onError: () => Alert.alert('Error', 'Failed to upload photo'),
  });

  // Upload challenge voice
  const uploadVoiceMutation = useMutation({
    mutationFn: async (uri: string) => {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return getApiClient().post(
        `/api/job-showup/${jobType}/${jobId}/challenge-voice`,
        { audio_base64: base64, file_name: 'challenge.m4a', file_type: 'audio/m4a' },
        { headers: { 'Content-Type': 'application/json' }, timeout: 180000 },
      );
    },
    onSuccess: () => {
      Alert.alert('Success', 'Challenge voice uploaded with transcription');
      queryClient.invalidateQueries({ queryKey: ['job-showup', jobType, jobId] });
    },
    onError: () => Alert.alert('Error', 'Failed to upload voice'),
  });

  // Add review mark
  const addMarkMutation = useMutation({
    mutationFn: (markType: 'star' | 'point') =>
      getApiClient().post(`/api/job-showup/${jobType}/${jobId}/review-mark`, {
        mark_type: markType,
        note: markNote.trim() || undefined,
      }),
    onSuccess: (_: any, markType: 'star' | 'point') => {
      Alert.alert('Success', markType === 'star' ? 'Marked as Show Up' : 'Marked as Challenge');
      setMarkNote('');
      queryClient.invalidateQueries({ queryKey: ['job-showup', jobType, jobId] });
    },
    onError: () => Alert.alert('Error', 'Failed to add mark'),
  });

  // Take photo
  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take a show-up photo');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      uploadPhotoMutation.mutate(result.assets[0].uri);
    }
  }, [uploadPhotoMutation]);

  // Pick from gallery
  const handlePickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Gallery permission is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      uploadPhotoMutation.mutate(result.assets[0].uri);
    }
  }, [uploadPhotoMutation]);

  // Record voice
  const handleStartRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Microphone permission is required');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording');
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (uri) {
        uploadVoiceMutation.mutate(uri);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to stop recording');
    }
  }, [recording, uploadVoiceMutation]);

  // Play audio
  const handlePlayAudio = useCallback(async (url: string, voiceId: number) => {
    try {
      if (playingId === voiceId) {
        await soundRef.current?.stopAsync();
        setPlayingId(null);
        return;
      }
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync({ uri: url });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) setPlayingId(null);
      });
      await sound.playAsync();
      setPlayingId(voiceId);
    } catch {
      Alert.alert('Error', 'Failed to play audio');
    }
  }, [playingId]);

  if (summaryQuery.isLoading) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>Show Up & Challenges</Text>

      {/* Counts */}
      <View style={styles.countsRow}>
        {(summary?.review_marks?.star_count ?? 0) > 0 && (
          <View style={[styles.countBadge, { backgroundColor: '#FFF8E1' }]}>
            <Text style={{ color: '#F9A825' }}>★ {summary?.review_marks.star_count}</Text>
          </View>
        )}
        {(summary?.review_marks?.point_count ?? 0) > 0 && (
          <View style={[styles.countBadge, { backgroundColor: '#FFEBEE' }]}>
            <Text style={{ color: '#D32F2F' }}>⚠ {summary?.review_marks.point_count}</Text>
          </View>
        )}
      </View>

      {/* SHOW-UP PHOTOS */}
      <Text style={styles.subHeader}>📸 Show Up Photo</Text>
      {summary?.showup_photos && summary.showup_photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {summary.showup_photos.map((photo: any) => (
            <View key={photo.id} style={styles.photoCard}>
              <Image
                source={{ uri: photo.file?.file_path }}
                style={styles.photoImage}
                resizeMode="cover"
              />
              <Text style={styles.photoMeta}>{photo.uploader_name}</Text>
              <Text style={styles.photoMeta}>{new Date(photo.created_at).toLocaleString()}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>No show-up photo yet</Text>
      )}

      {canUpload && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1976D2' }]}
            onPress={handleTakePhoto}
            disabled={uploadPhotoMutation.isPending}
          >
            {uploadPhotoMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>📷 Take Photo</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#7B1FA2' }]}
            onPress={handlePickPhoto}
            disabled={uploadPhotoMutation.isPending}
          >
            <Text style={styles.actionBtnText}>🖼 Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CHALLENGE VOICES */}
      <Text style={styles.subHeader}>🎙️ Challenges</Text>
      {summary?.challenge_voices && summary.challenge_voices.length > 0 ? (
        summary.challenge_voices.map((voice: any, index: number) => (
          <View key={voice.id} style={styles.voiceCard}>
            <View style={styles.voiceHeader}>
              <Text style={styles.voiceTitle}>Challenge {index + 1}</Text>
              <Text style={styles.voiceMeta}>{voice.recorder_name}</Text>
            </View>

            {voice.file?.file_path && (
              <TouchableOpacity
                style={styles.playBtn}
                onPress={() => handlePlayAudio(voice.file.file_path, voice.id)}
              >
                <Text style={styles.playBtnText}>
                  {playingId === voice.id ? '⏸ Pause' : '▶ Play Audio'}
                </Text>
              </TouchableOpacity>
            )}

            {voice.transcription_en && (
              <View style={[styles.transcriptionBox, { borderLeftColor: '#1976D2', backgroundColor: '#E3F2FD' }]}>
                <Text style={styles.transcriptionLabel}>EN:</Text>
                <Text style={styles.transcriptionText}>{voice.transcription_en}</Text>
              </View>
            )}
            {voice.transcription_ar && (
              <View style={[styles.transcriptionBox, { borderLeftColor: '#FF9800', backgroundColor: '#FFF3E0' }]}>
                <Text style={[styles.transcriptionLabel, { textAlign: 'right' }]}>AR:</Text>
                <Text style={[styles.transcriptionText, { textAlign: 'right', writingDirection: 'rtl' }]}>
                  {voice.transcription_ar}
                </Text>
              </View>
            )}

            <Text style={styles.voiceTime}>{new Date(voice.created_at).toLocaleString()}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>No challenges recorded</Text>
      )}

      {canUpload && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: isRecording ? '#D32F2F' : '#388E3C' },
            ]}
            onPress={isRecording ? handleStopRecording : handleStartRecording}
            disabled={uploadVoiceMutation.isPending}
          >
            {uploadVoiceMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>
                {isRecording ? '⏹ Stop Recording' : '🎙 Record Challenge'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* REVIEW MARKS */}
      <Text style={styles.subHeader}>⭐ Review Marks</Text>
      {summary?.review_marks && (summary.review_marks.stars.length > 0 || summary.review_marks.points.length > 0) ? (
        <View>
          {summary.review_marks.stars.map((mark: any) => (
            <View key={mark.id} style={styles.markRow}>
              <View style={[styles.markBadge, { backgroundColor: '#FFF8E1' }]}>
                <Text style={{ color: '#F9A825', fontWeight: '700' }}>★ Show Up</Text>
              </View>
              <Text style={styles.markMeta}>{mark.marker_name}</Text>
              {mark.note && <Text style={styles.markNote}>— {mark.note}</Text>}
            </View>
          ))}
          {summary.review_marks.points.map((mark: any) => (
            <View key={mark.id} style={styles.markRow}>
              <View style={[styles.markBadge, { backgroundColor: '#FFEBEE' }]}>
                <Text style={{ color: '#D32F2F', fontWeight: '700' }}>⚠ Challenge</Text>
              </View>
              <Text style={styles.markMeta}>{mark.marker_name}</Text>
              {mark.note && <Text style={styles.markNote}>— {mark.note}</Text>}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>No review marks yet</Text>
      )}

      {canMark && (
        <View style={{ marginTop: 12 }}>
          <TextInput
            style={styles.noteInput}
            placeholder="Optional note..."
            value={markNote}
            onChangeText={setMarkNote}
          />
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#F9A825' }]}
              onPress={() => addMarkMutation.mutate('star')}
              disabled={addMarkMutation.isPending}
            >
              <Text style={[styles.actionBtnText, { color: '#000' }]}>★ Star — Show Up</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#D32F2F' }]}
              onPress={() => addMarkMutation.mutate('point')}
              disabled={addMarkMutation.isPending}
            >
              <Text style={styles.actionBtnText}>⚠ Point — Challenge</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  subHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: '#424242',
    marginTop: 16,
    marginBottom: 8,
  },
  countsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoCard: {
    marginRight: 12,
    alignItems: 'center',
  },
  photoImage: {
    width: 140,
    height: 105,
    borderRadius: 8,
  },
  photoMeta: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  emptyText: {
    color: '#999',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  voiceCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  voiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  voiceTitle: {
    fontWeight: '600',
    fontSize: 14,
    color: '#333',
  },
  voiceMeta: {
    fontSize: 12,
    color: '#888',
  },
  voiceTime: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 6,
  },
  playBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    marginBottom: 8,
  },
  playBtnText: {
    color: '#1976D2',
    fontWeight: '600',
    fontSize: 13,
  },
  transcriptionBox: {
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    marginBottom: 4,
  },
  transcriptionLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 2,
  },
  transcriptionText: {
    fontSize: 13,
    color: '#333',
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  markBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  markMeta: {
    fontSize: 12,
    color: '#666',
  },
  markNote: {
    fontSize: 13,
    color: '#333',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
});
