/**
 * 📷 Photo / 🎤 Voice on a planned job — from the phone.
 *
 * Ali, 2026-09-23 said a job's supervisor may "add a photo or voice note", and
 * the server has allowed it since (`_may_attach`: the assigned team, planners,
 * and the job's supervisor). The phone never had a button — JobAttachmentsCard
 * only SHOWS what the planner added. Found 2026-09-24 and fixed here.
 *
 * Shown only when the server says `can_attach`, so the rule stays in one place.
 *
 * Two steps, the same as the web board's JobAttachments: upload the file, then
 * hang it on the job. The server checks the file is one THIS user uploaded and
 * that it really is a photo / a sound before it will publish it onto a job the
 * whole crew reads.
 *
 * Voice is recorded with expo-av's HIGH_QUALITY preset, which writes .m4a on
 * both platforms — an extension the server accepts and every phone can play.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getApiClient, jobSubTasksApi } from '@inspection/shared';
import { tokenStorage } from '../storage/token-storage';

interface Props {
  jobId: number;
}

// A voice note is a few sentences at the machine, not a meeting.
const MAX_SECONDS = 120;

export default function JobEvidenceButtons({ jobId }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<null | 'photo' | 'voice'>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [seconds, setSeconds] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  // The live recording, for the unmount cleanup only. Keyed on [] so it runs
  // when the screen goes away — not every time a recording stops, which would
  // race stopAndSend's own stop.
  const live = useRef<Audio.Recording | null>(null);
  useEffect(() => { live.current = recording; }, [recording]);

  // Never leave the microphone open when the screen goes away.
  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    live.current?.stopAndUnloadAsync().catch(() => undefined);
  }, []);

  const fail = useCallback(() => {
    Alert.alert(t('common.error', 'Error'),
      t('job_evidence.failed', 'Could not add it. Check the connection and try again.'));
  }, [t]);

  /** Upload, then hang it on the job. Throws on any failure. */
  const attach = useCallback(async (uri: string, kind: 'photo' | 'voice') => {
    const token = await tokenStorage.getAccessToken();
    const baseUrl = getApiClient().defaults.baseURL;
    const result = await FileSystem.uploadAsync(`${baseUrl}/api/files/upload`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: kind === 'photo' ? 'image/jpeg' : 'audio/m4a',
      parameters: { related_type: 'work_plan_job', related_id: String(jobId), category: 'work_plan' },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`upload ${result.status}`);
    }
    const fileId = JSON.parse(result.body)?.data?.id;
    if (!fileId) throw new Error('upload returned no file');
    await jobSubTasksApi.add(jobId, '', { fileId, kind });
    queryClient.invalidateQueries({ queryKey: ['job-sub-tasks', jobId] });
    queryClient.invalidateQueries({ queryKey: ['my-work-plan'] });
  }, [jobId, queryClient]);

  const takePhoto = useCallback(async (fromGallery: boolean) => {
    const perm = fromGallery
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('job_evidence.no_permission', 'Permission is needed to add a photo'));
      return;
    }
    const picked = fromGallery
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (picked.canceled || !picked.assets?.[0]) return;

    setBusy('photo');
    try {
      await attach(picked.assets[0].uri, 'photo');
    } catch {
      fail();
    } finally {
      setBusy(null);
    }
  }, [attach, fail, t]);

  const askPhoto = useCallback(() => {
    Alert.alert(t('job_evidence.photo', 'Photo'), undefined, [
      { text: t('job_evidence.camera', 'Take photo'), onPress: () => takePhoto(false) },
      { text: t('job_evidence.gallery', 'From gallery'), onPress: () => takePhoto(true) },
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
    ]);
  }, [takePhoto, t]);

  const stopAndSend = useCallback(async (rec: Audio.Recording) => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    live.current = null;
    setRecording(null);
    setBusy('voice');
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = rec.getURI();
      if (!uri) throw new Error('no recording');
      await attach(uri, 'voice');
    } catch {
      fail();
    } finally {
      setBusy(null);
      setSeconds(0);
    }
  }, [attach, fail]);

  const toggleVoice = useCallback(async () => {
    if (recording) {
      await stopAndSend(recording);
      return;
    }
    const perm = await Audio.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('job_evidence.no_mic', 'Microphone permission is needed'));
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setSeconds(0);
      tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      fail();
    }
  }, [recording, stopAndSend, fail, t]);

  // The cap, checked outside the state updater: an updater must stay pure, and
  // calling stopAndSend from inside one could send the note twice.
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stopAndSend(recording);
  }, [recording, seconds, stopAndSend]);

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <View style={styles.card} testID="job-evidence">
      <Text style={[styles.title, isAr && styles.textRtl]}>
        {t('job_evidence.title', 'Add what you see')}
      </Text>
      <View style={[styles.row, isAr && styles.rowRtl]}>
        <TouchableOpacity
          testID="job-evidence-photo"
          style={[styles.btn, styles.photo]}
          disabled={!!busy || !!recording}
          onPress={askPhoto}
        >
          {busy === 'photo'
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>📷 {t('job_evidence.photo', 'Photo')}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          testID="job-evidence-voice"
          style={[styles.btn, recording ? styles.recording : styles.voice]}
          disabled={busy !== null}
          onPress={toggleVoice}
        >
          {busy === 'voice'
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>
                {recording
                  ? `⏹ ${t('job_evidence.stop_send', 'Stop & send')} ${mmss}`
                  : `🎤 ${t('job_evidence.voice', 'Voice')}`}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  textRtl: { textAlign: 'right', writingDirection: 'rtl' },
  row: { flexDirection: 'row', gap: 10 },
  rowRtl: { flexDirection: 'row-reverse' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  photo: { backgroundColor: '#1677ff' },
  voice: { backgroundColor: '#722ed1' },
  recording: { backgroundColor: '#cf1322' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
