import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  leavesApi,
  specialistJobsApi,
  bonusStarsApi,
  assessmentsApi,
} from '@inspection/shared';
import type {
  Leave,
  PauseLog,
  BonusStar,
  FinalAssessment,
} from '@inspection/shared';

type ApprovalTab = 'leaves' | 'pauses' | 'bonus' | 'conflicts';
const TABS: ApprovalTab[] = ['leaves', 'pauses', 'bonus', 'conflicts'];

const TAB_LABELS: Record<ApprovalTab, string> = {
  leaves: 'approvals.leave_approvals',
  pauses: 'approvals.pause_approvals',
  bonus: 'approvals.bonus_approvals',
  conflicts: 'approvals.assessment_conflicts',
};

export default function AdminApprovalsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ApprovalTab>('leaves');

  // Resolve modal state
  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [resolvingAssessment, setResolvingAssessment] = useState<FinalAssessment | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'operational' | 'monitor' | 'stop'>('operational');
  const [resolveNotes, setResolveNotes] = useState('');

  // Award bonus modal
  const [awardModalVisible, setAwardModalVisible] = useState(false);
  const [awardUserId, setAwardUserId] = useState('');
  const [awardAmount, setAwardAmount] = useState('');
  const [awardReason, setAwardReason] = useState('');

  // Coverage modal
  const [coverageModalVisible, setCoverageModalVisible] = useState(false);
  const [coverageLeaveId, setCoverageLeaveId] = useState<number | null>(null);
  const [coverageCandidates, setCoverageCandidates] = useState<any[]>([]);
  const [loadingCoverage, setLoadingCoverage] = useState(false);

  // Rejection reason
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectingLeaveId, setRejectingLeaveId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // --- Queries ---
  const pendingLeavesQuery = useQuery({
    queryKey: ['admin-pending-leaves'],
    queryFn: () => leavesApi.list({ status: 'pending' }),
    enabled: activeTab === 'leaves',
  });

  const pendingPausesQuery = useQuery({
    queryKey: ['admin-pending-pauses'],
    queryFn: () => specialistJobsApi.getPendingPauses(),
    enabled: activeTab === 'pauses',
  });

  const bonusQuery = useQuery({
    queryKey: ['admin-bonus-requests'],
    queryFn: () => bonusStarsApi.list(),
    enabled: activeTab === 'bonus',
  });

  const conflictsQuery = useQuery({
    queryKey: ['admin-assessment-conflicts'],
    queryFn: () => assessmentsApi.getPending(),
    enabled: activeTab === 'conflicts',
  });

  // --- Extract data ---
  const pendingLeaves: Leave[] = (pendingLeavesQuery.data?.data as any)?.items ?? (pendingLeavesQuery.data?.data as any)?.data ?? (pendingLeavesQuery.data?.data as any) ?? [];
  const pendingPauses: PauseLog[] = (pendingPausesQuery.data?.data as any)?.data ?? (pendingPausesQuery.data?.data as any) ?? [];
  const bonusRequests: BonusStar[] = ((bonusQuery.data?.data as any)?.data ?? (bonusQuery.data?.data as any) ?? []).filter((b: BonusStar) => b.is_qe_request && b.request_status === 'pending');
  const conflictAssessments: FinalAssessment[] = (conflictsQuery.data?.data as any)?.data ?? (conflictsQuery.data?.data as any) ?? [];

  // --- Mutations ---
  const approveLeave = useMutation({
    mutationFn: (leaveId: number) => leavesApi.approve(leaveId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-leaves'] });
      Alert.alert(t('common.success', 'Success'), t('approvals.leave_approved', 'Leave approved.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  const rejectLeave = useMutation({
    mutationFn: ({ leaveId, reason }: { leaveId: number; reason?: string }) =>
      leavesApi.reject(leaveId, reason ? { rejection_reason: reason } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-leaves'] });
      setRejectModalVisible(false);
      setRejectingLeaveId(null);
      setRejectionReason('');
      Alert.alert(t('common.success', 'Success'), t('approvals.leave_rejected', 'Leave rejected.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  const assignCoverage = useMutation({
    mutationFn: ({ leaveId, userId }: { leaveId: number; userId: number }) =>
      leavesApi.assignCoverage(leaveId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-leaves'] });
      setCoverageModalVisible(false);
      Alert.alert(t('common.success', 'Success'), t('approvals.coverage_assigned', 'Coverage assigned.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  const approvePause = useMutation({
    mutationFn: (pauseId: number) => specialistJobsApi.approvePause(pauseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-pauses'] });
      Alert.alert(t('common.success', 'Success'), t('approvals.pause_approved', 'Pause approved.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  const denyPause = useMutation({
    mutationFn: (pauseId: number) => specialistJobsApi.denyPause(pauseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-pauses'] });
      Alert.alert(t('common.success', 'Success'), t('approvals.pause_denied', 'Pause denied.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  const approveBonus = useMutation({
    mutationFn: (bonusId: number) => bonusStarsApi.approveRequest(bonusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bonus-requests'] });
      Alert.alert(t('common.success', 'Success'), t('approvals.bonus_approved', 'Bonus approved.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  const denyBonus = useMutation({
    mutationFn: (bonusId: number) => bonusStarsApi.denyRequest(bonusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bonus-requests'] });
      Alert.alert(t('common.success', 'Success'), t('approvals.bonus_denied', 'Bonus denied.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  const awardBonus = useMutation({
    mutationFn: (payload: { user_id: number; amount: number; reason: string }) =>
      bonusStarsApi.award(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bonus-requests'] });
      setAwardModalVisible(false);
      setAwardUserId('');
      setAwardAmount('');
      setAwardReason('');
      Alert.alert(t('common.success', 'Success'), t('approvals.bonus_awarded', 'Bonus awarded.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  const resolveAssessment = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { decision: 'operational' | 'monitor' | 'stop'; notes?: string } }) =>
      assessmentsApi.adminResolve(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-assessment-conflicts'] });
      setResolveModalVisible(false);
      setResolvingAssessment(null);
      setResolveNotes('');
      Alert.alert(t('common.success', 'Success'), t('approvals.conflict_resolved', 'Conflict resolved.'));
    },
    onError: () => Alert.alert(t('common.error', 'Error'), t('approvals.action_failed', 'Action failed.')),
  });

  // --- Handlers ---
  const handleApproveLeave = (leaveId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('approvals.confirm_approve_leave', 'Approve this leave request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.approve', 'Approve'), onPress: () => approveLeave.mutate(leaveId) },
      ],
    );
  };

  const handleRejectLeave = (leaveId: number) => {
    setRejectingLeaveId(leaveId);
    setRejectionReason('');
    setRejectModalVisible(true);
  };

  const handleOpenCoverage = async (leaveId: number) => {
    setCoverageLeaveId(leaveId);
    setLoadingCoverage(true);
    setCoverageModalVisible(true);
    try {
      const res = await leavesApi.getCoverageCandidates(leaveId);
      setCoverageCandidates((res?.data as any)?.data ?? (res?.data as any) ?? []);
    } catch {
      setCoverageCandidates([]);
    } finally {
      setLoadingCoverage(false);
    }
  };

  const handleApprovePause = (pauseId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('approvals.confirm_approve_pause', 'Approve this pause request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.approve', 'Approve'), onPress: () => approvePause.mutate(pauseId) },
      ],
    );
  };

  const handleDenyPause = (pauseId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('approvals.confirm_deny_pause', 'Deny this pause request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.deny', 'Deny'), style: 'destructive', onPress: () => denyPause.mutate(pauseId) },
      ],
    );
  };

  const handleApproveBonus = (bonusId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('approvals.confirm_approve_bonus', 'Approve this bonus request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.approve', 'Approve'), onPress: () => approveBonus.mutate(bonusId) },
      ],
    );
  };

  const handleDenyBonus = (bonusId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('approvals.confirm_deny_bonus', 'Deny this bonus request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.deny', 'Deny'), style: 'destructive', onPress: () => denyBonus.mutate(bonusId) },
      ],
    );
  };

  const handleAwardBonus = () => {
    const userId = parseInt(awardUserId, 10);
    const amount = parseInt(awardAmount, 10);
    if (!userId || !amount || !awardReason.trim()) {
      Alert.alert(t('common.error', 'Error'), t('common.fill_all_fields', 'Please fill in all required fields.'));
      return;
    }
    awardBonus.mutate({ user_id: userId, amount, reason: awardReason.trim() });
  };

  const handleResolveConflict = (assessment: FinalAssessment) => {
    setResolvingAssessment(assessment);
    setResolveStatus('operational');
    setResolveNotes('');
    setResolveModalVisible(true);
  };

  const handleSubmitResolve = () => {
    if (!resolvingAssessment) return;
    resolveAssessment.mutate({
      id: resolvingAssessment.id,
      payload: {
        decision: resolveStatus,
        notes: resolveNotes.trim() || undefined,
      },
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  // --- Render tabs ---
  const renderTabBar = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabBarScroll}
      contentContainerStyle={styles.tabBar}
    >
      {TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, activeTab === tab && styles.tabActive]}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
            {t(TAB_LABELS[tab], tab)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // --- Leave Approvals ---
  const renderLeaveCard = useCallback(({ item }: { item: Leave }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: '#1976D2' }]}>
          <Text style={styles.badgeText}>{item.leave_type}</Text>
        </View>
        <Text style={styles.cardDate}>{formatDate(item.date_from)} - {formatDate(item.date_to)}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.user?.full_name ?? `User #${item.user_id}`}</Text>
      <Text style={styles.cardSubtext}>
        {item.total_days} {t('leaves.days', 'days')} | {t('leaves.scope', 'Scope')}: {item.scope ?? 'full'}
      </Text>
      {item.reason ? <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text> : null}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveLeave(item.id)}>
          <Text style={styles.approveBtnText}>{t('common.approve', 'Approve')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectLeave(item.id)}>
          <Text style={styles.rejectBtnText}>{t('common.reject', 'Reject')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.coverageBtn} onPress={() => handleOpenCoverage(item.id)}>
          <Text style={styles.coverageBtnText}>{t('approvals.coverage', 'Coverage')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [t]);

  // --- Pause Approvals ---
  const renderPauseCard = useCallback(({ item }: { item: PauseLog }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: '#FF9800' }]}>
          <Text style={styles.badgeText}>{item.job_type}</Text>
        </View>
        <Text style={styles.cardDate}>{t('common.job', 'Job')} #{item.job_id}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.reason_category}</Text>
      {item.reason_details ? <Text style={styles.reasonText} numberOfLines={2}>{item.reason_details}</Text> : null}
      <Text style={styles.cardSubtext}>{t('common.requested', 'Requested')}: {formatDateTime(item.requested_at)}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprovePause(item.id)}>
          <Text style={styles.approveBtnText}>{t('common.approve', 'Approve')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rejectBtn} onPress={() => handleDenyPause(item.id)}>
          <Text style={styles.rejectBtnText}>{t('common.deny', 'Deny')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [t]);

  // --- Bonus Approvals ---
  const renderBonusCard = useCallback(({ item }: { item: BonusStar }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: '#7B1FA2' }]}>
          <Text style={styles.badgeText}>{t('approvals.bonus_request', 'Bonus Request')}</Text>
        </View>
        <Text style={styles.cardDate}>{item.amount} {t('approvals.stars', 'stars')}</Text>
      </View>
      <Text style={styles.cardTitle}>{t('users.user', 'User')} #{item.user_id}</Text>
      <Text style={styles.reasonText}>{item.reason}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveBonus(item.id)}>
          <Text style={styles.approveBtnText}>{t('common.approve', 'Approve')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rejectBtn} onPress={() => handleDenyBonus(item.id)}>
          <Text style={styles.rejectBtnText}>{t('common.deny', 'Deny')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [t]);

  // --- Assessment Conflicts ---
  const renderConflictCard = useCallback(({ item }: { item: FinalAssessment }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: '#E53935' }]}>
          <Text style={styles.badgeText}>{t('approvals.conflict', 'Conflict')}</Text>
        </View>
        <Text style={styles.cardDate}>{t('equipment.equipment', 'Equipment')} #{item.equipment_id}</Text>
      </View>
      <View style={styles.verdictRow}>
        <View style={styles.verdictItem}>
          <Text style={styles.verdictLabel}>{t('approvals.mech_verdict', 'Mechanical')}</Text>
          <Text style={styles.verdictValue}>{item.mech_verdict ?? '-'}</Text>
        </View>
        <View style={styles.verdictItem}>
          <Text style={styles.verdictLabel}>{t('approvals.elec_verdict', 'Electrical')}</Text>
          <Text style={styles.verdictValue}>{item.elec_verdict ?? '-'}</Text>
        </View>
      </View>
      {item.system_verdict && (
        <View style={styles.verdictRow}>
          <View style={styles.verdictItem}>
            <Text style={styles.verdictLabel}>System</Text>
            <Text style={styles.verdictValue}>{item.system_verdict ?? '-'}</Text>
          </View>
          {item.engineer_verdict && (
            <View style={styles.verdictItem}>
              <Text style={styles.verdictLabel}>Engineer</Text>
              <Text style={styles.verdictValue}>{item.engineer_verdict ?? '-'}</Text>
            </View>
          )}
        </View>
      )}
      {item.escalation_reason ? <Text style={styles.reasonText}>{item.escalation_reason}</Text> : null}
      {(item.stop_reason || item.urgent_reason) ? <Text style={[styles.reasonText, { color: '#C62828' }]}>{item.stop_reason || item.urgent_reason}</Text> : null}
      <TouchableOpacity style={styles.resolveBtn} onPress={() => handleResolveConflict(item)}>
        <Text style={styles.resolveBtnText}>{t('approvals.resolve', 'Resolve')}</Text>
      </TouchableOpacity>
    </View>
  ), [t]);

  const getActiveData = () => {
    switch (activeTab) {
      case 'leaves': return pendingLeaves;
      case 'pauses': return pendingPauses;
      case 'bonus': return bonusRequests;
      case 'conflicts': return conflictAssessments;
    }
  };

  const getActiveQuery = () => {
    switch (activeTab) {
      case 'leaves': return pendingLeavesQuery;
      case 'pauses': return pendingPausesQuery;
      case 'bonus': return bonusQuery;
      case 'conflicts': return conflictsQuery;
    }
  };

  const getRenderItem = () => {
    switch (activeTab) {
      case 'leaves': return renderLeaveCard as any;
      case 'pauses': return renderPauseCard as any;
      case 'bonus': return renderBonusCard as any;
      case 'conflicts': return renderConflictCard as any;
    }
  };

  const activeQuery = getActiveQuery();
  const activeData = getActiveData();

  const renderEmpty = () => {
    if (activeQuery.isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('approvals.no_pending', 'No Pending Items')}</Text>
        <Text style={styles.emptySubtitle}>{t('approvals.no_pending_message', 'All caught up!')}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('nav.approvals', 'Approvals')}</Text>
        {activeTab === 'bonus' && (
          <TouchableOpacity style={styles.awardBtn} onPress={() => setAwardModalVisible(true)}>
            <Text style={styles.awardBtnText}>{t('approvals.award_bonus', 'Award Bonus')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {renderTabBar()}

      {activeQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      ) : (
        <FlatList
          data={activeData as any[]}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={getRenderItem()}
          contentContainerStyle={(activeData?.length ?? 0) === 0 ? styles.emptyListContainer : styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={activeQuery.isRefetching} onRefresh={activeQuery.refetch} />
          }
        />
      )}

      {/* Rejection Reason Modal */}
      <Modal visible={rejectModalVisible} animationType="fade" transparent onRequestClose={() => setRejectModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <Text style={styles.modalTitle}>{t('approvals.rejection_reason', 'Rejection Reason')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder={t('approvals.optional_reason', 'Optional reason...')}
              placeholderTextColor="#999"
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setRejectModalVisible(false)}>
                <Text style={styles.cancelButtonText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectSubmitBtn, rejectLeave.isPending && styles.disabledButton]}
                onPress={() => {
                  if (rejectingLeaveId) {
                    rejectLeave.mutate({ leaveId: rejectingLeaveId, reason: rejectionReason.trim() || undefined });
                  }
                }}
                disabled={rejectLeave.isPending}
              >
                {rejectLeave.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.rejectSubmitBtnText}>{t('common.reject', 'Reject')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Coverage Modal */}
      <Modal visible={coverageModalVisible} animationType="slide" transparent onRequestClose={() => setCoverageModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('approvals.assign_coverage', 'Assign Coverage')}</Text>
            {loadingCoverage ? (
              <ActivityIndicator size="large" color="#1976D2" style={{ marginVertical: 32 }} />
            ) : coverageCandidates.length === 0 ? (
              <Text style={styles.emptySubtitle}>{t('approvals.no_candidates', 'No coverage candidates available.')}</Text>
            ) : (
              <FlatList
                data={coverageCandidates}
                keyExtractor={(item: any) => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.candidateCard}
                    onPress={() => {
                      if (coverageLeaveId) {
                        assignCoverage.mutate({ leaveId: coverageLeaveId, userId: item.id });
                      }
                    }}
                  >
                    <Text style={styles.candidateName}>{item.full_name}</Text>
                    <Text style={styles.candidateRole}>{item.role} | {item.shift ?? '-'}</Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 300 }}
              />
            )}
            <TouchableOpacity style={styles.cancelButton} onPress={() => setCoverageModalVisible(false)}>
              <Text style={styles.cancelButtonText}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Award Bonus Modal */}
      <Modal visible={awardModalVisible} animationType="fade" transparent onRequestClose={() => setAwardModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <Text style={styles.modalTitle}>{t('approvals.award_bonus', 'Award Bonus')}</Text>

            <Text style={styles.fieldLabel}>{t('users.user_id', 'User ID')}</Text>
            <TextInput
              style={styles.input}
              value={awardUserId}
              onChangeText={setAwardUserId}
              placeholder="e.g. 42"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>{t('approvals.amount', 'Amount')}</Text>
            <TextInput
              style={styles.input}
              value={awardAmount}
              onChangeText={setAwardAmount}
              placeholder="e.g. 5"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>{t('approvals.reason', 'Reason')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={awardReason}
              onChangeText={setAwardReason}
              placeholder={t('approvals.reason_placeholder', 'Reason for bonus...')}
              placeholderTextColor="#999"
              multiline
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setAwardModalVisible(false)}>
                <Text style={styles.cancelButtonText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, awardBonus.isPending && styles.disabledButton]}
                onPress={handleAwardBonus}
                disabled={awardBonus.isPending}
              >
                {awardBonus.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('common.submit', 'Submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Resolve Conflict Modal */}
      <Modal visible={resolveModalVisible} animationType="fade" transparent onRequestClose={() => setResolveModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <Text style={styles.modalTitle}>{t('approvals.resolve_conflict', 'Resolve Conflict')}</Text>

            {resolvingAssessment && (
              <View style={styles.conflictInfo}>
                <Text style={styles.conflictInfoText}>
                  {t('equipment.equipment', 'Equipment')} #{resolvingAssessment.equipment_id}
                </Text>
                <Text style={styles.conflictInfoText}>
                  {t('approvals.mech_verdict', 'Mech')}: {resolvingAssessment.mech_verdict ?? '-'} | {t('approvals.elec_verdict', 'Elec')}: {resolvingAssessment.elec_verdict ?? '-'}
                </Text>
                {resolvingAssessment.system_verdict && (
                  <Text style={styles.conflictInfoText}>
                    System: {resolvingAssessment.system_verdict} | Engineer: {resolvingAssessment.engineer_verdict ?? '-'}
                  </Text>
                )}
              </View>
            )}

            <Text style={styles.fieldLabel}>{t('approvals.final_status', 'Final Status')}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.statusChip, resolveStatus === 'operational' && styles.statusChipOperational]}
                onPress={() => setResolveStatus('operational')}
              >
                <Text style={[styles.statusChipText, resolveStatus === 'operational' && styles.statusChipTextActive]}>
                  ✅ {t('status.operational', 'Operational')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusChip, resolveStatus === 'monitor' && { backgroundColor: '#FF9800', borderColor: '#FF9800' }]}
                onPress={() => setResolveStatus('monitor')}
              >
                <Text style={[styles.statusChipText, resolveStatus === 'monitor' && styles.statusChipTextActive]}>
                  ⚠️ {t('status.monitor', 'Monitor')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusChip, resolveStatus === 'stop' && styles.statusChipUrgent]}
                onPress={() => setResolveStatus('stop')}
              >
                <Text style={[styles.statusChipText, resolveStatus === 'stop' && styles.statusChipTextActive]}>
                  🛑 {t('status.stop', 'Stop')}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{t('approvals.admin_notes', 'Admin Notes')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={resolveNotes}
              onChangeText={setResolveNotes}
              placeholder={t('approvals.notes_placeholder', 'Optional decision notes...')}
              placeholderTextColor="#999"
              multiline
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setResolveModalVisible(false)}>
                <Text style={styles.cancelButtonText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, resolveAssessment.isPending && styles.disabledButton]}
                onPress={handleSubmitResolve}
                disabled={resolveAssessment.isPending}
              >
                {resolveAssessment.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('approvals.resolve', 'Resolve')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  awardBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#7B1FA2',
    borderRadius: 8,
  },
  awardBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tabBarScroll: { maxHeight: 48 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#1976D2' },
  tabText: { fontSize: 13, color: '#757575', fontWeight: '500' },
  tabTextActive: { color: '#1976D2', fontWeight: '700' },
  listContent: { padding: 12 },
  emptyListContainer: { flexGrow: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#212121', marginBottom: 4 },
  cardDate: { fontSize: 13, color: '#757575' },
  cardSubtext: { fontSize: 13, color: '#616161', marginBottom: 4 },
  reasonText: { fontSize: 13, color: '#616161', marginBottom: 8 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  approveBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    alignItems: 'center',
  },
  approveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rejectBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#E53935',
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  coverageBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
    alignItems: 'center',
  },
  coverageBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  resolveBtn: {
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  resolveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  verdictRow: { flexDirection: 'row', gap: 16, marginVertical: 8 },
  verdictItem: { flex: 1 },
  verdictLabel: { fontSize: 12, color: '#757575', marginBottom: 2 },
  verdictValue: { fontSize: 14, fontWeight: '600', color: '#212121', textTransform: 'capitalize' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalContentSmall: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '60%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#212121', marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#fafafa',
  },
  textArea: { height: 80 },
  chipRow: { flexDirection: 'row', gap: 8 },
  statusChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
  },
  statusChipOperational: { backgroundColor: '#4CAF50' },
  statusChipUrgent: { backgroundColor: '#E53935' },
  statusChipText: { fontSize: 14, fontWeight: '600', color: '#555' },
  statusChipTextActive: { color: '#fff' },
  conflictInfo: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  conflictInfoText: { fontSize: 13, color: '#424242', marginBottom: 2 },
  candidateCard: {
    padding: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  candidateName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  candidateRole: { fontSize: 13, color: '#757575', marginTop: 2 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#424242' },
  submitButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    minWidth: 80,
    alignItems: 'center',
  },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  rejectSubmitBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#E53935',
    minWidth: 80,
    alignItems: 'center',
  },
  rejectSubmitBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  disabledButton: { opacity: 0.6 },
});
