/**
 * DefectDetailScreen - Enhanced defect detail view with AI panel
 *
 * Features:
 * - Risk score gauge
 * - SLA countdown
 * - Similar defects from AI
 * - Quick escalate button
 * - Full defect information
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { defectsApi, aiApi } from '@inspection/shared';
import type { Defect } from '@inspection/shared';

import RiskGauge from '../../components/RiskGauge';
import SLABadge from '../../components/SLABadge';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'DefectDetail'>;

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#C62828',
  high: '#E65100',
  medium: '#F57F17',
  low: '#2E7D32',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#E53935',
  in_progress: '#1976D2',
  resolved: '#4CAF50',
  closed: '#757575',
  false_alarm: '#7B1FA2',
};

interface SimilarDefect {
  id: number;
  description: string;
  severity: string;
  status: string;
  similarity: number;
  resolution?: string;
}

export default function DefectDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const queryClient = useQueryClient();
  const { defectId: id } = route.params;

  const [aiPanelExpanded, setAiPanelExpanded] = useState(true);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [similarDefects, setSimilarDefects] = useState<SimilarDefect[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Fetch defect details
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['defect', id],
    queryFn: () => defectsApi.get(id),
  });

  const defect: Defect | undefined = (data?.data as any)?.data ?? data?.data;

  // Fetch AI risk assessment
  const { data: riskData, isLoading: loadingRisk } = useQuery({
    queryKey: ['defect-risk', id],
    queryFn: async () => {
      try {
        const response = await aiApi.analyzeDefectRisk(id);
        return (response.data as any)?.data ?? response.data;
      } catch {
        return { risk_score: 50, factors: [] };
      }
    },
    enabled: !!defect,
  });

  // Escalate mutation
  const escalateMutation = useMutation({
    mutationFn: (reason: string) => defectsApi.escalate(id, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defect', id] });
      setShowEscalateModal(false);
      setEscalateReason('');
      Alert.alert(t('common.success'), t('defects.escalated', 'Defect escalated successfully'));
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.response?.data?.message || 'Failed to escalate');
    },
  });

  // Load similar defects
  const handleLoadSimilar = useCallback(async () => {
    if (!defect?.description) return;

    setLoadingSimilar(true);
    try {
      const response = await aiApi.searchSimilarDefects(defect.description, 5);
      const results = ((response.data as any)?.data?.results || []) as SimilarDefect[];
      // Filter out the current defect
      setSimilarDefects(results.filter((d) => d.id !== id));
    } catch {
      setSimilarDefects([]);
    } finally {
      setLoadingSimilar(false);
    }
  }, [defect?.description, id]);

  // Handle escalate submit
  const handleEscalate = useCallback(() => {
    if (!escalateReason.trim()) {
      Alert.alert(t('common.error'), t('defects.enter_escalate_reason', 'Please enter an escalation reason'));
      return;
    }
    escalateMutation.mutate(escalateReason);
  }, [escalateReason, escalateMutation, t]);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString();
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (!defect) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.not_found', 'Defect not found')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const severityColor = SEVERITY_COLORS[defect.severity] ?? '#757575';
  const statusColor = STATUS_COLORS[defect.status] ?? '#757575';
  const riskScore = riskData?.risk_score ?? 50;
  const riskFactors = riskData?.factors ?? [];
  const slaDeadline = (defect as any).sla_deadline;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.defectId}>#{defect.id}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusBadgeText}>{defect.status.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <Text style={styles.description}>{defect.description}</Text>

        <View style={styles.badgeRow}>
          <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
            <Text style={styles.severityBadgeText}>{defect.severity}</Text>
          </View>
          {defect.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{defect.category}</Text>
            </View>
          )}
          {defect.occurrence_count > 1 && (
            <View style={styles.occurrenceBadge}>
              <Text style={styles.occurrenceBadgeText}>x{defect.occurrence_count}</Text>
            </View>
          )}
        </View>
      </View>

      {/* AI Insights Panel */}
      <View style={styles.aiPanel}>
        <TouchableOpacity
          style={styles.aiPanelHeader}
          onPress={() => setAiPanelExpanded(!aiPanelExpanded)}
        >
          <View style={styles.aiPanelTitleRow}>
            <Text style={styles.aiPanelTitle}>AI Insights</Text>
            <Text style={styles.aiPanelToggle}>{aiPanelExpanded ? '−' : '+'}</Text>
          </View>
        </TouchableOpacity>

        {aiPanelExpanded && (
          <View style={styles.aiPanelContent}>
            {/* Risk Score Gauge */}
            <View style={styles.riskSection}>
              <Text style={styles.riskLabel}>Risk Score</Text>
              {loadingRisk ? (
                <ActivityIndicator size="small" color="#1976D2" />
              ) : (
                <View style={styles.riskGaugeContainer}>
                  <RiskGauge score={riskScore} mode="circle" size="large" showLabel />
                  {riskFactors.length > 0 && (
                    <View style={styles.riskFactors}>
                      {riskFactors.slice(0, 3).map((factor: string, idx: number) => (
                        <Text key={idx} style={styles.riskFactor}>
                          - {factor}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* SLA Countdown */}
            {slaDeadline && (
              <View style={styles.slaSection}>
                <Text style={styles.slaLabel}>SLA Status</Text>
                <SLABadge deadline={slaDeadline} countdown />
              </View>
            )}

            {/* Similar Defects */}
            <View style={styles.similarSection}>
              <View style={styles.similarHeader}>
                <Text style={styles.similarLabel}>Similar Defects</Text>
                {similarDefects.length === 0 && (
                  <TouchableOpacity
                    style={styles.loadSimilarButton}
                    onPress={handleLoadSimilar}
                    disabled={loadingSimilar}
                  >
                    {loadingSimilar ? (
                      <ActivityIndicator size="small" color="#9C27B0" />
                    ) : (
                      <Text style={styles.loadSimilarText}>Find Similar</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {similarDefects.length > 0 && (
                <View style={styles.similarList}>
                  {similarDefects.map((similar) => (
                    <TouchableOpacity
                      key={similar.id}
                      style={styles.similarCard}
                      onPress={() =>
                        navigation.push('DefectDetail', { defectId: similar.id })
                      }
                    >
                      <View style={styles.similarCardHeader}>
                        <Text style={styles.similarId}>#{similar.id}</Text>
                        <Text style={styles.similarityText}>
                          {Math.round(similar.similarity * 100)}% match
                        </Text>
                      </View>
                      <Text style={styles.similarDescription} numberOfLines={2}>
                        {similar.description}
                      </Text>
                      {similar.resolution && (
                        <View style={styles.resolutionHint}>
                          <Text style={styles.resolutionLabel}>Resolution:</Text>
                          <Text style={styles.resolutionText} numberOfLines={1}>
                            {similar.resolution}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Quick Escalate */}
            <TouchableOpacity
              style={styles.escalateButton}
              onPress={() => setShowEscalateModal(true)}
            >
              <Text style={styles.escalateButtonText}>Quick Escalate</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Details Section */}
      <View style={styles.detailsCard}>
        <Text style={styles.sectionTitle}>{t('common.details', 'Details')}</Text>

        {defect.equipment && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Equipment</Text>
            <Text style={styles.infoValue}>
              {defect.equipment.name} - {defect.equipment.serial_number}
            </Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Priority</Text>
          <Text style={styles.infoValue}>{defect.priority}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Created</Text>
          <Text style={styles.infoValue}>{formatDateTime(defect.created_at)}</Text>
        </View>

        {(defect as any).updated_at && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last Updated</Text>
            <Text style={styles.infoValue}>{formatDateTime((defect as any).updated_at)}</Text>
          </View>
        )}

        {(defect as any).reported_by && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Reported By</Text>
            <Text style={styles.infoValue}>{(defect as any).reported_by.full_name}</Text>
          </View>
        )}

        {(defect as any).assigned_to && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Assigned To</Text>
            <Text style={styles.infoValue}>{(defect as any).assigned_to.full_name}</Text>
          </View>
        )}
      </View>

      {/* Notes/History Section */}
      {(defect as any).notes && (
        <View style={styles.notesCard}>
          <Text style={styles.sectionTitle}>{t('common.notes', 'Notes')}</Text>
          <Text style={styles.notesText}>{(defect as any).notes}</Text>
        </View>
      )}

      {/* Escalate Modal */}
      <Modal visible={showEscalateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Escalate Defect</Text>

            <Text style={styles.modalLabel}>Reason for Escalation</Text>
            <View style={styles.reasonOptions}>
              {[
                'Safety Critical',
                'Production Impact',
                'Recurring Issue',
                'SLA At Risk',
                'Other',
              ].map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reasonChip,
                    escalateReason === reason && styles.reasonChipActive,
                  ]}
                  onPress={() => setEscalateReason(reason)}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      escalateReason === reason && styles.reasonChipTextActive,
                    ]}
                  >
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowEscalateModal(false);
                  setEscalateReason('');
                }}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  escalateMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleEscalate}
                disabled={escalateMutation.isPending}
              >
                {escalateMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Escalate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },

  // Header
  headerCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  defectId: { fontSize: 20, fontWeight: '700', color: '#212121' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  description: { fontSize: 15, color: '#424242', lineHeight: 22, marginBottom: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  severityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  severityBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#E3F2FD' },
  categoryBadgeText: { color: '#1565C0', fontSize: 11, fontWeight: '600' },
  occurrenceBadge: { backgroundColor: '#E53935', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  occurrenceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // AI Panel
  aiPanel: {
    backgroundColor: '#fff',
    marginBottom: 8,
    overflow: 'hidden',
  },
  aiPanelHeader: {
    backgroundColor: '#7B1FA2',
    padding: 16,
  },
  aiPanelTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiPanelTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  aiPanelToggle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  aiPanelContent: { padding: 16 },

  // Risk Section
  riskSection: { marginBottom: 16 },
  riskLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 8 },
  riskGaugeContainer: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  riskFactors: { flex: 1 },
  riskFactor: { fontSize: 12, color: '#616161', marginBottom: 4 },

  // SLA Section
  slaSection: { marginBottom: 16 },
  slaLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 8 },

  // Similar Section
  similarSection: { marginBottom: 16 },
  similarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  similarLabel: { fontSize: 13, fontWeight: '600', color: '#424242' },
  loadSimilarButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F3E5F5', borderRadius: 12 },
  loadSimilarText: { fontSize: 12, fontWeight: '600', color: '#7B1FA2' },
  similarList: { gap: 8 },
  similarCard: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 12 },
  similarCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  similarId: { fontSize: 13, fontWeight: '700', color: '#212121' },
  similarityText: { fontSize: 11, color: '#7B1FA2', fontWeight: '600' },
  similarDescription: { fontSize: 12, color: '#616161', lineHeight: 18 },
  resolutionHint: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  resolutionLabel: { fontSize: 11, fontWeight: '600', color: '#2E7D32' },
  resolutionText: { fontSize: 11, color: '#424242' },

  // Escalate Button
  escalateButton: {
    backgroundColor: '#E53935',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  escalateButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Details Card
  detailsCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#212121', marginBottom: 12 },
  infoRow: { marginBottom: 12 },
  infoLabel: { fontSize: 12, color: '#757575', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#212121' },

  // Notes Card
  notesCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  notesText: { fontSize: 14, color: '#424242', lineHeight: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#212121', marginBottom: 16, textAlign: 'center' },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 12 },
  reasonOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  reasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  reasonChipActive: { borderColor: '#E53935', backgroundColor: '#FFEBEE' },
  reasonChipText: { fontSize: 13, color: '#616161' },
  reasonChipTextActive: { color: '#E53935', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelButton: { flex: 1, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#BDBDBD', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#757575' },
  modalSubmitButton: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#E53935', alignItems: 'center' },
  modalSubmitText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  buttonDisabled: { opacity: 0.6 },

  bottomSpacer: { height: 40 },
});
