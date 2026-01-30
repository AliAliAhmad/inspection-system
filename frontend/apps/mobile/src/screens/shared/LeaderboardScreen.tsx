import React, { useState } from 'react';
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
import { leaderboardsApi, LeaderboardEntry } from '@inspection/shared';

type TabKey = 'overall' | 'inspectors' | 'specialists' | 'engineers' | 'quality';

const fetchers: Record<TabKey, () => Promise<LeaderboardEntry[]>> = {
  overall: () => leaderboardsApi.getOverall().then(r => r.data.data ?? []),
  inspectors: () => leaderboardsApi.getInspectors().then(r => r.data.data ?? []),
  specialists: () => leaderboardsApi.getSpecialists().then(r => r.data.data ?? []),
  engineers: () => leaderboardsApi.getEngineers().then(r => r.data.data ?? []),
  quality: () => leaderboardsApi.getQualityEngineers().then(r => r.data.data ?? []),
};

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'All' },
  { key: 'inspectors', label: 'Inspectors' },
  { key: 'specialists', label: 'Specialists' },
  { key: 'engineers', label: 'Engineers' },
  { key: 'quality', label: 'QE' },
];

function getMedalEmoji(rank: number): string {
  if (rank === 1) return '\u{1F947}';
  if (rank === 2) return '\u{1F948}';
  if (rank === 3) return '\u{1F949}';
  return '';
}

export default function LeaderboardScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('overall');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', activeTab],
    queryFn: () => fetchers[activeTab](),
  });

  const renderItem = ({ item }: { item: LeaderboardEntry }) => (
    <View style={styles.row}>
      <View style={styles.rankCol}>
        <Text style={[styles.rank, item.rank <= 3 && styles.topRank]}>
          {getMedalEmoji(item.rank) || `#${item.rank}`}
        </Text>
      </View>
      <View style={styles.nameCol}>
        <Text style={styles.name}>{item.full_name}</Text>
        <Text style={styles.role}>{item.role} · {item.employee_id}</Text>
      </View>
      <View style={styles.pointsCol}>
        <Text style={styles.points}>{item.total_points}</Text>
        <Text style={styles.pointsLabel}>pts</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.leaderboard')}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" color="#1677ff" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.user_id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  title: { fontSize: 20, fontWeight: 'bold', padding: 16, paddingBottom: 8 },
  tabBar: { paddingHorizontal: 12, marginBottom: 8, flexGrow: 0 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e8e8e8',
    marginHorizontal: 4,
  },
  activeTab: { backgroundColor: '#1677ff' },
  tabText: { fontSize: 14, color: '#666' },
  activeTabText: { color: '#fff', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 8,
    padding: 12,
  },
  rankCol: { width: 40, alignItems: 'center' },
  rank: { fontSize: 16, color: '#999' },
  topRank: { fontSize: 20 },
  nameCol: { flex: 1, marginLeft: 8 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  role: { fontSize: 12, color: '#999', marginTop: 2 },
  pointsCol: { alignItems: 'center' },
  points: { fontSize: 20, fontWeight: 'bold', color: '#1677ff' },
  pointsLabel: { fontSize: 10, color: '#999' },
});
