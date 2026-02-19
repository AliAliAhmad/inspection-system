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

export default function PendingReviewsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['pendingReviews'],
    queryFn: () => qualityReviewsApi.getPending(),
  });

  const reviews: QualityReview[] = (data?.data as any)?.data ?? (data?.data as any) ?? [];

  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date(deadline).getTime() < Date.now();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const renderReview = useCallback(({ item }: { item: QualityReview }) => {
    const overdue = isOverdue(item.sla_deadline);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ReviewDetail', { id: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: item.job_type === 'engineer' ? '#1976D2' : '#FF9800' }]}>
            <Text style={styles.typeBadgeText}>
              {t(`common.${item.job_type}`, item.job_type)}
            </Text>
          </View>
          <Text style={styles.jobIdText}>
            {t('common.job', 'Job')} #{item.job_id}
          </Text>
        </View>

        <View style={styles.cardBody}>
          {item.sla_deadline && (
            <View style={styles.slaRow}>
              <Text style={styles.slaLabel}>{t('quality.sla_deadline', 'SLA Deadline')}:</Text>
              <Text style={[styles.slaValue, overdue && styles.slaOverdue]}>
                {formatDateTime(item.sla_deadline)}
                {overdue ? ` (${t('common.overdue', 'OVERDUE')})` : ''}
              </Text>
            </View>
          )}
          <Text style={styles.createdText}>
            {t('common.created', 'Created')}: {formatDate(item.created_at)}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.tapHint}>{t('common.tap_to_review', 'Tap to review')}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [navigation, t]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.pending_reviews', 'Pending Reviews')}</Text>
      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderReview}
        contentContainerStyle={reviews.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('common.no_pending_reviews', 'No Pending Reviews')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('common.no_pending_reviews_message', 'All reviews have been processed.')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
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
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  jobIdText: { fontSize: 16, fontWeight: '600', color: '#212121' },
  cardBody: { marginBottom: 10 },
  slaRow: { marginBottom: 6 },
  slaLabel: { fontSize: 13, color: '#757575' },
  slaValue: { fontSize: 14, color: '#424242', fontWeight: '500' },
  slaOverdue: { color: '#F44336', fontWeight: '700' },
  createdText: { fontSize: 13, color: '#757575' },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  tapHint: { fontSize: 13, color: '#1976D2', fontWeight: '500' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
});
