/**
 * The operations inside an order, one timer each, on the worker's phone.
 *
 * Ali, 2026-09-10: "inside a general refurbishment order you can check the
 * spreader, replace or repair harness, open telescopic chain, and many jobs ...
 * user should see the operations inside the order and he can deal with each same
 * as he deal with the order i mean a order with many operations he should do
 * 1 by 1".
 *
 * Ali, 2026-09-11, choosing start/stop per operation over a simple tick, and a
 * split by work centre.
 *
 * WHERE THESE COME FROM
 * =====================
 *
 * SAP's IW49 export, which the app has ALWAYS read — `parse_operation_hours`
 * summed the hours per order and threw every individual row away, 56,131 rows a
 * run. They now land in the same list that already holds Ali's hand-written
 * notes, told apart by `source`.
 *
 * WHY THE TRADE FILTER IS A TOGGLE AND NOT A HARD RULE
 * ===================================================
 *
 * An order can hold MECH and ELEC operations. A mechanic opening it should see
 * HIS lines first, not scroll past an electrician's. But hiding the rest
 * outright is worse: he then cannot see why the machine is not finished, and a
 * missing line reads as lost data. So the other trade is folded away behind a
 * count he can tap.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
  Image, ScrollView, Modal, Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { jobSubTasksApi } from '@inspection/shared';
import type { JobSubTask, JobSubTaskList, OperationAction } from '@inspection/shared';

interface Props {
  jobId: number;
  /** The trade this man works. His lines come first; the rest fold away. */
  workCenter?: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#9E9E9E',
  in_progress: '#1976D2',
  paused: '#F57C00',
  completed: '#2E7D32',
  removed_in_sap: '#C62828',
};

export default function JobOperationsCard({ jobId, workCenter }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const queryClient = useQueryClient();
  const queryKey = ['job-sub-tasks', jobId];
  const [showOtherTrade, setShowOtherTrade] = useState(false);
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // This card owns its player, so this card releases it. The screen's cleanup
  // does not reach a sound created here.
  useEffect(() => () => {
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
  }, []);

  const playVoice = useCallback(async (rawUrl: string) => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
      if (playingUrl === rawUrl) { setPlayingUrl(null); return; }
    }
    try {
      // A phone on silent is normal on a yard; without this iOS plays nothing
      // and reports no error. And Chrome records webm, which iOS cannot play at
      // all — Cloudinary re-encodes when the URL asks for mp3.
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false,
                                      playsInSilentModeIOS: true });
      const uri = rawUrl.includes('cloudinary.com')
        ? rawUrl.replace('/upload/', '/upload/f_mp3/')
        : rawUrl;
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
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
      console.warn('Could not play the operation voice note', err);
      setPlayingUrl(null);
    }
  }, [playingUrl]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<JobSubTaskList> => (await jobSubTasksApi.list(jobId)).data,
    enabled: !!jobId,
  });

  const timer = useMutation({
    mutationFn: ({ taskId, action }: { taskId: number; action: OperationAction }) =>
      jobSubTasksApi.timer(jobId, taskId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['my-work-plan'] });
      queryClient.invalidateQueries({ queryKey: ['job-details', jobId] });
    },
    onError: (err: any) =>
      Alert.alert(
        t('job_operations.failed', 'Could not update'),
        err?.response?.data?.message || '',
      ),
  });

  const all: JobSubTask[] = data?.tasks ?? [];
  const operations: JobSubTask[] = useMemo(
    () => all.filter((task) => !!task.operation_number),
    [all],
  );

  /** Media the planner hung on ONE operation, not on the whole job. */
  const mediaFor = useCallback(
    (operationId: number) =>
      all.filter((task) => task.parent_task_id === operationId && task.attachment_url),
    [all],
  );

  /**
   * His lines: his own trade, plus the ones that belong to nobody in particular.
   *
   * SUPV is SUPERVISION, not a trade — Ali, 2026-09-12: "supv is supervision,
   * yes shown to everyone". It is the LARGEST group in the real data (685 of
   * 1,560 operations), so hiding it from either crew would hide most of the
   * yard's lines from somebody.
   *
   * ELME means the line needs both trades, so it is every man's business.
   *
   * The values arrive already translated — SAP writes MES-MECH and the import
   * turns it into MECH. Before that translation existed, this comparison matched
   * NOTHING and every operation folded into "for the other trade": a mechanic
   * opened a job and saw his own work presented as somebody else's.
   */
  const mine = useMemo(() => {
    if (!workCenter) return operations;
    return operations.filter((op) => {
      const trade = op.work_center;
      if (!trade || trade === 'SUPV' || trade === 'ELME') return true;
      return trade === workCenter || workCenter === 'ELME';
    });
  }, [operations, workCenter]);
  const others = operations.filter((op) => !mine.includes(op));

  const act = useCallback((task: JobSubTask, action: OperationAction) => {
    if (timer.isPending) return;
    timer.mutate({ taskId: task.id, action });
  }, [timer]);

  // No card when this order has no operations — most orders will not, until a
  // sync with a recognised IW49 layout has run.
  if (isLoading || operations.length === 0) return null;

  const progress = data?.operations_progress;

  const renderRow = (op: JobSubTask, dimmed = false) => {
    const status = op.status || (op.is_done ? 'completed' : 'pending');
    const color = STATUS_COLOR[status] || '#9E9E9E';
    const running = status === 'in_progress';
    const paused = status === 'paused';
    const done = status === 'completed';

    return (
      <View key={op.id} style={[styles.opRow, dimmed && styles.opRowDim]}>
        <View style={[styles.opHead, isAr && styles.rowRtl]}>
          <Text style={[styles.opNumber, { color }]}>{op.operation_number}</Text>
          <Text style={[styles.opText, done && styles.opTextDone, isAr && styles.textRtl]}>
            {op.content}
          </Text>
        </View>

        <View style={[styles.opMeta, isAr && styles.rowRtl]}>
          {!!op.work_center && (
            <View style={styles.tradeChip}>
              <Text style={styles.tradeChipText}>{op.work_center}</Text>
            </View>
          )}
          {op.planned_hours != null && (
            <Text style={styles.metaText}>{op.planned_hours.toFixed(1)}h</Text>
          )}
          {op.actual_hours != null && (
            <Text style={[styles.metaText, styles.actualText]}>
              {t('job_operations.actual', 'took')} {op.actual_hours.toFixed(1)}h
            </Text>
          )}
          {status === 'removed_in_sap' && (
            <Text style={styles.removedText}>
              {t('job_operations.removed_in_sap', 'no longer in SAP')}
            </Text>
          )}
        </View>

        {/* Waiting on a part. SAP puts the requisition on the OPERATION, so the
            man is told WHICH line is blocked instead of reading (PR) off the
            order and guessing which half of the job he can start today.
            'PR' is deliberately not translated — Ali, 2026-09-11. */}
        {!!op.waiting_on_material && !done && (
          <View style={[styles.waitingRow, isAr && styles.rowRtl]}>
            <Text style={styles.waitingText}>
              {t('job_operations.waiting_material', 'Waiting for material')}
              {' · PR '}{op.purchase_requisition}
              {op.material_text ? ` · ${op.material_text}` : ''}
            </Text>
          </View>
        )}

        {/* What this operation looks like, or what the planner said about it.
            Hung on the LINE, so a photo of the cracked glass on 0020 stays
            attached to 0020 instead of floating in the job's pile. */}
        {mediaFor(op.id).length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.opMediaStrip}
            contentContainerStyle={styles.opMediaContent}
          >
            {mediaFor(op.id).map((item) => (
              item.attachment_kind === 'photo' ? (
                <TouchableOpacity
                  key={item.id}
                  testID={`operation-photo-${item.id}`}
                  activeOpacity={0.8}
                  onPress={() => setOpenPhoto(item.attachment_url!)}
                >
                  <Image source={{ uri: item.attachment_url! }} style={styles.opThumb} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={item.id}
                  testID={`operation-voice-${item.id}`}
                  activeOpacity={0.7}
                  onPress={() => playVoice(item.attachment_url!)}
                  style={styles.opVoiceChip}
                >
                  <Text style={styles.opVoiceText}>
                    {playingUrl === item.attachment_url ? '■' : '▶'}{' '}
                    {t('job_operations.voice', 'voice note')}
                  </Text>
                </TouchableOpacity>
              )
            ))}
          </ScrollView>
        )}

        {!dimmed && !done && (
          <View style={[styles.opActions, isAr && styles.rowRtl]}>
            {!running && !paused && (
              <TouchableOpacity
                testID={`operation-start-${op.id}`}
                style={[styles.btn, styles.btnStart]}
                onPress={() => act(op, 'start')}
              >
                <Text style={styles.btnText}>{t('job_operations.start', 'Start')}</Text>
              </TouchableOpacity>
            )}
            {running && (
              <TouchableOpacity
                style={[styles.btn, styles.btnPause]}
                onPress={() => act(op, 'pause')}
              >
                <Text style={styles.btnText}>{t('job_operations.pause', 'Pause')}</Text>
              </TouchableOpacity>
            )}
            {paused && (
              <TouchableOpacity
                style={[styles.btn, styles.btnStart]}
                onPress={() => act(op, 'resume')}
              >
                <Text style={styles.btnText}>{t('job_operations.resume', 'Resume')}</Text>
              </TouchableOpacity>
            )}
            {(running || paused) && (
              <TouchableOpacity
                testID={`operation-finish-${op.id}`}
                style={[styles.btn, styles.btnFinish]}
                onPress={() => act(op, 'finish')}
              >
                <Text style={styles.btnText}>{t('job_operations.finish', 'Finish')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {done && !!op.done_by_name && (
          <Text style={[styles.doneBy, isAr && styles.textRtl]}>
            {t('job_operations.done_by', 'done by {{name}}', { name: op.done_by_name })}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={[styles.titleRow, isAr && styles.rowRtl]}>
        <Text style={[styles.cardTitle, isAr && styles.textRtl]}>
          {t('job_operations.title', 'Operations in this order')}
        </Text>
        {!!progress && (
          <View style={[styles.progressChip, progress.all_done && styles.progressChipDone]}>
            <Text style={[styles.progressText, progress.all_done && styles.progressTextDone]}>
              {progress.done}/{progress.total}
            </Text>
          </View>
        )}
      </View>

      {!!progress && (
        <Text style={[styles.hint, isAr && styles.textRtl]}>
          {t('job_operations.remaining', '{{h}}h left of {{total}}h', {
            h: progress.remaining_hours.toFixed(1),
            total: progress.planned_hours.toFixed(1),
          })}
        </Text>
      )}

      {mine.map((op) => renderRow(op))}

      {others.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.otherToggle}
            onPress={() => setShowOtherTrade((v) => !v)}
          >
            <Text style={styles.otherToggleText}>
              {showOtherTrade
                ? t('job_operations.hide_other', 'Hide the other trade')
                : t('job_operations.show_other', '{{n}} for the other trade', { n: others.length })}
            </Text>
          </TouchableOpacity>
          {showOtherTrade && others.map((op) => renderRow(op, true))}
        </>
      )}

      {timer.isPending && (
        <ActivityIndicator size="small" color="#1976D2" style={styles.spinner} />
      )}

      <Modal visible={!!openPhoto} transparent animationType="fade"
             onRequestClose={() => setOpenPhoto(null)}>
        <TouchableOpacity style={styles.viewerBackdrop} activeOpacity={1}
                          onPress={() => setOpenPhoto(null)}>
          {openPhoto && (
            <Image source={{ uri: openPhoto }}
                   style={{ width: Dimensions.get('window').width, height: '80%' }}
                   resizeMode="contain" />
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
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  rowRtl: { flexDirection: 'row-reverse' },
  textRtl: { textAlign: 'right', writingDirection: 'rtl' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#212121' },
  progressChip: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
    backgroundColor: '#E3F2FD',
  },
  progressChipDone: { backgroundColor: '#E8F5E9' },
  progressText: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  progressTextDone: { color: '#2E7D32' },
  hint: { fontSize: 11, color: '#9E9E9E', marginTop: 2, marginBottom: 8 },
  opRow: { borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingVertical: 8 },
  opRowDim: { opacity: 0.55 },
  opHead: { flexDirection: 'row', alignItems: 'flex-start' },
  opNumber: { fontSize: 12, fontWeight: '800', width: 42 },
  opText: { flex: 1, fontSize: 14, color: '#212121', lineHeight: 20 },
  opTextDone: { color: '#9E9E9E', textDecorationLine: 'line-through' },
  opMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, marginLeft: 42 },
  tradeChip: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
    backgroundColor: '#ECEFF1',
  },
  tradeChipText: { fontSize: 10, fontWeight: '700', color: '#546E7A' },
  metaText: { fontSize: 11, color: '#9E9E9E' },
  actualText: { color: '#2E7D32', fontWeight: '600' },
  removedText: { fontSize: 10, color: '#C62828', fontWeight: '700' },
  waitingRow: {
    marginTop: 4, marginLeft: 42, paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: '#FFF8E1', borderRadius: 4,
  },
  waitingText: { fontSize: 11, color: '#E65100', fontWeight: '600' },
  opMediaStrip: { marginTop: 6, marginLeft: 42 },
  opMediaContent: { gap: 6 },
  opThumb: { width: 64, height: 64, borderRadius: 6, backgroundColor: '#EEE' },
  opVoiceChip: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6,
    backgroundColor: '#E3F2FD', justifyContent: 'center',
  },
  opVoiceText: { fontSize: 11, color: '#1565C0', fontWeight: '700' },
  opActions: { flexDirection: 'row', gap: 8, marginTop: 8, marginLeft: 42 },
  btn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6 },
  btnStart: { backgroundColor: '#1976D2' },
  btnPause: { backgroundColor: '#F57C00' },
  btnFinish: { backgroundColor: '#2E7D32' },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  doneBy: { fontSize: 11, color: '#9E9E9E', marginTop: 4, marginLeft: 42 },
  otherToggle: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  otherToggleText: { fontSize: 12, color: '#1565C0', fontWeight: '600' },
  spinner: { marginTop: 8 },
  viewerBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerHint: { color: '#BDBDBD', fontSize: 12, marginTop: 12 },
});
