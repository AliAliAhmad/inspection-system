import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Share,
  Linking,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  inspectionsApi,
  aiApi,
  getApiClient,
} from '@inspection/shared';
import type {
  Inspection,
  InspectionStatus,
  InspectionAnswer,
  ReviewPayload,
  InspectionStats,
} from '@inspection/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import InspectionFindingDisplay from '../../components/InspectionFindingDisplay';
import { scale, vscale, mscale, fontScale } from '../../utils/scale';

const STATUS_COLORS: Record<InspectionStatus, string> = {
  draft: '#757575',
  submitted: '#1976D2',
  reviewed: '#4CAF50',
};

const RESULT_COLORS: Record<string, string> = {
  pass: '#4CAF50',
  fail: '#E53935',
  incomplete: '#FF9800',
};

interface FilterOption {
  label: string;
  value: InspectionStatus | null;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, color = '#1976D2' }: { label: string; value: number | string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InspectionCard({
  inspection,
  onPress,
}: {
  inspection: Inspection;
  onPress: (i: Inspection) => void;
}) {
  const statusColor = STATUS_COLORS[inspection.status] ?? '#757575';
  const resultColor = inspection.result ? RESULT_COLORS[inspection.result] ?? '#757575' : null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString() + ' ' + new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Calculate duration
  const getDuration = () => {
    if (!inspection.started_at || !inspection.submitted_at) return null;
    const start = new Date(inspection.started_at).getTime();
    const end = new Date(inspection.submitted_at).getTime();
    const minutes = Math.round((end - start) / 60000);
    return `${minutes} min`;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(inspection)} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardId}>#{inspection.id}</Text>
        <View style={styles.badgeRow}>
          <Badge label={inspection.status.toUpperCase()} color={statusColor} />
          {inspection.result && (
            <Badge label={inspection.result.toUpperCase()} color={resultColor!} />
          )}
        </View>
      </View>

      <Text style={styles.cardTitle}>
        {inspection.equipment?.name || `Equipment #${inspection.equipment_id}`}
      </Text>
      <Text style={styles.cardSubtitle}>
        {inspection.technician?.full_name || `Technician #${inspection.technician_id}`}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>Started: {formatDate(inspection.started_at)}</Text>
        {getDuration() && (
          <Text style={styles.durationText}>⏱ {getDuration()}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function AllInspectionsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<InspectionStatus | null>(null);
  const [page, setPage] = useState(1);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedInspectionId, setSelectedInspectionId] = useState<number | null>(null);

  // Review modal state
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewResult, setReviewResult] = useState<'pass' | 'fail' | 'incomplete' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // PDF download state
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // AI Report state
  const [generatingAiReport, setGeneratingAiReport] = useState(false);
  const [aiReportModalVisible, setAiReportModalVisible] = useState(false);
  const [aiReportContent, setAiReportContent] = useState<string | null>(null);

  // AI Insights state
  const [insightsModalVisible, setInsightsModalVisible] = useState(false);

  const filters: FilterOption[] = [
    { label: t('inspections.all', 'All'), value: null },
    { label: t('inspections.draft', 'Draft'), value: 'draft' },
    { label: t('inspections.submitted', 'Submitted'), value: 'submitted' },
    { label: t('inspections.reviewed', 'Reviewed'), value: 'reviewed' },
  ];

  // Stats query
  const statsQuery = useQuery({
    queryKey: ['inspections-stats'],
    queryFn: () => inspectionsApi.getStats().then((r) => (r.data as any)?.data as InspectionStats),
    staleTime: 60000,
  });

  // AI Insights query
  const insightsQuery = useQuery({
    queryKey: ['inspections-ai-insights'],
    queryFn: () => inspectionsApi.getAIInsights().then((r) => (r.data as any)?.data),
    enabled: insightsModalVisible,
  });

  const inspectionsQuery = useQuery({
    queryKey: ['all-inspections', activeFilter, page],
    queryFn: () =>
      inspectionsApi.list({
        page,
        per_page: 20,
        ...(activeFilter ? { status: activeFilter } : {}),
      }),
  });

  const detailQuery = useQuery({
    queryKey: ['inspection-detail', selectedInspectionId],
    queryFn: () =>
      inspectionsApi.get(selectedInspectionId!).then((r) => {
        const raw = (r.data as any).data ?? (r.data as any).inspection;
        return raw as Inspection;
      }),
    enabled: !!selectedInspectionId,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReviewPayload }) =>
      inspectionsApi.review(id, payload),
    onSuccess: () => {
      Alert.alert(
        t('common.success', 'Success'),
        t('inspections.reviewSuccess', 'Inspection reviewed successfully')
      );
      queryClient.invalidateQueries({ queryKey: ['all-inspections'] });
      queryClient.invalidateQueries({ queryKey: ['inspections-stats'] });
      queryClient.invalidateQueries({ queryKey: ['inspection-detail', selectedInspectionId] });
      setReviewModalVisible(false);
      setReviewResult(null);
      setReviewNotes('');
    },
    onError: (err: any) => {
      Alert.alert(
        t('common.error', 'Error'),
        err?.response?.data?.message || t('inspections.reviewError', 'Failed to review inspection')
      );
    },
  });

  const responseData = (inspectionsQuery.data?.data as any) ?? inspectionsQuery.data;
  const inspections: Inspection[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;
  const stats = statsQuery.data;

  const handleFilterChange = useCallback((value: InspectionStatus | null) => {
    setActiveFilter(value);
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
    inspectionsQuery.refetch();
    statsQuery.refetch();
  }, [inspectionsQuery, statsQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !inspectionsQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, inspectionsQuery.isFetching]);

  const handleInspectionPress = (inspection: Inspection) => {
    setSelectedInspectionId(inspection.id);
    setDetailModalVisible(true);
  };

  const handleReviewSubmit = () => {
    if (!reviewResult) {
      Alert.alert(t('common.error', 'Error'), 'Please select a result');
      return;
    }
    if (!selectedInspectionId) return;
    reviewMutation.mutate({
      id: selectedInspectionId,
      payload: {
        result: reviewResult,
        notes: reviewNotes || undefined,
      },
    });
  };

  const handleDownloadPdf = async () => {
    if (!selectedInspectionId) return;
    setDownloadingPdf(true);
    try {
      const baseUrl = getApiClient().defaults.baseURL;
      const reportUrl = `${baseUrl}/api/inspections/${selectedInspectionId}/report`;
      await Linking.openURL(reportUrl);
      setDownloadingPdf(false);
    } catch (error) {
      setDownloadingPdf(false);
      Alert.alert(t('common.error', 'Error'), t('inspections.reportError', 'Failed to download report'));
    }
  };

  const handleGenerateAiReport = async () => {
    if (!detailQuery.data) return;
    setGeneratingAiReport(true);
    try {
      const inspection = detailQuery.data;
      const inspectionData = {
        id: inspection.id,
        equipment: inspection.equipment?.name || `Equipment ${inspection.equipment_id}`,
        equipment_type: inspection.equipment?.equipment_type,
        technician: inspection.technician?.full_name || `Technician ${inspection.technician_id}`,
        status: inspection.status,
        result: inspection.result,
        started_at: inspection.started_at,
        submitted_at: inspection.submitted_at,
        answers: (inspection.answers || []).map((a: any) => ({
          question: a.checklist_item?.question_text,
          answer: a.answer_value,
          comment: a.comment,
          category: a.checklist_item?.category,
          critical: a.checklist_item?.critical_failure,
        })),
      };

      const [enResult, arResult] = await Promise.all([
        aiApi.generateReport(inspectionData, 'en'),
        aiApi.generateReport(inspectionData, 'ar'),
      ]);

      const enReport = (enResult.data as any)?.data?.report || '';
      const arReport = (arResult.data as any)?.data?.report || '';

      const combinedReport = `📋 INSPECTION REPORT (EN)\n${'='.repeat(50)}\n\n${enReport}\n\n\n📋 تقرير الفحص (AR)\n${'='.repeat(50)}\n\n${arReport}`;

      setAiReportContent(combinedReport);
      setAiReportModalVisible(true);
    } catch (error) {
      Alert.alert(t('common.error', 'Error'), t('inspections.aiReportError', 'Failed to generate AI report'));
    } finally {
      setGeneratingAiReport(false);
    }
  };

  const handleShareAiReport = async () => {
    if (aiReportContent) {
      try {
        await Share.share({
          message: aiReportContent,
          title: t('inspections.aiReport', 'AI Report'),
        });
      } catch (error) {
        // User cancelled or error
      }
    }
  };

  if (inspectionsQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  const canReview = detailQuery.data?.status === 'submitted';
  const canDownload = detailQuery.data && detailQuery.data.status !== 'draft';
  const insights = insightsQuery.data;

  return (
    <View style={styles.container} testID="all-inspections-screen">
      <View style={[styles.header, { paddingTop: insets.top + vscale(8) }]}>
        <Text style={styles.title}>{t('nav.inspections', 'All Inspections')}</Text>
        <TouchableOpacity style={styles.insightsButton} onPress={() => setInsightsModalVisible(true)}>
          <Text style={styles.insightsButtonText}>🤖 AI</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsRow}>
        <StatCard label="Today" value={stats?.today?.total || 0} />
        <StatCard label="Submitted" value={stats?.today?.submitted || 0} color="#FF9800" />
        <StatCard label="Pending" value={stats?.pending_review || 0} color={stats?.pending_review ? '#E53935' : '#4CAF50'} />
        <StatCard label="Pass Rate" value={`${(stats?.pass_rate || 0).toFixed(0)}%`} color="#4CAF50" />
        <StatCard label="Avg Time" value={`${stats?.avg_completion_minutes || 0}m`} color="#9C27B0" />
      </ScrollView>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {filters.map((filter) => {
          const isActive = activeFilter === filter.value;
          return (
            <TouchableOpacity
              key={filter.label}
              style={[
                styles.filterChip,
                isActive ? styles.filterChipActive : styles.filterChipInactive,
              ]}
              onPress={() => handleFilterChange(filter.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive ? styles.filterChipTextActive : styles.filterChipTextInactive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Inspections List */}
      <FlatList
        data={inspections}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <InspectionCard inspection={item} onPress={handleInspectionPress} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={inspectionsQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          inspectionsQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('inspections.empty', 'No inspections found.')}</Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal visible={detailModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setDetailModalVisible(false); setSelectedInspectionId(null); }}>
              <Text style={styles.modalClose}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('inspections.details', 'Inspection Details')}</Text>
            <View style={{ width: 50 }} />
          </View>

          {detailQuery.isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#1976D2" />
            </View>
          ) : detailQuery.data ? (
            <>
              <ScrollView style={styles.modalContent}>
                {/* Header info */}
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>
                    {detailQuery.data.equipment?.name || `Equipment #${detailQuery.data.equipment_id}`}
                  </Text>
                  <Text style={styles.detailSubtitle}>
                    Technician: {detailQuery.data.technician?.full_name || `#${detailQuery.data.technician_id}`}
                  </Text>
                  <View style={styles.badgeRow}>
                    <Badge
                      label={detailQuery.data.status.toUpperCase()}
                      color={STATUS_COLORS[detailQuery.data.status] ?? '#757575'}
                    />
                    {detailQuery.data.result && (
                      <Badge
                        label={detailQuery.data.result.toUpperCase()}
                        color={RESULT_COLORS[detailQuery.data.result] ?? '#757575'}
                      />
                    )}
                  </View>
                </View>

                {/* Answers */}
                <Text style={styles.sectionTitle}>{t('inspections.answers', 'Answers')}</Text>
                {(detailQuery.data.answers ?? []).length === 0 ? (
                  <Text style={styles.emptyAnswers}>{t('common.noData', 'No answers yet')}</Text>
                ) : (
                  (detailQuery.data.answers ?? []).map((answer: InspectionAnswer) => (
                    <InspectionFindingDisplay
                      key={answer.id}
                      answer={answer}
                      title={answer.checklist_item?.question_text || `Item #${answer.checklist_item_id}`}
                    />
                  ))
                )}

                <View style={{ height: 40 }} />
              </ScrollView>

              {/* Action buttons */}
              <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, scale(16)) }]}>
                {canDownload && (
                  <>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.aiButton]}
                      onPress={handleGenerateAiReport}
                      disabled={generatingAiReport}
                    >
                      {generatingAiReport ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.actionButtonText}>🤖 AI</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, styles.pdfButton]}
                      onPress={handleDownloadPdf}
                      disabled={downloadingPdf}
                    >
                      {downloadingPdf ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.actionButtonText}>PDF</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {canReview && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.reviewButton]}
                    onPress={() => {
                      setReviewResult(null);
                      setReviewNotes('');
                      setReviewModalVisible(true);
                    }}
                  >
                    <Text style={styles.actionButtonText}>{t('inspections.review', 'Review')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : null}
        </View>
      </Modal>

      {/* Review Modal */}
      <Modal visible={reviewModalVisible} animationType="slide" transparent>
        <View style={styles.reviewModalOverlay}>
          <View style={[styles.reviewModalContent, { paddingBottom: Math.max(insets.bottom, scale(20)) }]}>
            <View style={styles.reviewModalHeader}>
              <Text style={styles.reviewModalTitle}>{t('inspections.reviewInspection', 'Review Inspection')}</Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)}>
                <Text style={styles.reviewModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{t('inspections.result', 'Result')}</Text>
            <View style={styles.resultRow}>
              <TouchableOpacity
                style={[styles.resultButton, reviewResult === 'pass' && styles.resultButtonPass]}
                onPress={() => setReviewResult('pass')}
              >
                <Text style={[styles.resultButtonText, reviewResult === 'pass' && styles.resultButtonTextActive]}>
                  Pass
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultButton, reviewResult === 'fail' && styles.resultButtonFail]}
                onPress={() => setReviewResult('fail')}
              >
                <Text style={[styles.resultButtonText, reviewResult === 'fail' && styles.resultButtonTextActive]}>
                  Fail
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultButton, reviewResult === 'incomplete' && styles.resultButtonIncomplete]}
                onPress={() => setReviewResult('incomplete')}
              >
                <Text style={[styles.resultButtonText, reviewResult === 'incomplete' && styles.resultButtonTextActive]}>
                  Incomplete
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{t('inspections.notes', 'Notes')}</Text>
            <TextInput
              style={styles.textArea}
              value={reviewNotes}
              onChangeText={setReviewNotes}
              placeholder="Add review notes (optional)..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
            />

            <View style={styles.reviewModalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setReviewModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, !reviewResult && styles.submitButtonDisabled]}
                onPress={handleReviewSubmit}
                disabled={!reviewResult || reviewMutation.isPending}
              >
                {reviewMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('inspections.submitReview', 'Submit Review')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Report Modal */}
      <Modal visible={aiReportModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAiReportModalVisible(false)}>
              <Text style={styles.modalClose}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('inspections.aiReport', 'AI Report')}</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.aiReportContent}>
            <Text style={styles.aiReportText}>{aiReportContent}</Text>
          </ScrollView>

          <View style={[styles.aiReportActions, { paddingBottom: Math.max(insets.bottom, scale(16)) }]}>
            <TouchableOpacity style={styles.shareButton} onPress={handleShareAiReport}>
              <Text style={styles.shareButtonText}>{t('common.share', 'Share')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AI Insights Modal */}
      <Modal visible={insightsModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setInsightsModalVisible(false)}>
              <Text style={styles.modalClose}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>🤖 AI Insights</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {insightsQuery.isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#9C27B0" />
                <Text style={styles.loadingText}>Analyzing inspection data...</Text>
              </View>
            ) : insights ? (
              <>
                {/* Trend Summary */}
                <View style={styles.insightCard}>
                  <Text style={styles.insightTitle}>Trend Summary</Text>
                  <View style={styles.trendRow}>
                    <Text style={[styles.trendIcon, { color: insights.trend_summary?.direction === 'up' ? '#4CAF50' : '#E53935' }]}>
                      {insights.trend_summary?.direction === 'up' ? '📈' : '📉'}
                    </Text>
                    <View>
                      <Text style={styles.trendValue}>{(insights.trend_summary?.change || 0).toFixed(1)}%</Text>
                      <Text style={styles.trendLabel}>
                        {insights.trend_summary?.direction === 'up' ? 'Pass rate improving' : 'Pass rate declining'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* At Risk Equipment */}
                {insights.at_risk_equipment?.length > 0 && (
                  <View style={styles.insightCard}>
                    <Text style={styles.insightTitle}>⚠️ At-Risk Equipment</Text>
                    {insights.at_risk_equipment.slice(0, 5).map((eq: any) => (
                      <View key={eq.id} style={styles.riskItem}>
                        <Text style={styles.riskName}>{eq.name}</Text>
                        <Text style={[styles.riskRate, { color: eq.failure_rate > 50 ? '#E53935' : '#FF9800' }]}>
                          {eq.failure_rate.toFixed(0)}% fail
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Recommendations */}
                {insights.recommendations?.length > 0 && (
                  <View style={styles.insightCard}>
                    <Text style={styles.insightTitle}>💡 Recommendations</Text>
                    {insights.recommendations.slice(0, 3).map((rec: any, idx: number) => (
                      <View key={idx} style={styles.recItem}>
                        <View style={[styles.recPriority, { backgroundColor: rec.priority === 'high' ? '#E53935' : rec.priority === 'medium' ? '#FF9800' : '#1976D2' }]}>
                          <Text style={styles.recPriorityText}>{rec.priority.toUpperCase()}</Text>
                        </View>
                        <View style={styles.recContent}>
                          <Text style={styles.recTitle}>{rec.title}</Text>
                          <Text style={styles.recDesc}>{rec.description}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Top Performers */}
                {stats?.top_performers && stats.top_performers.length > 0 && (
                  <View style={styles.insightCard}>
                    <Text style={styles.insightTitle}>🏆 Top Performers</Text>
                    {stats.top_performers.slice(0, 5).map((p: any, idx: number) => (
                      <View key={p.id} style={styles.performerRow}>
                        <Text style={styles.performerRank}>{idx + 1}.</Text>
                        <Text style={styles.performerName}>{p.name}</Text>
                        <Text style={styles.performerStats}>{p.completed} • {p.pass_rate.toFixed(0)}%</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.errorText}>Failed to load insights</Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: scale(16), paddingBottom: vscale(8) },
  title: { fontSize: fontScale(22), fontWeight: 'bold', color: '#212121' },
  insightsButton: { backgroundColor: '#9C27B0', paddingHorizontal: scale(14), paddingVertical: vscale(8), borderRadius: mscale(20) },
  insightsButtonText: { color: '#fff', fontWeight: '600', fontSize: fontScale(14) },
  statsRow: { paddingHorizontal: scale(12), paddingVertical: vscale(8) },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: mscale(10),
    padding: scale(12),
    marginHorizontal: scale(4),
    minWidth: scale(90),
    alignItems: 'center',
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
    elevation: 1,
  },
  statValue: { fontSize: fontScale(20), fontWeight: 'bold' },
  statLabel: { fontSize: fontScale(12), color: '#757575', marginTop: vscale(2) },
  filterScroll: { maxHeight: vscale(48), paddingBottom: vscale(4) },
  filterRow: { paddingHorizontal: scale(16), gap: scale(8), alignItems: 'center' },
  filterChip: { paddingHorizontal: scale(14), paddingVertical: vscale(7), borderRadius: mscale(20), borderWidth: 1 },
  filterChipActive: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  filterChipInactive: { backgroundColor: '#fff', borderColor: '#BDBDBD' },
  filterChipText: { fontSize: fontScale(13), fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  filterChipTextInactive: { color: '#616161' },
  listContent: { paddingHorizontal: scale(16), paddingTop: vscale(8), paddingBottom: vscale(32) },
  card: { backgroundColor: '#fff', borderRadius: mscale(12), padding: scale(16), marginBottom: vscale(12), boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: mscale(2) },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vscale(8) },
  cardId: { fontSize: fontScale(14), fontWeight: '600', color: '#757575' },
  cardTitle: { fontSize: fontScale(16), fontWeight: 'bold', color: '#212121', marginBottom: vscale(2) },
  cardSubtitle: { fontSize: fontScale(13), color: '#757575', marginBottom: vscale(8) },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: vscale(8), paddingTop: vscale(8), borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  dateText: { fontSize: fontScale(12), color: '#757575' },
  durationText: { fontSize: fontScale(12), color: '#9C27B0', fontWeight: '600' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
  badge: { paddingHorizontal: scale(12), paddingVertical: vscale(5), borderRadius: mscale(12), minWidth: scale(65), alignItems: 'center' as const },
  badgeText: { fontSize: fontScale(12), fontWeight: '600', color: '#fff', textAlign: 'center' as const },
  footerLoader: { paddingVertical: vscale(16), alignItems: 'center' },
  emptyContainer: { paddingTop: vscale(60), alignItems: 'center' },
  emptyText: { fontSize: fontScale(15), color: '#757575' },
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: scale(16), backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  modalClose: { fontSize: fontScale(16), color: '#1976D2' },
  modalTitle: { fontSize: fontScale(17), fontWeight: '600', color: '#212121' },
  modalContent: { padding: scale(16), flex: 1 },
  detailHeader: { backgroundColor: '#fff', borderRadius: mscale(12), padding: scale(16), marginBottom: vscale(16) },
  detailTitle: { fontSize: fontScale(18), fontWeight: 'bold', color: '#212121', marginBottom: vscale(4) },
  detailSubtitle: { fontSize: fontScale(14), color: '#757575', marginBottom: vscale(12) },
  sectionTitle: { fontSize: fontScale(16), fontWeight: '600', color: '#212121', marginBottom: vscale(12) },
  emptyAnswers: { fontSize: fontScale(14), color: '#757575', fontStyle: 'italic' },
  actionBar: { flexDirection: 'row', gap: scale(10), padding: scale(16), backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  actionButton: { flex: 1, paddingVertical: vscale(12), borderRadius: mscale(8), alignItems: 'center' },
  aiButton: { backgroundColor: '#9C27B0' },
  pdfButton: { backgroundColor: '#FF5722' },
  reviewButton: { backgroundColor: '#4CAF50' },
  actionButtonText: { color: '#fff', fontWeight: '600', fontSize: fontScale(14) },
  reviewModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  reviewModalContent: { backgroundColor: '#fff', borderTopLeftRadius: mscale(20), borderTopRightRadius: mscale(20), padding: scale(20) },
  reviewModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vscale(20) },
  reviewModalTitle: { fontSize: fontScale(18), fontWeight: '600', color: '#212121' },
  reviewModalClose: { fontSize: fontScale(22), color: '#757575', paddingHorizontal: scale(8) },
  fieldLabel: { fontSize: fontScale(14), fontWeight: '600', color: '#424242', marginBottom: vscale(8), marginTop: vscale(16) },
  resultRow: { flexDirection: 'row', gap: scale(10) },
  resultButton: { flex: 1, paddingVertical: vscale(12), borderRadius: mscale(8), borderWidth: 1, borderColor: '#BDBDBD', alignItems: 'center', backgroundColor: '#fff' },
  resultButtonPass: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  resultButtonFail: { backgroundColor: '#E53935', borderColor: '#E53935' },
  resultButtonIncomplete: { backgroundColor: '#FF9800', borderColor: '#FF9800' },
  resultButtonText: { fontSize: fontScale(14), fontWeight: '600', color: '#616161' },
  resultButtonTextActive: { color: '#fff' },
  textArea: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: mscale(8), padding: scale(12), fontSize: fontScale(15), color: '#212121', textAlignVertical: 'top', minHeight: vscale(100), marginTop: vscale(8) },
  reviewModalActions: { flexDirection: 'row', gap: scale(12), marginTop: vscale(24) },
  cancelButton: { flex: 1, paddingVertical: vscale(14), borderRadius: mscale(8), borderWidth: 1, borderColor: '#BDBDBD', alignItems: 'center' },
  cancelButtonText: { fontSize: fontScale(15), fontWeight: '600', color: '#616161' },
  submitButton: { flex: 2, paddingVertical: vscale(14), borderRadius: mscale(8), backgroundColor: '#1976D2', alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#BDBDBD' },
  submitButtonText: { fontSize: fontScale(15), fontWeight: '600', color: '#fff' },
  aiReportContent: { flex: 1, padding: scale(16), backgroundColor: '#f5f5f5' },
  aiReportText: { fontSize: fontScale(14), color: '#212121', lineHeight: vscale(22), fontFamily: 'monospace' },
  aiReportActions: { flexDirection: 'row', gap: scale(10), padding: scale(16), backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  shareButton: { flex: 1, paddingVertical: vscale(14), borderRadius: mscale(8), backgroundColor: '#4CAF50', alignItems: 'center' },
  shareButtonText: { fontSize: fontScale(15), fontWeight: '600', color: '#fff' },
  loadingContainer: { alignItems: 'center', paddingVertical: vscale(40) },
  loadingText: { fontSize: fontScale(14), color: '#757575', marginTop: vscale(12) },
  insightCard: { backgroundColor: '#fff', borderRadius: mscale(12), padding: scale(16), marginBottom: vscale(12) },
  insightTitle: { fontSize: fontScale(16), fontWeight: '600', color: '#212121', marginBottom: vscale(12) },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  trendIcon: { fontSize: fontScale(32) },
  trendValue: { fontSize: fontScale(24), fontWeight: 'bold', color: '#212121' },
  trendLabel: { fontSize: fontScale(13), color: '#757575' },
  riskItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: vscale(8), borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  riskName: { fontSize: fontScale(14), color: '#424242', flex: 1 },
  riskRate: { fontSize: fontScale(14), fontWeight: '600' },
  recItem: { flexDirection: 'row', gap: scale(10), paddingVertical: vscale(10), borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  recPriority: { paddingHorizontal: scale(8), paddingVertical: vscale(4), borderRadius: mscale(4), alignSelf: 'flex-start' },
  recPriorityText: { fontSize: fontScale(10), fontWeight: '700', color: '#fff' },
  recContent: { flex: 1 },
  recTitle: { fontSize: fontScale(14), fontWeight: '600', color: '#212121', marginBottom: vscale(2) },
  recDesc: { fontSize: fontScale(12), color: '#757575' },
  performerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: vscale(8), borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  performerRank: { fontSize: fontScale(14), fontWeight: '600', color: '#757575', width: scale(24) },
  performerName: { fontSize: fontScale(14), color: '#424242', flex: 1 },
  performerStats: { fontSize: fontScale(12), color: '#757575' },
  errorText: { fontSize: fontScale(14), color: '#E53935', textAlign: 'center', padding: scale(20) },
});
