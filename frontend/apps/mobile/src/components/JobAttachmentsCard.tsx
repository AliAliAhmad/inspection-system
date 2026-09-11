/**
 * The planner's photos and voice notes, on the worker's phone.
 *
 * Ali, 2026-09-09: "the mobile app, the user side cannot see the photo or voice
 * i added them when i plan the job, he should be able to see them as the goal of
 * this photo and voice is to make the job clear for them more details about the
 * job."
 *
 * WHAT WAS ACTUALLY BROKEN
 * =======================
 *
 * Nothing on the server. Both payloads already carried them — /my-plan sends
 * `sub_tasks` with `attachment_url`, and /jobs/<id>/tasks the same. The phone
 * FETCHED the photo rows and then drew only their text, because
 * JobSubTasksCard renders `task.content` and nothing else. A photo row's content
 * is the word "Photo", so a worker saw a tickable box saying "Photo" with no
 * photo on it — worse than nothing, because it looks like the photo failed.
 *
 * So this is a drawing fix, and those rows are now filtered OUT of the tick list
 * and drawn here instead. A photo is not a task to tick off; it is what the job
 * IS.
 *
 * READ-ONLY ON PURPOSE
 * ====================
 *
 * The planner adds these on the board. The worker looks at them before he walks
 * to the machine. Adding from the phone is a separate ask and is not this.
 *
 * WHY THE URL IS REWRITTEN BEFORE PLAYING
 * =======================================
 *
 * A planner on Chrome records webm; on Safari, m4a. iOS cannot play webm at all.
 * Cloudinary re-encodes on the fly if the URL asks it to, and this codebase
 * already relies on that in VoiceNoteRecorder — so every note is asked for as
 * mp3 rather than gambling on which browser recorded it and which phone is
 * listening.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Modal,
  ActivityIndicator, ScrollView, Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { jobSubTasksApi } from '@inspection/shared';
import type { JobSubTask, JobSubTaskList } from '@inspection/shared';

interface Props {
  jobId: number;
}

/** Ask Cloudinary for mp3 — see the note above about webm and iOS. */
function playableAudioUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_mp3/');
}

export default function JobAttachmentsCard({ jobId }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Same key as JobSubTasksCard, so the two cards share ONE request.
  const { data, isLoading } = useQuery({
    queryKey: ['job-sub-tasks', jobId],
    queryFn: async (): Promise<JobSubTaskList> => (await jobSubTasksApi.list(jobId)).data,
    enabled: !!jobId,
  });

  // Media with a parent belongs to ONE operation and is drawn under that
  // operation by JobOperationsCard. This card is the job's own.
  const media: JobSubTask[] = (data?.tasks ?? []).filter(
    (task) => task.attachment_kind && task.attachment_url && !task.parent_task_id,
  );
  const photos = media.filter((m) => m.attachment_kind === 'photo');
  const voices = media.filter((m) => m.attachment_kind === 'voice');

  // The player belongs to THIS card, so this card has to release it. Leaving
  // the screen with a note still playing is how you get a voice following a man
  // across the yard.
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  const stopCurrent = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPlayingUrl(null);
  }, []);

  const togglePlay = useCallback(async (rawUrl: string) => {
    // Tapping the one that is playing stops it.
    if (playingUrl === rawUrl) {
      await stopCurrent();
      return;
    }
    // Starting a second note stops the first — two voices at once on a yard is
    // no use to anybody.
    await stopCurrent();

    setLoadingUrl(rawUrl);
    try {
      // A phone on silent is the normal state for a man on a noisy yard, and
      // without this iOS plays nothing and reports no error.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: playableAudioUrl(rawUrl) },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setPlayingUrl(rawUrl);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          setPlayingUrl(null);
        }
      });
    } catch (err) {
      console.warn('Could not play the voice note', err);
      setPlayingUrl(null);
    } finally {
      setLoadingUrl(null);
    }
  }, [playingUrl, stopCurrent]);

  // No card at all when the planner attached nothing — the same rule
  // JobSubTasksCard follows. An empty box on a small screen is just noise.
  if (isLoading || media.length === 0) return null;

  const screenWidth = Dimensions.get('window').width;

  return (
    <View style={styles.card}>
      <View style={[styles.titleRow, isAr && styles.rowRtl]}>
        <Text style={[styles.cardTitle, isAr && styles.textRtl]}>
          {t('job_attachments.title', 'Photos & voice notes')}
        </Text>
        <View style={styles.countChip}>
          <Text style={styles.countText}>{media.length}</Text>
        </View>
      </View>

      <Text style={[styles.hint, isAr && styles.textRtl]}>
        {t('job_attachments.hint', 'Added by the planner to make the job clearer')}
      </Text>

      {photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photoStrip}
          contentContainerStyle={styles.photoStripContent}
        >
          {photos.map((photo) => (
            <TouchableOpacity
              key={photo.id}
              testID={`job-attachment-photo-${photo.id}`}
              activeOpacity={0.8}
              onPress={() => setOpenPhoto(photo.attachment_url!)}
            >
              <Image source={{ uri: photo.attachment_url! }} style={styles.thumb} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {voices.map((voice) => {
        const url = voice.attachment_url!;
        const isThisPlaying = playingUrl === url;
        const isThisLoading = loadingUrl === url;
        return (
          <TouchableOpacity
            key={voice.id}
            testID={`job-attachment-voice-${voice.id}`}
            activeOpacity={0.7}
            onPress={() => togglePlay(url)}
            style={[styles.voiceRow, isAr && styles.rowRtl]}
          >
            <View style={[styles.playCircle, isThisPlaying && styles.playCircleActive]}>
              {isThisLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.playIcon}>{isThisPlaying ? '■' : '▶'}</Text>
              )}
            </View>
            <Text style={[styles.voiceLabel, isAr && styles.textRtl]}>
              {isThisPlaying
                ? t('job_attachments.playing', 'Playing — tap to stop')
                : t('job_attachments.play', 'Voice note from the planner')}
            </Text>
          </TouchableOpacity>
        );
      })}

      <Modal visible={!!openPhoto} transparent animationType="fade"
             onRequestClose={() => setOpenPhoto(null)}>
        <TouchableOpacity
          style={styles.viewerBackdrop}
          activeOpacity={1}
          onPress={() => setOpenPhoto(null)}
        >
          {openPhoto && (
            <Image
              source={{ uri: openPhoto }}
              style={{ width: screenWidth, height: '80%' }}
              resizeMode="contain"
            />
          )}
          <Text style={styles.viewerHint}>
            {t('common.tap_to_close', 'Tap anywhere to close')}
          </Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowRtl: { flexDirection: 'row-reverse' },
  textRtl: { textAlign: 'right', writingDirection: 'rtl' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#212121' },
  countChip: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, backgroundColor: '#E3F2FD',
  },
  countText: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  hint: { fontSize: 11, color: '#9E9E9E', marginTop: 2, marginBottom: 8 },
  photoStrip: { marginBottom: 4 },
  photoStripContent: { gap: 8, paddingVertical: 2 },
  thumb: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#EEE' },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
    marginTop: 4,
  },
  playCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1976D2',
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 8,
  },
  playCircleActive: { backgroundColor: '#C62828' },
  playIcon: { color: '#fff', fontSize: 14, fontWeight: '900' },
  voiceLabel: { flex: 1, fontSize: 13, color: '#424242' },
  viewerBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerHint: { color: '#BDBDBD', fontSize: 12, marginTop: 12 },
});
