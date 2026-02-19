/**
 * EquipmentRiskListScreen - Scrollable list of equipment with risk scores
 *
 * Features:
 * - FlatList of equipment risk scores
 * - Search and filter by risk level
 * - Pull-to-refresh
 * - Navigation to equipment detail
 */
import React, { useState, useMemo } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { scheduleAIApi, type EquipmentRiskScore } from '@inspection/shared';
import { Searchbar, Chip } from 'react-native-paper';
import { RiskBadge, HealthTrendIcon } from '../../components/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const RISK_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

export default function EquipmentRiskListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Fetch risk scores
  const {
    data: riskScoresData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['equipment-risk-scores'],
    queryFn: async () => {
      try {
        const response = await scheduleAIApi.getRiskScores();
        return response;
      } catch (error) {
        console.error('Error fetching risk scores:', error);
        return null;
      }
    },
  });

  // Fetch health trends for equipment
  const { data: healthTrendsData } = useQuery({
    queryKey: ['health-trends'],
    queryFn: async () => {
      try {
        const response = await scheduleAIApi.getHealthTrends();
        return response || [];
      } catch (error) {
        console.error('Error fetching health trends:', error);
        return [];
      }
    },
  });

  const equipmentRiskScores = riskScoresData?.equipment_risk_scores || [];
  const healthTrends = healthTrendsData || [];

  // Create a map of equipment_id to health trend
  const healthTrendMap = useMemo(() => {
    const map = new Map();
    healthTrends.forEach((trend) => {
      map.set(trend.equipment_id, trend.trend_direction);
    });
    return map;
  }, [healthTrends]);

  // Filter and search equipment
  const filteredEquipment = useMemo(() => {
    let filtered = equipmentRiskScores;

    // Apply risk level filter
    if (selectedFilter !== 'all') {
      filtered = filtered.filter((item) => item.risk_level === selectedFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item) =>
        item.equipment_name.toLowerCase().includes(query)
      );
    }

    // Sort by risk score (descending)
    return filtered.sort((a, b) => b.risk_score - a.risk_score);
  }, [equipmentRiskScores, selectedFilter, searchQuery]);

  const handleEquipmentPress = (equipmentId: number) => {
    // Navigate to equipment detail screen
    // Note: Adjust the navigation target based on your app's routing
    console.log('Navigate to equipment:', equipmentId);
  };

  const renderEquipmentItem = ({ item }: { item: EquipmentRiskScore }) => {
    const healthTrend = healthTrendMap.get(item.equipment_id) || 'stable';

    return (
      <TouchableOpacity
        style={styles.equipmentCard}
        onPress={() => handleEquipmentPress(item.equipment_id)}
        activeOpacity={0.7}
      >
        <View style={styles.equipmentHeader}>
          <Text style={styles.equipmentName} numberOfLines={1}>
            {item.equipment_name}
          </Text>
          <View style={styles.equipmentBadges}>
            <HealthTrendIcon trend={healthTrend} />
            <RiskBadge level={item.risk_level} size="small" />
          </View>
        </View>

        <View style={styles.equipmentStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Risk Score</Text>
            <Text style={styles.statValue}>{item.risk_score.toFixed(1)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Days Since Inspection</Text>
            <Text style={styles.statValue}>{item.days_since_inspection}</Text>
          </View>
        </View>

        {item.last_inspection_date && (
          <Text style={styles.lastInspectionDate}>
            Last Inspection: {new Date(item.last_inspection_date).toLocaleDateString()}
          </Text>
        )}

        <Text style={styles.recommendedAction} numberOfLines={2}>
          {item.recommended_action}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>No equipment found</Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Searchbar
        placeholder="Search equipment..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
      />

      <View style={styles.filterRow}>
        {RISK_FILTERS.map((filter) => (
          <Chip
            key={filter.value}
            selected={selectedFilter === filter.value}
            onPress={() => setSelectedFilter(filter.value)}
            style={styles.filterChip}
            textStyle={styles.filterChipText}
          >
            {filter.label}
          </Chip>
        ))}
      </View>

      <Text style={styles.resultCount}>
        {filteredEquipment.length} {filteredEquipment.length === 1 ? 'item' : 'items'}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredEquipment}
        renderItem={renderEquipmentItem}
        keyExtractor={(item) => String(item.equipment_id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  listContent: { paddingBottom: 32 },

  // Header
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  searchBar: { marginBottom: 12, backgroundColor: '#fff' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: { height: 32 },
  filterChipText: { fontSize: 12 },
  resultCount: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
  },

  // Equipment Card
  equipmentCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  equipmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  equipmentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  equipmentBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Stats
  equipmentStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  statItem: { flex: 1 },
  statLabel: { fontSize: 11, color: '#757575', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#212121' },

  // Details
  lastInspectionDate: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 8,
  },
  recommendedAction: {
    fontSize: 13,
    color: '#424242',
    lineHeight: 18,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: { fontSize: 14, color: '#757575' },
});
