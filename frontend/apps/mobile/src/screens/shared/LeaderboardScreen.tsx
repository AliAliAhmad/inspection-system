import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  leaderboardsApi,
  LeaderboardEntry,
  EPIBreakdown,
} from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PageView = 'field_staff' | 'engineers';
type FieldSubFilter = 'all' | 'inspectors' | 'specialists';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge inspectors + specialists and re-rank by total_points */
async function fieldStaffFetcher(): Promise<LeaderboardEntry[]> {
  const [inspectors, specialists] = await Promise.all([
    leaderboardsApi.getInspectors().then((r) => r.data.data ?? []),
    leaderboardsApi.getSpecialists().then((r) => r.data.data ?? []),
  ]);
  const merged = [...inspectors, ...specialists].sort(
    (a, b) => b.total_points - a.total_points,
  );
  return merged.map((e, idx) => ({ ...e, rank: idx + 1 }));
}

const fetchers: Record<FieldSubFilter | 'engineers', () => Promise<LeaderboardEntry[]>> = {
  all: fieldStaffFetcher,
  inspectors: () => leaderboardsApi.getInspectors().then((r) => r.data.data ?? []),
  specialists: () => leaderboardsApi.getSpecialists().then((r) => r.data.data ?? []),
  engineers: () => leaderboardsApi.getEngineers().then((r) => r.data.data ?? []),
};

function getMedalEmoji(rank: number): string {
  if (rank === 1) return '\u{1F947}';
  if (rank === 2) return '\u{1F948}';
  if (rank === 3) return '\u{1F949}';
  return '';
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'inspector':
      return '#1677ff';
    case 'specialist':
      return '#722ed1';
    case 'engineer':
      return '#52c41a';
    case 'quality_engineer':
      return '#eb2f96';
    default:
      return '#999';
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'inspector':
      return 'Inspector';
    case 'specialist':
      return 'Specialist';
    case 'engineer':
      return 'Engineer';
    case 'quality_engineer':
      return 'QE';
    default:
      return role;
  }
}

// ---------------------------------------------------------------------------
// EPI Components
// ---------------------------------------------------------------------------

const EPI_COMPONENTS: {
  key: keyof Omit<EPIBreakdown, 'total_epi'>;
  labelKey: string;
  fallback: string;
  color: string;
}[] = [
  { key: 'completion', labelKey: 'leaderboard.epi_completion', fallback: 'Completion', color: '#1677ff' },
  { key: 'quality', labelKey: 'leaderboard.epi_quality', fallback: 'Quality', color: '#52c41a' },
  { key: 'timeliness', labelKey: 'leaderboard.epi_timeliness', fallback: 'Timeliness', color: '#faad14' },
  { key: 'contribution', labelKey: 'leaderboard.epi_contribution', fallback: 'Contribution', color: '#722ed1' },
  { key: 'safety', labelKey: 'leaderboard.epi_safety', fallback: 'Safety', color: '#eb2f96' },
];

function EPICard({ epi, loading, t }: { epi?: EPIBreakdown | null; loading: boolean; t: (k: string, f?: string) => string }) {
  if (loading) {
    return (
      <View style={styles.epiCard}>
        <ActivityIndicator size="small" color="#1677ff" />
      </View>
    );
  }

  if (!epi) {
    return (
      <View style={styles.epiCard}>
        <Text style={styles.epiNoData}>
          {t('leaderboard.no_epi_data', 'No EPI data available yet.')}
        </Text>
      </View>
    );
  }

  const score = Math.round(epi.total_epi);

  return (
    <View style={styles.epiCard}>
      <Text style={styles.epiTitle}>
        {t('leaderboard.epi_title', 'Employee Performance Index (EPI)')}
      </Text>

      <View style={styles.epiBody}>
        {/* Circular EPI score */}
        <View style={styles.epiCircleContainer}>
          <View style={styles.epiCircle}>
            <Text style={styles.epiScoreText}>{score}</Text>
            <Text style={styles.epiScoreMax}>/ 100</Text>
          </View>
          <Text style={styles.epiTotalLabel}>
            {t('leaderboard.total_epi', 'Total EPI')}
          </Text>
        </View>

        {/* Component bars */}
        <View style={styles.epiBarsContainer}>
          {EPI_COMPONENTS.map(({ key, labelKey, fallback, color }) => {
            const value = epi[key];
            const pct = (value / 20) * 100;
            return (
              <View key={key} style={styles.epiBarRow}>
                <View style={styles.epiBarHeader}>
                  <Text style={styles.epiBarLabel}>{t(labelKey, fallback)}</Text>
                  <Text style={styles.epiBarValue}>{value}/20</Text>
                </View>
                <View style={styles.epiBarTrack}>
                  <View
                    style={[
                      styles.epiBarFill,
                      { width: `${Math.min(pct, 100)}%`, backgroundColor: color },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function LeaderboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [pageView, setPageView] = useState<PageView>('field_staff');
  const [fieldSubFilter, setFieldSubFilter] = useState<FieldSubFilter>('all');

  // Show Engineers tab only to engineers, quality engineers, and admins
  const canSeeEngineers = user && ['engineer', 'quality_engineer', 'admin'].includes(user.role);

  // Active fetcher key
  const activeFetcherKey = pageView === 'engineers' ? 'engineers' : fieldSubFilter;

  // Leaderboard data
  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ['leaderboard', activeFetcherKey],
    queryFn: () => fetchers[activeFetcherKey](),
  });

  // EPI data for current user
  const { data: epiData, isLoading: epiLoading } = useQuery({
    queryKey: ['leaderboard', 'epi'],
    queryFn: () => leaderboardsApi.getMyEPI().then((r) => r.data.data ?? null),
  });

  // Page view tabs
  const pageViewTabs = useMemo(() => {
    const tabs: { key: PageView; label: string }[] = [
      { key: 'field_staff', label: t('leaderboard.field_staff', 'Field Staff') },
    ];
    if (canSeeEngineers) {
      tabs.push({ key: 'engineers', label: t('nav.engineers', 'Engineers') });
    }
    return tabs;
  }, [canSeeEngineers, t]);

  // Sub-filter pills for field staff
  const subFilterPills: { key: FieldSubFilter; label: string }[] = [
    { key: 'all', label: t('common.all', 'All') },
    { key: 'inspectors', label: t('nav.inspectors', 'Inspectors') },
    { key: 'specialists', label: t('nav.specialists', 'Specialists') },
  ];

  const entries = leaderboardData ?? [];

  const renderItem = ({ item }: { item: LeaderboardEntry }) => {
    const isCurrentUser = user && item.user_id === user.id;
    return (
      <View style={[styles.row, isCurrentUser && styles.currentUserRow]}>
        {/* Rank */}
        <View style={styles.rankCol}>
          <Text style={[styles.rank, item.rank <= 3 && styles.topRank]}>
            {getMedalEmoji(item.rank) || `#${item.rank}`}
          </Text>
        </View>

        {/* Name + Role tag */}
        <View style={styles.nameCol}>
          <Text style={styles.name} numberOfLines={1}>
            {item.full_name}
          </Text>
          <View style={styles.roleTagRow}>
            <View style={[styles.roleTag, { backgroundColor: getRoleColor(item.role) + '20' }]}>
              <Text style={[styles.roleTagText, { color: getRoleColor(item.role) }]}>
                {getRoleLabel(item.role)}
              </Text>
            </View>
          </View>
        </View>

        {/* EPI score */}
        <View style={styles.epiCol}>
          <Text style={styles.epiValue}>
            {typeof (item as any).total_epi === 'number'
              ? Math.round((item as any).total_epi)
              : '--'}
          </Text>
          <Text style={styles.epiLabel}>EPI</Text>
        </View>

        {/* Avg Stars */}
        <View style={styles.starsCol}>
          <Text style={styles.stars}>{(item.avg_rating || 0).toFixed(1)}</Text>
          <Text style={styles.starsLabel}>{'\u2605'}</Text>
        </View>

        {/* Total Points */}
        <View style={styles.pointsCol}>
          <Text style={styles.points}>{item.total_points}</Text>
          <Text style={styles.pointsLabel}>pts</Text>
        </View>
      </View>
    );
  };

  return (
    <View testID="leaderboard-screen" style={styles.container}>
      {/* Title */}
      <Text style={styles.title}>{t('nav.leaderboard')}</Text>

      {/* Page View Tabs (Field Staff / Engineers) */}
      <View style={styles.pageViewBar}>
        {pageViewTabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.pageViewTab, pageView === tab.key && styles.pageViewTabActive]}
            onPress={() => {
              setPageView(tab.key);
              if (tab.key === 'engineers') {
                setFieldSubFilter('all');
              }
            }}
          >
            <Text
              style={[
                styles.pageViewTabText,
                pageView === tab.key && styles.pageViewTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sub-filter pills (only for Field Staff) */}
      {pageView === 'field_staff' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subFilterBar}
          contentContainerStyle={styles.subFilterContent}
        >
          {subFilterPills.map((pill) => (
            <TouchableOpacity
              key={pill.key}
              style={[styles.pill, fieldSubFilter === pill.key && styles.pillActive]}
              onPress={() => setFieldSubFilter(pill.key)}
            >
              <Text
                style={[
                  styles.pillText,
                  fieldSubFilter === pill.key && styles.pillTextActive,
                ]}
              >
                {pill.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* EPI Card */}
      <EPICard epi={epiData} loading={epiLoading} t={t} />

      {/* Leaderboard List */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#1677ff" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          testID="leaderboard-list"
          data={entries}
          keyExtractor={(item) => item.user_id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  title: { fontSize: 20, fontWeight: 'bold', padding: 16, paddingBottom: 8 },

  // Page view tabs (Field Staff / Engineers)
  pageViewBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#e8e8e8',
    borderRadius: 8,
    padding: 3,
  },
  pageViewTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  pageViewTabActive: {
    backgroundColor: '#1677ff',
  },
  pageViewTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  pageViewTabTextActive: {
    color: '#fff',
  },

  // Sub-filter pills
  subFilterBar: {
    flexGrow: 0,
    marginBottom: 8,
  },
  subFilterContent: {
    paddingHorizontal: 16,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e8e8e8',
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: '#1677ff',
  },
  pillText: {
    fontSize: 13,
    color: '#666',
  },
  pillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // EPI Card
  epiCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    padding: 14,
  },
  epiTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  epiNoData: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 8,
  },
  epiBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  epiCircleContainer: {
    alignItems: 'center',
    marginRight: 16,
  },
  epiCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: '#1677ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  epiScoreText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1677ff',
  },
  epiScoreMax: {
    fontSize: 10,
    color: '#8c8c8c',
  },
  epiTotalLabel: {
    fontSize: 11,
    color: '#8c8c8c',
    marginTop: 4,
    fontWeight: '600',
  },
  epiBarsContainer: {
    flex: 1,
  },
  epiBarRow: {
    marginBottom: 6,
  },
  epiBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  epiBarLabel: {
    fontSize: 11,
    color: '#595959',
  },
  epiBarValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  epiBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },
  epiBarFill: {
    height: 6,
    borderRadius: 3,
  },

  // Leaderboard row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 8,
    padding: 12,
  },
  currentUserRow: {
    backgroundColor: '#e6f7ff',
    borderWidth: 1,
    borderColor: '#91d5ff',
  },
  rankCol: { width: 36, alignItems: 'center' },
  rank: { fontSize: 14, color: '#999' },
  topRank: { fontSize: 20 },
  nameCol: { flex: 1, marginLeft: 6 },
  name: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  roleTagRow: { flexDirection: 'row', marginTop: 3 },
  roleTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  epiCol: { alignItems: 'center', marginRight: 10 },
  epiValue: { fontSize: 13, fontWeight: '700', color: '#1677ff' },
  epiLabel: { fontSize: 9, color: '#8c8c8c' },
  starsCol: { alignItems: 'center', marginRight: 10 },
  stars: { fontSize: 13, fontWeight: '600', color: '#faad14' },
  starsLabel: { fontSize: 10, color: '#faad14' },
  pointsCol: { alignItems: 'center' },
  points: { fontSize: 16, fontWeight: 'bold', color: '#1677ff' },
  pointsLabel: { fontSize: 9, color: '#999' },
});
