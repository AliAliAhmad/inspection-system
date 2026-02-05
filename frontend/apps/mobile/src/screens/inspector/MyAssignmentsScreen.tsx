import React, { useState, useCallback } from 'react';
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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import {
  inspectionAssignmentsApi,
  InspectionAssignment,
} from '@inspection/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FilterStatus = 'all' | 'assigned' | 'in_progress' | 'completed';

const FILTER_OPTIONS: FilterStatus[] = ['all', 'assigned', 'in_progress', 'completed'];

const STATUS_COLORS: Record<string, string> = {
  assigned: '#2196F3',
  in_progress: '#FF9800',
  mech_complete: '#7B1FA2',
  elec_complete: '#7B1FA2',
  both_complete: '#00BCD4',
  assessment_pending: '#FF5722',
  completed: '#4CAF50',
  pending: '#9E9E9E',
};

const PENDING_LABELS: Record<string, string> = {
  both_inspections: 'Pending: Both inspections',
  mechanical_inspection: 'Pending: Mechanical inspection',
  electrical_inspection: 'Pending: Electrical inspection',
  both_verdicts: 'Pending: Both verdicts',
  mechanical_verdict: 'Pending: Mechanical verdict',
  electrical_verdict: 'Pending: Electrical verdict',
};

export default function MyAssignmentsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['myAssignments', activeFilter],
    queryFn: () =>
      inspectionAssignmentsApi.getMyAssignments(
        activeFilter === 'all' ? undefined : { status: activeFilter },
      ),
    select: (res) => (res.data as any).data ?? res.data,
  });

  const assignments = (Array.isArray(data) ? data : []) as InspectionAssignment[];

  const handlePress = useCallback(
    (assignment: InspectionAssignment) => {
      const isMech = user?.id === assignment.mechanical_inspector_id;
      const isElec = user?.id === assignment.electrical_inspector_id;
      const thisInspectorDone =
        (isMech && assignment.mech_completed_at) ||
        (isElec && assignment.elec_completed_at);

      if (thisInspectorDone || assignment.status === 'completed') {
        navigation.navigate('Assessment', { id: assignment.id });
      } else {
        navigation.navigate('InspectionChecklist', { id: assignment.id });
      }
    },
    [navigation, user],
  );

  const getFilterLabel = (filter: FilterStatus): string => {
    switch (filter) {
      case 'all':
        return t('common.all');
      case 'assigned':
        return t('status.assigned');
      case 'in_progress':
        return t('status.in_progress');
      case 'completed':
        return t('status.completed');
      default:
        return filter;
    }
  };

  const renderFilterChips = () => (
    <View style={styles.filterRow}>
      {FILTER_OPTIONS.map((filter) => (
        <TouchableOpacity
          key={filter}
          style={[
            styles.filterChip,
            activeFilter === filter && styles.filterChipActive,
          ]}
          onPress={() => setActiveFilter(filter)}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === filter && styles.filterChipTextActive,
            ]}
          >
            {getFilterLabel(filter)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderAssignmentCard = ({ item }: { item: InspectionAssignment }) => {
    const statusColor = STATUS_COLORS[item.status] ?? '#9E9E9E';
    const equipmentName = item.equipment?.name ?? `#${item.equipment_id}`;
    const equipmentType = item.equipment?.equipment_type ?? '';
    const location = item.equipment?.location ?? '';
    const berth = item.berth ?? item.equipment?.berth;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.equipmentName} numberOfLines={1}>
            {equipmentName}
          </Text>
          <View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusBadgeText}>{item.status.replace(/_/g, ' ')}</Text>
            </View>
            {item.pending_on && PENDING_LABELS[item.pending_on] ? (
              <Text style={styles.pendingOnText}>{PENDING_LABELS[item.pending_on]}</Text>
            ) : null}
          </View>
        </View>

        {equipmentType ? (
          <Text style={styles.equipmentType}>
            {t('equipment.type')}: {equipmentType}
          </Text>
        ) : null}

        {location ? (
          <Text style={styles.detailText}>
            {t('equipment.location')}: {location}
          </Text>
        ) : null}

        {berth ? (
          <Text style={styles.detailText}>
            {t('equipment.berth')}: {berth}
          </Text>
        ) : null}

        <View style={styles.cardFooter}>
          <View
            style={[
              styles.shiftBadge,
              item.shift === 'night' ? styles.shiftNight : styles.shiftDay,
            ]}
          >
            <Text style={styles.shiftBadgeText}>
              {item.shift === 'day' ? '☀ Day' : '☾ Night'}
            </Text>
          </View>

          {item.deadline ? (
            <Text style={styles.deadlineText}>
              {new Date(item.deadline).toLocaleDateString()}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('common.noData')}</Text>
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
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderFilterChips()}
      <FlatList
        data={assignments}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderAssignmentCard}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={assignments.length === 0 ? styles.emptyList : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#e8e8e8',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1976D2',
  },
  filterChipText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
  },
  emptyList: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  equipmentName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  pendingOnText: {
    fontSize: 10,
    color: '#757575',
    marginTop: 3,
    textAlign: 'right',
  },
  equipmentType: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  shiftBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shiftDay: {
    backgroundColor: '#FFF3E0',
  },
  shiftNight: {
    backgroundColor: '#E8EAF6',
  },
  shiftBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#424242',
  },
  deadlineText: {
    fontSize: 12,
    color: '#E53935',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  errorText: {
    fontSize: 16,
    color: '#E53935',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
