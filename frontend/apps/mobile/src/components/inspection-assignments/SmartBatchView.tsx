import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionAssignmentsApi, SmartBatchResponse, SmartBatch, InspectionAssignment } from '@inspection/shared';

interface SmartBatchViewProps {
  selectedIds: number[];
  onClose?: () => void;
}

export function SmartBatchView({ selectedIds, onClose }: SmartBatchViewProps) {
  const { t } = useTranslation();
  const [batchResult, setBatchResult] = useState<SmartBatchResponse | null>(null);
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);

  const batchMutation = useMutation({
    mutationFn: (ids: number[]) => inspectionAssignmentsApi.smartBatch(ids),
    onSuccess: (res) => {
      if (res.data?.data) {
        setBatchResult(res.data.data);
      }
    },
  });

  const handleAnalyze = () => {
    if (selectedIds.length > 0) {
      batchMutation.mutate(selectedIds);
    }
  };

  const getEfficiencyColor = (score: number) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#F44336';
  };

  if (selectedIds.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📍</Text>
        <Text style={styles.emptyTitle}>{t('assignments.select_to_batch', 'Select Assignments')}</Text>
        <Text style={styles.emptyText}>
          {t('assignments.batch_description', 'Select multiple assignments to group them by location.')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>📊</Text>
          <Text style={styles.headerTitle}>{t('assignments.smart_batching', 'Smart Batching')}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{selectedIds.length}</Text>
          </View>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {!batchResult && (
        <TouchableOpacity
          style={styles.analyzeButton}
          onPress={handleAnalyze}
          disabled={batchMutation.isPending}
        >
          {batchMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.analyzeButtonIcon}>⚡</Text>
              <Text style={styles.analyzeButtonText}>
                {t('assignments.analyze_batches', 'Analyze Batches')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {batchMutation.isPending && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loadingText}>
            {t('assignments.analyzing', 'Analyzing locations...')}
          </Text>
        </View>
      )}

      {batchResult && (
        <ScrollView style={styles.resultContainer} showsVerticalScrollIndicator={false}>
          {/* Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>{batchResult.recommendation}</Text>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{batchResult.total_batches}</Text>
              <Text style={styles.statLabel}>Batches</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{batchResult.total_time_savings_min}</Text>
              <Text style={styles.statLabel}>Min Saved</Text>
            </View>
          </View>

          {/* Batch List */}
          {batchResult.batches.map((batch) => (
            <TouchableOpacity
              key={batch.batch_id}
              style={styles.batchCard}
              onPress={() => setExpandedBatch(expandedBatch === batch.batch_id ? null : batch.batch_id)}
            >
              <View style={styles.batchHeader}>
                <View style={styles.batchInfo}>
                  <Text style={styles.batchLocation}>📍 {batch.location}</Text>
                  {batch.berth && <Text style={styles.batchBerth}>{batch.berth}</Text>}
                </View>
                <View style={styles.batchStats}>
                  <View style={styles.batchCount}>
                    <Text style={styles.batchCountText}>{batch.count}</Text>
                  </View>
                  <View style={[styles.efficiencyBadge, { backgroundColor: getEfficiencyColor(batch.efficiency_score) }]}>
                    <Text style={styles.efficiencyText}>{batch.efficiency_score}%</Text>
                  </View>
                </View>
              </View>

              {batch.estimated_time_savings_min > 0 && (
                <Text style={styles.timeSaving}>
                  ⏱ Save {batch.estimated_time_savings_min} min
                </Text>
              )}

              {expandedBatch === batch.batch_id && batch.assignments && (
                <View style={styles.assignmentsList}>
                  {batch.assignments.map((assignment: InspectionAssignment, index: number) => (
                    <View key={assignment.id} style={styles.assignmentItem}>
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.assignmentName} numberOfLines={1}>
                        {assignment.equipment?.name || `#${assignment.equipment_id}`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ))}

          {/* Reset Button */}
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => setBatchResult(null)}
          >
            <Text style={styles.resetButtonText}>Analyze Again</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
  },
  countBadge: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#757575',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976D2',
    margin: 16,
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  analyzeButtonIcon: {
    fontSize: 18,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    fontSize: 14,
    color: '#757575',
    marginTop: 12,
  },
  resultContainer: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: '#E8F5E9',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  statLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
  },
  batchCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchInfo: {
    flex: 1,
  },
  batchLocation: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  batchBerth: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  batchStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batchCount: {
    backgroundColor: '#E3F2FD',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
  },
  efficiencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  efficiencyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  timeSaving: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 8,
    fontWeight: '500',
  },
  assignmentsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  assignmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  orderBadge: {
    backgroundColor: '#E3F2FD',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
  },
  assignmentName: {
    fontSize: 14,
    color: '#424242',
    flex: 1,
  },
  resetButton: {
    alignItems: 'center',
    padding: 14,
    marginTop: 8,
    marginBottom: 32,
  },
  resetButtonText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '500',
  },
});

export default SmartBatchView;
