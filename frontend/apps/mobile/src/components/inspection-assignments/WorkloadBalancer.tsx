import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  inspectionAssignmentsApi,
  WorkloadPreviewResult,
  WorkloadBalanceResult,
  WorkloadDistribution,
} from '@inspection/shared';

interface WorkloadBalancerProps {
  listId?: number;
  onBalanceApplied?: () => void;
  onClose?: () => void;
}

export function WorkloadBalancer({ listId, onBalanceApplied, onClose }: WorkloadBalancerProps) {
  const { t } = useTranslation();
  const [previewData, setPreviewData] = useState<WorkloadPreviewResult | null>(null);
  const [balanceResult, setBalanceResult] = useState<WorkloadBalanceResult | null>(null);
  const [includeRoster, setIncludeRoster] = useState(true);

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: (id: number) => inspectionAssignmentsApi.previewWorkloadBalance(id),
    onSuccess: (res) => {
      if (res.data?.data) {
        setPreviewData(res.data.data);
        setBalanceResult(null);
      }
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('common.error', 'Something went wrong'));
    },
  });

  // Balance mutation
  const balanceMutation = useMutation({
    mutationFn: (id: number) => inspectionAssignmentsApi.balanceWorkload(id, includeRoster),
    onSuccess: (res) => {
      if (res.data?.data) {
        setBalanceResult(res.data.data);
        setPreviewData(null);
        Alert.alert(
          t('common.success', 'Success'),
          t('workload.balance_success', `Balanced ${res.data.data.assigned_count} assignments`)
        );
        onBalanceApplied?.();
      }
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('common.error', 'Something went wrong'));
    },
  });

  const handlePreview = () => {
    if (listId) {
      previewMutation.mutate(listId);
    }
  };

  const handleBalance = () => {
    if (listId) {
      Alert.alert(
        t('workload.confirm_title', 'Confirm Balance'),
        t('workload.confirm_message', 'This will automatically assign unassigned inspections to available inspectors.'),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          { text: t('workload.apply_balance', 'Apply'), onPress: () => balanceMutation.mutate(listId) },
        ]
      );
    }
  };

  const getWorkloadColor = (count: number, max: number) => {
    const ratio = count / max;
    if (ratio < 0.5) return '#4CAF50';
    if (ratio < 0.8) return '#FF9800';
    return '#F44336';
  };

  const getBalanceScore = (distribution: WorkloadDistribution[]) => {
    if (distribution.length < 2) return 100;
    const counts = distribution.map((d) => d.assigned_count || d.current_assignments || 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max === 0) return 100;
    return Math.round((1 - (max - min) / max) * 100);
  };

  if (!listId) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>⚖️</Text>
        <Text style={styles.emptyTitle}>{t('workload.select_list', 'Select a List')}</Text>
        <Text style={styles.emptyText}>
          {t('workload.select_list_desc', 'Select an inspection list to balance workload.')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>⚖️</Text>
          <Text style={styles.headerTitle}>{t('workload.title', 'Workload Balancer')}</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Roster Toggle */}
        <View style={styles.optionRow}>
          <View>
            <Text style={styles.optionLabel}>{t('workload.include_roster', 'Include Roster')}</Text>
            <Text style={styles.optionDescription}>
              {t('workload.include_roster_tip', 'Consider roster availability')}
            </Text>
          </View>
          <Switch
            value={includeRoster}
            onValueChange={setIncludeRoster}
            trackColor={{ false: '#E0E0E0', true: '#90CAF9' }}
            thumbColor={includeRoster ? '#1976D2' : '#f4f3f4'}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.previewButton}
            onPress={handlePreview}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? (
              <ActivityIndicator size="small" color="#1976D2" />
            ) : (
              <>
                <Text style={styles.previewButtonIcon}>👁</Text>
                <Text style={styles.previewButtonText}>{t('workload.preview', 'Preview')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.balanceButton}
            onPress={handleBalance}
            disabled={balanceMutation.isPending}
          >
            {balanceMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.balanceButtonIcon}>⚡</Text>
                <Text style={styles.balanceButtonText}>{t('workload.balance_now', 'Balance Now')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Loading State */}
        {(previewMutation.isPending || balanceMutation.isPending) && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1976D2" />
            <Text style={styles.loadingText}>
              {previewMutation.isPending
                ? t('workload.calculating', 'Calculating optimal distribution...')
                : t('workload.applying', 'Applying workload balance...')}
            </Text>
          </View>
        )}

        {/* Preview Results */}
        {previewData && !previewMutation.isPending && (
          <View style={styles.resultsContainer}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Preview Analysis</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{previewData.unassigned_count}</Text>
                  <Text style={styles.summaryLabel}>Unassigned</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{previewData.available_inspectors}</Text>
                  <Text style={styles.summaryLabel}>Inspectors</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: '#4CAF50' }]}>
                    {getBalanceScore(previewData.preview)}%
                  </Text>
                  <Text style={styles.summaryLabel}>Balance</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Distribution Preview</Text>
            {previewData.preview.map((item) => {
              const maxAssignments = Math.max(...previewData.preview.map((d) => d.estimated_after_balance || 0));
              const newCount = (item.estimated_after_balance || 0) - (item.current_assignments || 0);
              return (
                <View key={item.inspector_id} style={styles.inspectorCard}>
                  <View style={styles.inspectorInfo}>
                    <View style={styles.inspectorAvatar}>
                      <Text style={styles.inspectorAvatarText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.inspectorDetails}>
                      <Text style={styles.inspectorName}>{item.name}</Text>
                      {item.specialization && (
                        <Text style={styles.inspectorSpec}>{item.specialization}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.inspectorStats}>
                    <Text style={styles.newAssignments}>+{newCount}</Text>
                    <View style={styles.progressBarContainer}>
                      <View
                        style={[
                          styles.progressBar,
                          {
                            width: `${Math.round(((item.estimated_after_balance || 0) / maxAssignments) * 100)}%`,
                            backgroundColor: getWorkloadColor(item.estimated_after_balance || 0, maxAssignments),
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.totalCount}>{item.estimated_after_balance || 0}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Balance Results */}
        {balanceResult && !balanceMutation.isPending && (
          <View style={styles.resultsContainer}>
            <View style={[styles.summaryCard, { backgroundColor: '#E8F5E9' }]}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={[styles.summaryTitle, { color: '#2E7D32' }]}>
                {t('workload.balance_complete', 'Workload Balanced!')}
              </Text>
              <Text style={styles.successText}>
                {balanceResult.assigned_count} assignments distributed
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Final Distribution</Text>
            {balanceResult.distribution.map((item) => {
              const maxAssignments = Math.max(...balanceResult.distribution.map((d) => d.assigned_count || 0));
              return (
                <View key={item.inspector_id} style={styles.inspectorCard}>
                  <View style={styles.inspectorInfo}>
                    <View style={[styles.inspectorAvatar, { backgroundColor: '#E8F5E9' }]}>
                      <Text style={[styles.inspectorAvatarText, { color: '#4CAF50' }]}>✓</Text>
                    </View>
                    <View style={styles.inspectorDetails}>
                      <Text style={styles.inspectorName}>{item.name}</Text>
                      {item.specialization && (
                        <Text style={styles.inspectorSpec}>{item.specialization}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.inspectorStats}>
                    <View style={styles.progressBarContainer}>
                      <View
                        style={[
                          styles.progressBar,
                          {
                            width: `${Math.round(((item.assigned_count || 0) / maxAssignments) * 100)}%`,
                            backgroundColor: '#4CAF50',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.totalCount}>{item.assigned_count || 0}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Empty State */}
        {!previewData && !balanceResult && !previewMutation.isPending && !balanceMutation.isPending && (
          <View style={styles.readyContainer}>
            <Text style={styles.readyIcon}>⚖️</Text>
            <Text style={styles.readyTitle}>{t('workload.ready', 'Ready to Balance')}</Text>
            <Text style={styles.readyText}>
              {t('workload.ready_desc', 'Click Preview to see the distribution or Balance Now to auto-assign.')}
            </Text>
          </View>
        )}
      </ScrollView>
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
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#757575',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#212121',
  },
  optionDescription: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1976D2',
    gap: 8,
  },
  previewButtonIcon: {
    fontSize: 16,
  },
  previewButtonText: {
    color: '#1976D2',
    fontSize: 15,
    fontWeight: '600',
  },
  balanceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  balanceButtonIcon: {
    fontSize: 16,
  },
  balanceButtonText: {
    color: '#fff',
    fontSize: 15,
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
  readyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  readyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  readyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 8,
  },
  readyText: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  resultsContainer: {
    marginTop: 8,
  },
  summaryCard: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 12,
  },
  successIcon: {
    fontSize: 32,
    color: '#4CAF50',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#424242',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 12,
  },
  inspectorCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  inspectorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  inspectorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  inspectorAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
  },
  inspectorDetails: {
    flex: 1,
  },
  inspectorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  inspectorSpec: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  inspectorStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newAssignments: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
    width: 30,
  },
  progressBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  totalCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
    width: 24,
    textAlign: 'right',
  },
});

export default WorkloadBalancer;
