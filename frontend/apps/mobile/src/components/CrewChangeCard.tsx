/**
 * A job's supervisor asks to change who is on it — from his phone.
 *
 * Ali, 2026-09-23: "how the supervisor can change the employee already assigned
 * to a job" — and then "this need the admin or the planner approval". So this
 * card only ASKS. Any engineer or admin decides in the Approvals inbox on the
 * web; nothing on the job changes until one of them says yes.
 *
 * Shown only when the server says `can_request_crew_change` — the job's own
 * supervisor who is not a planner. The rule lives on the server in one place.
 *
 * A man on leave on the JOB's day is listed but cannot be picked: the server
 * would refuse him, and offering a choice that is then refused is the bug that
 * cost a morning on the inspection assignment page.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlansApi } from '@inspection/shared';
import type { CrewChangeRequest } from '@inspection/shared';

interface Props {
  jobId: number;
}

const STATUS_COLOR: Record<CrewChangeRequest['status'], string> = {
  pending: '#1677ff',
  approved: '#52c41a',
  rejected: '#ff4d4f',
  cancelled: '#8c8c8c',
};

export default function CrewChangeCard({ jobId }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [addId, setAddId] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const history = useQuery({
    queryKey: ['crew-change-requests', jobId],
    queryFn: () => workPlansApi.listCrewChangeRequests(jobId).then((r) => r.data.data || []),
  });
  const options = useQuery({
    queryKey: ['crew-change-options', jobId],
    queryFn: () => workPlansApi.getCrewChangeOptions(jobId).then((r) => r.data.data),
    enabled: open,
  });

  const errorText = (err: any) =>
    err?.response?.data?.message || err?.response?.data?.error || t('crew_change.failed', 'Could not send the request');

  const reset = () => { setRemoveId(null); setAddId(null); setReason(''); };
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crew-change-requests', jobId] });
    queryClient.invalidateQueries({ queryKey: ['crew-change-options', jobId] });
  };

  const send = useMutation({
    mutationFn: () => workPlansApi.requestCrewChange(jobId, {
      remove_user_id: removeId,
      add_user_id: addId,
      reason: reason.trim() || undefined,
    }),
    onSuccess: () => {
      reset();
      setOpen(false);
      refresh();
      Alert.alert(t('crew_change.sent', 'Sent to the planners for approval'));
    },
    onError: (err) => Alert.alert(t('crew_change.failed', 'Could not send the request'), errorText(err)),
  });

  const withdraw = useMutation({
    mutationFn: (id: number) => workPlansApi.withdrawCrewChangeRequest(id),
    onSuccess: refresh,
    onError: (err) => Alert.alert(errorText(err)),
  });

  const statusLabel = (r: CrewChangeRequest) =>
    r.status === 'cancelled' && r.review_notes === 'job_started'
      ? t('crew_change.status_started', 'Cancelled — the job started')
      : t(`crew_change.status_${r.status}`, r.status);

  const started = !!options.data?.started;
  const align = { textAlign: (isAr ? 'right' : 'left') as 'right' | 'left' };
  const requests = history.data || [];

  return (
    <View style={styles.card} testID="crew-change-card">
      <Text style={[styles.title, align]}>{t('crew_change.title', 'Ask to change the crew')}</Text>

      {requests.slice(0, 5).map((r) => (
        <View key={r.id} style={[styles.reqRow, isAr && styles.rowRtl]}>
          <View style={{ flex: 1 }}>
            {!!r.remove_user && (
              <Text style={[styles.off, align]}>− {r.remove_user.name}</Text>
            )}
            {!!r.add_user && (
              <Text style={[styles.on, align]}>+ {r.add_user.name}</Text>
            )}
            <Text style={[styles.status, { color: STATUS_COLOR[r.status] }, align]}>
              {statusLabel(r)}
            </Text>
          </View>
          {r.status === 'pending' && (
            <TouchableOpacity onPress={() => withdraw.mutate(r.id)} disabled={withdraw.isPending}>
              <Text style={styles.withdraw}>{t('crew_change.withdraw', 'Withdraw')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <TouchableOpacity
        testID="crew-change-open"
        style={styles.button}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>👥 {t('crew_change.button', 'Ask to change crew')}</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => { reset(); setOpen(false); }}>
        <View style={styles.modal}>
          <Text style={[styles.modalTitle, align]}>{t('crew_change.title', 'Ask to change the crew')}</Text>

          {options.isLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} />
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={[started ? styles.warn : styles.info, align]}>
                {started
                  ? t('crew_change.started', 'This job has started. Its crew can no longer change.')
                  : t('crew_change.explain', 'Nothing changes until an engineer or admin approves.')}
              </Text>

              <Text style={[styles.section, align]}>{t('crew_change.take_off', 'Take off')}</Text>
              {(options.data?.team || []).map((m) => {
                const picked = removeId === m.user_id;
                return (
                  <TouchableOpacity
                    key={m.user_id}
                    disabled={started}
                    onPress={() => setRemoveId(picked ? null : m.user_id)}
                    style={[styles.choice, picked && styles.choiceOff]}
                  >
                    <Text style={[styles.choiceText, align]}>
                      {picked ? '✓ ' : ''}{m.name}{m.is_lead ? ` ★ ${t('crew_change.lead', 'Lead')}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.section, align]}>{t('crew_change.put_on', 'Put on')}</Text>
              {(options.data?.candidates || []).map((c) => {
                const picked = addId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    disabled={started || c.on_leave}
                    onPress={() => setAddId(picked ? null : c.id)}
                    style={[styles.choice, picked && styles.choiceOn, c.on_leave && styles.choiceDisabled]}
                  >
                    <Text style={[styles.choiceText, c.on_leave && styles.choiceTextDisabled, align]}>
                      {picked ? '✓ ' : ''}{c.on_leave ? '🔴 ' : ''}{c.name}
                      {c.on_leave ? ` — ${t('common.on_leave', 'On Leave')}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TextInput
                style={[styles.input, align]}
                value={reason}
                onChangeText={setReason}
                maxLength={500}
                multiline
                editable={!started}
                placeholder={t('crew_change.reason', 'Why? (optional — the planner reads this)')}
              />
            </ScrollView>
          )}

          <View style={[styles.footer, isAr && styles.rowRtl]}>
            <TouchableOpacity style={styles.cancel} onPress={() => { reset(); setOpen(false); }}>
              <Text style={styles.cancelText}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="crew-change-send"
              style={[styles.send, (started || (!removeId && !addId)) && styles.sendDisabled]}
              disabled={started || (!removeId && !addId) || send.isPending}
              onPress={() => send.mutate()}
            >
              {send.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.sendText}>{t('crew_change.send', 'Send for approval')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: '#722ed1' },
  title: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  reqRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0', gap: 8 },
  rowRtl: { flexDirection: 'row-reverse' },
  off: { fontSize: 13, color: '#cf1322' },
  on: { fontSize: 13, color: '#389e0d' },
  status: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  withdraw: { color: '#ff4d4f', fontSize: 13, fontWeight: '600' },
  button: { marginTop: 10, backgroundColor: '#722ed1', paddingVertical: 11, borderRadius: 8,
    alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  modal: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 48, paddingHorizontal: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  info: { backgroundColor: '#e6f4ff', color: '#0958d9', padding: 10, borderRadius: 8, fontSize: 13 },
  warn: { backgroundColor: '#fff7e6', color: '#d46b08', padding: 10, borderRadius: 8, fontSize: 13 },
  section: { fontSize: 13, fontWeight: '700', color: '#595959', marginTop: 16, marginBottom: 6 },
  choice: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 6,
    borderWidth: 1, borderColor: '#e8e8e8' },
  choiceOff: { borderColor: '#ff4d4f', backgroundColor: '#fff1f0' },
  choiceOn: { borderColor: '#52c41a', backgroundColor: '#f6ffed' },
  choiceDisabled: { backgroundColor: '#fafafa' },
  choiceText: { fontSize: 15, color: '#1a1a1a' },
  choiceTextDisabled: { color: '#bfbfbf' },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e8e8e8',
    padding: 10, minHeight: 60, marginTop: 16, fontSize: 14 },
  footer: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  cancel: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9d9d9' },
  cancelText: { fontSize: 15, color: '#595959', fontWeight: '600' },
  send: { flex: 2, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#722ed1' },
  sendDisabled: { backgroundColor: '#d3adf7' },
  sendText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
