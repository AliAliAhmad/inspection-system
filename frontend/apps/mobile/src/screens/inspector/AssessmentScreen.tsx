import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import VoiceTextInput from '../../components/VoiceTextInput';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import {
  assessmentsApi,
  FinalAssessment,
  Verdict,
} from '@inspection/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'Assessment'>;

const VERDICT_CONFIG = {
  operational: { emoji: '✅', color: '#4CAF50', bgColor: '#E8F5E9', borderColor: '#C8E6C9' },
  monitor: { emoji: '⚠️', color: '#FF9800', bgColor: '#FFF3E0', borderColor: '#FFE0B2' },
  stop: { emoji: '🛑', color: '#F44336', bgColor: '#FFEBEE', borderColor: '#FFCDD2' },
};

export default function AssessmentScreen() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id } = route.params;

  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | null>(null);
  const [monitorReason, setMonitorReason] = useState('');
  const [stopReason, setStopReason] = useState('');

  const {
    data: assessment,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['assessment', id],
    queryFn: async () => {
      try {
        const res = await assessmentsApi.get(id);
        return res.data.data ?? res.data;
      } catch {
        const createRes = await assessmentsApi.create(id);
        return createRes.data.data ?? createRes.data;
      }
    },
  });

  // Pre-select system verdict when data loads
  useEffect(() => {
    if (assessment && (assessment as FinalAssessment).system_verdict && !selectedVerdict) {
      const data = assessment as FinalAssessment;
      const isMech = user?.id === data.mechanical_inspector_id;
      const isElec = user?.id === data.electrical_inspector_id;
      const userVerdictAlready = isMech ? data.mech_verdict : isElec ? data.elec_verdict : null;
      if (!userVerdictAlready && data.system_verdict) {
        setSelectedVerdict(data.system_verdict);
      }
    }
  }, [assessment, user?.id, selectedVerdict]);

  const verdictMutation = useMutation({
    mutationFn: (payload: { verdict: Verdict; monitor_reason?: string; stop_reason?: string }) =>
      assessmentsApi.submitVerdict((assessment as FinalAssessment).id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', id] });
      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
      Alert.alert(
        isAr ? 'تم' : 'Success',
        isAr ? 'تم إرسال تقييمك بنجاح' : 'Your verdict has been submitted successfully'
      );
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Error';
      Alert.alert(t('common.error'), msg);
    },
  });

  const handleSubmitVerdict = useCallback(() => {
    if (!selectedVerdict) return;

    if (selectedVerdict === 'monitor' && monitorReason.trim().length < 30) {
      Alert.alert(t('common.error'), isAr ? 'سبب المراقبة يجب أن يكون 30 حرف على الأقل' : 'Monitor reason must be at least 30 characters');
      return;
    }
    if (selectedVerdict === 'stop' && stopReason.trim().length < 50) {
      Alert.alert(t('common.error'), isAr ? 'سبب الإيقاف يجب أن يكون 50 حرف على الأقل' : 'Stop reason must be at least 50 characters');
      return;
    }

    const verdictLabels: Record<Verdict, string> = {
      operational: isAr ? 'تشغيلي' : 'Operational',
      monitor: isAr ? 'مراقبة' : 'Monitor',
      stop: isAr ? 'إيقاف' : 'Stop',
    };

    Alert.alert(
      t('common.confirm'),
      `${isAr ? 'هل تريد تقديم التقييم' : 'Submit verdict'}: "${verdictLabels[selectedVerdict]}"?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.submit'),
          onPress: () => {
            verdictMutation.mutate({
              verdict: selectedVerdict,
              monitor_reason: selectedVerdict === 'monitor' ? monitorReason.trim() : undefined,
              stop_reason: selectedVerdict === 'stop' ? stopReason.trim() : undefined,
            });
          },
        },
      ],
    );
  }, [selectedVerdict, monitorReason, stopReason, t, isAr, verdictMutation]);

  const getVerdictColor = (verdict: Verdict | string | null): string => {
    if (verdict === 'operational') return '#4CAF50';
    if (verdict === 'monitor') return '#FF9800';
    if (verdict === 'stop' || verdict === 'urgent') return '#F44336';
    return '#9E9E9E';
  };

  const getVerdictLabel = (verdict: Verdict | string | null): string => {
    if (verdict === 'operational') return isAr ? 'تشغيلي' : 'Operational';
    if (verdict === 'monitor') return isAr ? 'مراقبة' : 'Monitor';
    if (verdict === 'stop') return isAr ? 'إيقاف' : 'Stop';
    if (verdict === 'urgent') return isAr ? 'عاجل' : 'Urgent';
    return isAr ? 'معلق' : 'Pending';
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (isError || !assessment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const data = assessment as FinalAssessment;
  const isMechInspector = user?.id === data.mechanical_inspector_id;
  const isElecInspector = user?.id === data.electrical_inspector_id;
  const userVerdict = isMechInspector ? data.mech_verdict : isElecInspector ? data.elec_verdict : null;
  const hasSubmittedVerdict = userVerdict !== null;
  const otherVerdict = isMechInspector ? data.elec_verdict : data.mech_verdict;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
    >
      {/* System Recommendation Banner */}
      {data.system_verdict && (
        <View style={[styles.systemBanner, { borderLeftColor: getVerdictColor(data.system_verdict) }]}>
          <Text style={styles.systemBannerTitle}>
            🤖 {t('inspection.systemVerdict')}
          </Text>
          <Text style={styles.systemBannerDesc}>
            {t('inspection.systemVerdictLabel')}
          </Text>
          <View style={[styles.systemVerdictBadge, { backgroundColor: getVerdictColor(data.system_verdict) }]}>
            <Text style={styles.systemVerdictText}>
              {VERDICT_CONFIG[data.system_verdict]?.emoji} {getVerdictLabel(data.system_verdict)}
            </Text>
          </View>
          {data.system_urgency_score != null && (
            <Text style={styles.systemScore}>
              {isAr ? 'نقاط الخطورة' : 'Urgency Score'}: {data.system_urgency_score}
              {data.system_has_critical ? (isAr ? ' | حرج' : ' | CRITICAL') : ''}
            </Text>
          )}
        </View>
      )}

      {/* Equipment Info */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('common.details')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Assignment ID:</Text>
          <Text style={styles.infoValue}>#{data.inspection_assignment_id}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Equipment ID:</Text>
          <Text style={styles.infoValue}>#{data.equipment_id}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.status')}:</Text>
          <Text style={[styles.infoValue, { color: data.final_status ? getVerdictColor(data.final_status) : '#9E9E9E' }]}>
            {data.final_status ? getVerdictLabel(data.final_status) : getVerdictLabel(null)}
          </Text>
        </View>
        {data.finalized_at && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{isAr ? 'تم الإنهاء' : 'Finalized'}:</Text>
            <Text style={styles.infoValue}>
              {new Date(data.finalized_at).toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      {/* Verdict Trail */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>
          {t('inspection.verdictTrail')}
        </Text>

        {/* System */}
        <VerdictTrailRow
          label={isAr ? 'النظام' : 'System'}
          verdict={data.system_verdict}
          getColor={getVerdictColor}
          getLabel={getVerdictLabel}
        />

        {/* Mechanical Inspector */}
        <VerdictTrailRow
          label={isAr ? 'مفتش ميكانيكي' : 'Mechanical Inspector'}
          verdict={data.mech_verdict}
          getColor={getVerdictColor}
          getLabel={getVerdictLabel}
          isCurrentUser={isMechInspector}
        />

        {/* Electrical Inspector */}
        <VerdictTrailRow
          label={isAr ? 'مفتش كهربائي' : 'Electrical Inspector'}
          verdict={data.elec_verdict}
          getColor={getVerdictColor}
          getLabel={getVerdictLabel}
          isCurrentUser={isElecInspector}
        />

        {/* Engineer (if escalated) */}
        {(data.escalation_level === 'engineer' || data.escalation_level === 'admin' || data.engineer_verdict) && (
          <VerdictTrailRow
            label={isAr ? 'المهندس' : 'Engineer'}
            verdict={data.engineer_verdict}
            getColor={getVerdictColor}
            getLabel={getVerdictLabel}
          />
        )}

        {/* Admin (if escalated) */}
        {(data.escalation_level === 'admin' || data.resolved_by === 'admin') && (
          <VerdictTrailRow
            label={isAr ? 'المدير' : 'Admin'}
            verdict={data.final_status}
            getColor={getVerdictColor}
            getLabel={data.resolved_by === 'admin' ? getVerdictLabel : () => getVerdictLabel(null)}
          />
        )}

        {/* Escalation Status */}
        {data.escalation_level === 'engineer' && !data.engineer_verdict && (
          <View style={styles.escalationBanner}>
            <Text style={styles.escalationText}>
              ⚡ {t('inspection.engineerReviewRequired')}
            </Text>
          </View>
        )}
        {data.escalation_level === 'admin' && !data.finalized_at && (
          <View style={[styles.escalationBanner, { backgroundColor: '#FFEBEE' }]}>
            <Text style={[styles.escalationText, { color: '#C62828' }]}>
              🔴 {t('inspection.adminReviewRequired')}
            </Text>
          </View>
        )}

        {/* Final Status */}
        {data.final_status && data.finalized_at && (
          <View style={[styles.finalStatusContainer, { borderTopColor: getVerdictColor(data.final_status) }]}>
            <Text style={styles.finalStatusLabel}>
              {isAr ? 'الحالة النهائية' : 'Final Status'}:
            </Text>
            <View style={[styles.finalStatusBadge, { backgroundColor: getVerdictColor(data.final_status) }]}>
              <Text style={styles.finalStatusText}>
                {VERDICT_CONFIG[data.final_status]?.emoji || '📋'} {getVerdictLabel(data.final_status)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Resolution Info */}
      {data.resolved_by && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{isAr ? 'القرار' : 'Resolution'}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{isAr ? 'تم الحل بواسطة' : 'Resolved By'}:</Text>
            <Text style={styles.infoValue}>{data.resolved_by}</Text>
          </View>
          {data.admin_decision_notes && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{isAr ? 'ملاحظات المدير' : 'Admin Notes'}:</Text>
              <Text style={styles.infoValue}>{data.admin_decision_notes}</Text>
            </View>
          )}
          {data.engineer_notes && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{isAr ? 'ملاحظات المهندس' : 'Engineer Notes'}:</Text>
              <Text style={styles.infoValue}>{data.engineer_notes}</Text>
            </View>
          )}
        </View>
      )}

      {/* Reasons */}
      {data.monitor_reason && (
        <View style={[styles.sectionCard, { borderLeftWidth: 4, borderLeftColor: '#FF9800' }]}>
          <Text style={styles.sectionTitle}>{t('inspection.monitorReason')}</Text>
          <Text style={[styles.reasonText, { color: '#E65100' }]}>{data.monitor_reason}</Text>
        </View>
      )}
      {(data.stop_reason || data.urgent_reason) && (
        <View style={[styles.sectionCard, { borderLeftWidth: 4, borderLeftColor: '#F44336' }]}>
          <Text style={styles.sectionTitle}>{t('inspection.stopReason')}</Text>
          <Text style={[styles.reasonText, { color: '#C62828' }]}>{data.stop_reason || data.urgent_reason}</Text>
        </View>
      )}

      {/* Submit Verdict Section (3 cards) */}
      {(isMechInspector || isElecInspector) && !hasSubmittedVerdict && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {isAr ? 'تقييمك' : 'Your Verdict'}
          </Text>

          {/* Other inspector's verdict info */}
          {otherVerdict && (
            <View style={[styles.otherVerdictBanner, { borderLeftColor: getVerdictColor(otherVerdict) }]}>
              <Text style={styles.otherVerdictText}>
                {isAr ? 'المفتش الآخر اختار' : 'Other inspector selected'}: {getVerdictLabel(otherVerdict)}
              </Text>
            </View>
          )}

          <View style={styles.verdictSelection}>
            {/* Operational Card */}
            <TouchableOpacity
              style={[
                styles.verdictCard,
                { borderColor: VERDICT_CONFIG.operational.borderColor, backgroundColor: VERDICT_CONFIG.operational.bgColor },
                selectedVerdict === 'operational' && { borderColor: VERDICT_CONFIG.operational.color, backgroundColor: VERDICT_CONFIG.operational.color },
              ]}
              onPress={() => setSelectedVerdict('operational')}
              activeOpacity={0.7}
            >
              <Text style={styles.verdictEmoji}>✅</Text>
              <Text style={[styles.verdictCardTitle, selectedVerdict === 'operational' && styles.verdictCardTitleSelected]}>
                {t('inspection.verdictOperational')}
              </Text>
              <Text style={[styles.verdictCardDesc, selectedVerdict === 'operational' && styles.verdictCardDescSelected]}>
                {t('inspection.verdictOperationalDesc')}
              </Text>
              {data.system_verdict === 'operational' && (
                <View style={styles.systemRecBadge}>
                  <Text style={styles.systemRecText}>🤖 {isAr ? 'موصى' : 'Recommended'}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Monitor Card */}
            <TouchableOpacity
              style={[
                styles.verdictCard,
                { borderColor: VERDICT_CONFIG.monitor.borderColor, backgroundColor: VERDICT_CONFIG.monitor.bgColor },
                selectedVerdict === 'monitor' && { borderColor: VERDICT_CONFIG.monitor.color, backgroundColor: VERDICT_CONFIG.monitor.color },
              ]}
              onPress={() => setSelectedVerdict('monitor')}
              activeOpacity={0.7}
            >
              <Text style={styles.verdictEmoji}>⚠️</Text>
              <Text style={[styles.verdictCardTitle, selectedVerdict === 'monitor' && styles.verdictCardTitleSelected]}>
                {t('inspection.verdictMonitor')}
              </Text>
              <Text style={[styles.verdictCardDesc, selectedVerdict === 'monitor' && styles.verdictCardDescSelected]}>
                {t('inspection.verdictMonitorDesc')}
              </Text>
              {data.system_verdict === 'monitor' && (
                <View style={styles.systemRecBadge}>
                  <Text style={styles.systemRecText}>🤖 {isAr ? 'موصى' : 'Recommended'}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Stop Card */}
            <TouchableOpacity
              style={[
                styles.verdictCard,
                { borderColor: VERDICT_CONFIG.stop.borderColor, backgroundColor: VERDICT_CONFIG.stop.bgColor },
                selectedVerdict === 'stop' && { borderColor: VERDICT_CONFIG.stop.color, backgroundColor: VERDICT_CONFIG.stop.color },
              ]}
              onPress={() => setSelectedVerdict('stop')}
              activeOpacity={0.7}
            >
              <Text style={styles.verdictEmoji}>🛑</Text>
              <Text style={[styles.verdictCardTitle, selectedVerdict === 'stop' && styles.verdictCardTitleSelected]}>
                {t('inspection.verdictStop')}
              </Text>
              <Text style={[styles.verdictCardDesc, selectedVerdict === 'stop' && styles.verdictCardDescSelected]}>
                {t('inspection.verdictStopDesc')}
              </Text>
              {data.system_verdict === 'stop' && (
                <View style={styles.systemRecBadge}>
                  <Text style={styles.systemRecText}>🤖 {isAr ? 'موصى' : 'Recommended'}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Monitor Reason Input */}
          {selectedVerdict === 'monitor' && (
            <VoiceTextInput
              style={styles.reasonInput}
              value={monitorReason}
              onChangeText={setMonitorReason}
              placeholder={t('inspection.monitorReasonPlaceholder')}
              multiline
              numberOfLines={3}
            />
          )}

          {/* Stop Reason Input */}
          {selectedVerdict === 'stop' && (
            <VoiceTextInput
              style={[styles.reasonInput, { borderColor: '#FFCDD2', backgroundColor: '#FFF5F5' }]}
              value={stopReason}
              onChangeText={setStopReason}
              placeholder={t('inspection.stopReasonPlaceholder')}
              multiline
              numberOfLines={3}
            />
          )}

          <TouchableOpacity
            style={[
              styles.submitButton,
              selectedVerdict && { backgroundColor: getVerdictColor(selectedVerdict) },
              (!selectedVerdict || verdictMutation.isPending) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmitVerdict}
            disabled={!selectedVerdict || verdictMutation.isPending}
          >
            {verdictMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{t('common.submit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Already submitted message */}
      {(isMechInspector || isElecInspector) && hasSubmittedVerdict && (
        <View style={[styles.submittedCard, { borderLeftWidth: 4, borderLeftColor: getVerdictColor(userVerdict) }]}>
          <Text style={styles.submittedText}>
            {isAr ? 'تقييمك' : 'Your verdict'}: {VERDICT_CONFIG[userVerdict as Verdict]?.emoji} {getVerdictLabel(userVerdict)}
          </Text>
        </View>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// Verdict Trail Row Component
function VerdictTrailRow({
  label,
  verdict,
  getColor,
  getLabel,
  isCurrentUser,
}: {
  label: string;
  verdict: Verdict | string | null;
  getColor: (v: Verdict | string | null) => string;
  getLabel: (v: Verdict | string | null) => string;
  isCurrentUser?: boolean;
}) {
  return (
    <View style={styles.trailRow}>
      <View style={styles.trailDot}>
        <View style={[styles.trailDotInner, { backgroundColor: verdict ? getColor(verdict) : '#E0E0E0' }]} />
      </View>
      <View style={styles.trailContent}>
        <Text style={[styles.trailLabel, isCurrentUser && { fontWeight: '700' }]}>
          {label} {isCurrentUser ? '(You)' : ''}
        </Text>
        <View style={[styles.trailBadge, { backgroundColor: verdict ? getColor(verdict) : '#E0E0E0' }]}>
          <Text style={styles.trailBadgeText}>{getLabel(verdict)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  contentContainer: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  sectionCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#212121', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  infoLabel: { fontSize: 14, color: '#757575' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#212121', textTransform: 'capitalize', flexShrink: 1, textAlign: 'right' },

  // System recommendation banner
  systemBanner: {
    backgroundColor: '#E3F2FD', borderRadius: 12, padding: 16, marginBottom: 12,
    borderLeftWidth: 4,
  },
  systemBannerTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', marginBottom: 4 },
  systemBannerDesc: { fontSize: 13, color: '#546E7A', marginBottom: 10 },
  systemVerdictBadge: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  systemVerdictText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  systemScore: { fontSize: 12, color: '#78909C', marginTop: 8 },

  // Verdict trail
  trailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  trailDot: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  trailDotInner: { width: 12, height: 12, borderRadius: 6 },
  trailContent: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trailLabel: { fontSize: 14, color: '#424242', fontWeight: '500' },
  trailBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  trailBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Escalation
  escalationBanner: {
    backgroundColor: '#FFF8E1', borderRadius: 8, padding: 12, marginTop: 8,
  },
  escalationText: { fontSize: 13, fontWeight: '600', color: '#F57F17', textAlign: 'center' },

  // Final status
  finalStatusContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, paddingTop: 12, borderTopWidth: 2,
  },
  finalStatusLabel: { fontSize: 16, fontWeight: '700', color: '#212121' },
  finalStatusBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  finalStatusText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Reasons
  reasonText: { fontSize: 14, lineHeight: 22 },

  // Other inspector
  otherVerdictBanner: {
    backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, marginBottom: 12,
    borderLeftWidth: 3,
  },
  otherVerdictText: { fontSize: 13, color: '#616161', fontWeight: '500' },

  // Verdict cards
  verdictSelection: { gap: 12, marginBottom: 16 },
  verdictCard: { borderRadius: 14, padding: 18, borderWidth: 2, alignItems: 'center' },
  verdictEmoji: { fontSize: 28, marginBottom: 6 },
  verdictCardTitle: { fontSize: 18, fontWeight: '700', color: '#424242', marginBottom: 4 },
  verdictCardTitleSelected: { color: '#fff' },
  verdictCardDesc: { fontSize: 13, color: '#757575', textAlign: 'center' },
  verdictCardDescSelected: { color: 'rgba(255,255,255,0.85)' },
  systemRecBadge: {
    marginTop: 8, backgroundColor: 'rgba(0,0,0,0.12)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  systemRecText: { fontSize: 11, fontWeight: '600', color: '#424242' },

  // Reason input
  reasonInput: {
    borderWidth: 1, borderColor: '#FFE0B2', borderRadius: 10, padding: 12,
    fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
    backgroundColor: '#FFF8E1', color: '#212121',
  },

  // Submit
  submitButton: { backgroundColor: '#1976D2', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Submitted
  submittedCard: {
    backgroundColor: '#E8F5E9', borderRadius: 12, padding: 16, marginBottom: 12, alignItems: 'center',
  },
  submittedText: { fontSize: 16, fontWeight: '600', color: '#2E7D32', textTransform: 'capitalize' },

  bottomSpacer: { height: 40 },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
});
