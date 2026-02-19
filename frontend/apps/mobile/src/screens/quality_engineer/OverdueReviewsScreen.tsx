import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { qualityReviewsApi } from '@inspection/shared';
import type { QualityReview } from '@inspection/shared';

type UrgencyLevel = 'critical' | 'high' | 'standard';

function getOverdueHours(deadline: string): number {
  const now = Date.now();
  const deadlineMs = new Date(deadline).getTime();
  return (now - deadlineMs) / (1000 * 60 * 60);
}

function getUrgencyLevel(deadline: string): UrgencyLevel {
  const hours = getOverdueHours(deadline);
  if (hours >= 24) return 'critical';
  if (hours >= 8) return 'high';
  return 'standard';
}

const URGENCY_STYLES: Record<UrgencyLevel, { bg: string; text: string; label: string }> = {
  critical: { bg: '#FFEBEE', text: '#C62828', label: 'Critical' },
  high: { bg: '#FFF3E0', text: '#E65100', label: 'High' },
  standard: { bg: '#FFFDE7', text: '#F57F17', label: 'Standard' },
};

const JOB_TYPE_COLORS: Record<string, string> = {
  engineer: '#1976D2',
  specialist: '#FF9800',
  inspection: '#4CAF50',
};

export default function OverdueReviewsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['overdue-reviews'],
    queryFn: () => qualityReviewsApi.getOverdue(),
  });

  const reviews: QualityReview[] = (data?.data as any)?.data ?? (data?.data as any) ?? [];

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const renderReviewCard = useCallback(({ item }: { item: QualityReview }) => {
    const urgency = item.sla_deadline ? getUrgencyLevel(item.sla_deadline) : 'standard';
    const urgencyStyle = URGENCY_STYLES[urgency];
    const overdueHrs = item.sla_deadline ? Math.round(getOverdueHours(item.sla_deadline)) : 0;
    const jobTypeColor = JOB_TYPE_COLORS[item.job_type] ?? '#757575';

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: urgencyStyle.bg }]}
        onPress={() => navigation.navigate('ReviewDetail', { id: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.jobTypeBadge, { backgroundColor: jobTypeColor }]}>
            <Text style={styles.jobTypeBadgeText}>
              {t(`common.${item.job_type}`, item.job_type)}
            </Text>
          </View>
          <View style={[styles.urgencyBadge, { borderColor: urgencyStyle.text }]}>
            <Text style={[styles.urgencyBadgeText, { color: urgencyStyle.text }]}>
              {t(`quality.urgency_${urgency}`, urgencyStyle.label)}
            </Text>
          </View>
        </View>

        <Text style={styles.jobIdText}>
          {t('common.job', 'Job')} #{item.job_id}
        </Text>

        {item.sla_deadline && (
          <View style={styles.deadlineRow}>
            <Text style={[styles.deadlineLabel, { color: urgencyStyle.text }]}>
              {t('quality.sla_deadline', 'SLA Deadline')}:
            </Text>
            <Text style={[styles.deadlineValue, { color: urgencyStyle.text }]}>
              {formatDateTime(item.sla_deadline)}
            </Text>
          </View>
        )}

        <View style={styles.overdueRow}>
          <View style={[styles.overdueIndicator, { backgroundColor: urgencyStyle.text }]} />
          <Text style={[styles.overdueText, { color: urgencyStyle.text }]}>
            {overdueHrs}h+ {t('quality.overdue', 'overdue')}
          </Text>
        </View>

        <Text style={styles.createdText}>
          {t('common.created', 'Created')}: {formatDate(item.created_at)}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={[styles.tapHint, { color: urgencyStyle.text }]}>
            {t('common.tap_to_review', 'Tap to review')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [navigation, t]);

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('quality.no_overdue', 'No Overdue Reviews')}</Text>
        <Text style={styles.emptySubtitle}>
          {t('quality.no_overdue_message', 'All reviews are within SLA deadlines.')}
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error', 'Error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('quality.overdue_reviews', 'Overdue Reviews')}</Text>
        {reviews.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{reviews.length}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={reviews}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderReviewCard}
        contentContainerStyle={reviews.length === 0 ? styles.emptyListContainer : styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  countBadge: {
    backgroundColor: '#E53935',
    borderRadius: 12,
    minWidth: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  countBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  listContent: { padding: 12 },
  emptyListContainer: { flexGrow: 1 },
  card: {
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
    marginBottom: 10,
  },
  jobTypeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  jobTypeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  urgencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  urgencyBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  jobIdText: { fontSize: 16, fontWeight: '700', color: '#212121', marginBottom: 8 },
  deadlineRow: { marginBottom: 4 },
  deadlineLabel: { fontSize: 12, fontWeight: '600' },
  deadlineValue: { fontSize: 14, fontWeight: '700' },
  overdueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  overdueIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  overdueText: { fontSize: 13, fontWeight: '700' },
  createdText: { fontSize: 12, color: '#757575', marginBottom: 8 },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 10,
  },
  tapHint: { fontSize: 13, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
});
