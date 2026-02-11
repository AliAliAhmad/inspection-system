/**
 * OverdueScreen - Summary cards + list of overdue items
 *
 * Features:
 * - Tab bar for Inspections/Defects/Reviews
 * - Pull to refresh
 * - Each item shows days overdue with color coding
 * - Quick reschedule action
 */
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
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  inspectionsApi,
  defectsApi,
  qualityReviewsApi,
} from '@inspection/shared';

import DaysOverdueBadge from '../../components/DaysOverdueBadge';
import { StatCard } from '../../components/shared/StatCard';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TabType = 'inspections' | 'defects' | 'reviews';

interface OverdueItem {
  id: number;
  type: TabType;
  title: string;
  subtitle: string;
  dueDate: string;
  priority?: string;
  assignedTo?: string;
}

const TABS: { key: TabType; label: string }[] = [
  { key: 'inspections', label: 'Inspections' },
  { key: 'defects', label: 'Defects' },
  { key: 'reviews', label: 'Reviews' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#C62828',
  high: '#E65100',
  medium: '#F57F17',
  low: '#2E7D32',
};

export default function OverdueScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('inspections');
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OverdueItem | null>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Fetch overdue inspections
  const { data: inspectionsData, isLoading: loadingInspections, refetch: refetchInspections, isRefetching: refetchingInspections } = useQuery({
    queryKey: ['overdue-inspections'],
    queryFn: async () => {
      const response = await inspectionsApi.list({ status: 'overdue', per_page: 100 });
      return (response.data as any)?.data ?? response.data ?? [];
    },
  });

  // Fetch overdue defects
  const { data: defectsData, isLoading: loadingDefects, refetch: refetchDefects, isRefetching: refetchingDefects } = useQuery({
    queryKey: ['overdue-defects'],
    queryFn: async () => {
      const response = await defectsApi.list({ status: 'open', sla_overdue: true, per_page: 100 });
      return (response.data as any)?.data ?? response.data ?? [];
    },
  });

  // Fetch overdue reviews
  const { data: reviewsData, isLoading: loadingReviews, refetch: refetchReviews, isRefetching: refetchingReviews } = useQuery({
    queryKey: ['overdue-reviews'],
    queryFn: async () => {
      const response = await qualityReviewsApi.getOverdue();
      return (response.data as any)?.data ?? response.data ?? [];
    },
  });

  // Transform data to unified format
  const overdueInspections: OverdueItem[] = (inspectionsData ?? []).map((item: any) => ({
    id: item.id,
    type: 'inspections' as TabType,
    title: item.equipment?.name || `Inspection #${item.id}`,
    subtitle: item.inspection_type || 'Regular Inspection',
    dueDate: item.due_date || item.scheduled_date,
    priority: item.priority,
    assignedTo: item.assigned_to?.full_name,
  }));

  const overdueDefects: OverdueItem[] = (defectsData ?? []).map((item: any) => ({
    id: item.id,
    type: 'defects' as TabType,
    title: item.description?.substring(0, 50) + (item.description?.length > 50 ? '...' : ''),
    subtitle: item.equipment?.name || `Defect #${item.id}`,
    dueDate: item.sla_deadline || item.created_at,
    priority: item.severity,
    assignedTo: item.assigned_to?.full_name,
  }));

  const overdueReviews: OverdueItem[] = (reviewsData ?? []).map((item: any) => ({
    id: item.id,
    type: 'reviews' as TabType,
    title: `${item.job_type?.charAt(0).toUpperCase() + item.job_type?.slice(1)} Job #${item.job_id}`,
    subtitle: 'Quality Review',
    dueDate: item.sla_deadline || item.created_at,
    priority: 'high',
    assignedTo: item.quality_engineer?.full_name,
  }));

  const allItems = { inspections: overdueInspections, defects: overdueDefects, reviews: overdueReviews };
  const currentItems = allItems[activeTab];

  const isLoading = loadingInspections || loadingDefects || loadingReviews;
  const isRefetching = refetchingInspections || refetchingDefects || refetchingReviews;

  const handleRefresh = useCallback(() => {
    refetchInspections();
    refetchDefects();
    refetchReviews();
  }, [refetchInspections, refetchDefects, refetchReviews]);

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: async ({ item, date, reason }: { item: OverdueItem; date: string; reason: string }) => {
      if (item.type === 'inspections') {
        return inspectionsApi.reschedule(item.id, { new_date: date, reason });
      }
      if (item.type === 'defects') {
        return defectsApi.updateSLA(item.id, { new_deadline: date, reason });
      }
      // Reviews don't typically get rescheduled
      throw new Error('Cannot reschedule reviews');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`overdue-${selectedItem?.type}`] });
      setRescheduleModalVisible(false);
      setSelectedItem(null);
      setNewDueDate('');
      setRescheduleReason('');
      Alert.alert(t('common.success'), 'Item rescheduled successfully');
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.response?.data?.message || 'Failed to reschedule');
    },
  });

  const handleReschedulePress = (item: OverdueItem) => {
    if (item.type === 'reviews') {
      Alert.alert(t('common.info'), 'Reviews cannot be rescheduled. Please complete or escalate.');
      return;
    }
    setSelectedItem(item);
    setNewDueDate('');
    setRescheduleReason('');
    setRescheduleModalVisible(true);
  };

  const handleRescheduleSubmit = () => {
    if (!selectedItem || !newDueDate.trim()) {
      Alert.alert(t('common.error'), 'Please enter a new due date');
      return;
    }
    if (!rescheduleReason.trim()) {
      Alert.alert(t('common.error'), 'Please provide a reason for rescheduling');
      return;
    }
    rescheduleMutation.mutate({
      item: selectedItem,
      date: newDueDate,
      reason: rescheduleReason,
    });
  };

  const handleItemPress = (item: OverdueItem) => {
    switch (item.type) {
      case 'inspections':
        navigation.navigate('InspectionChecklist', { id: item.id });
        break;
      case 'defects':
        navigation.navigate('DefectDetail', { defectId: item.id });
        break;
      case 'reviews':
        navigation.navigate('ReviewDetail', { id: item.id });
        break;
    }
  };

  const renderItem = ({ item }: { item: OverdueItem }) => {
    const priorityColor = item.priority ? PRIORITY_COLORS[item.priority.toLowerCase()] ?? '#757575' : '#757575';

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleContainer}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.priority && (
              <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
                <Text style={styles.priorityBadgeText}>{item.priority}</Text>
              </View>
            )}
          </View>
          <DaysOverdueBadge dueDate={item.dueDate} compact />
        </View>

        <Text style={styles.itemSubtitle}>{item.subtitle}</Text>

        {item.assignedTo && (
          <Text style={styles.assignedText}>Assigned: {item.assignedTo}</Text>
        )}

        <View style={styles.itemActions}>
          <TouchableOpacity
            style={styles.viewButton}
            onPress={() => handleItemPress(item)}
          >
            <Text style={styles.viewButtonText}>View Details</Text>
          </TouchableOpacity>
          {item.type !== 'reviews' && (
            <TouchableOpacity
              style={styles.rescheduleButton}
              onPress={() => handleReschedulePress(item)}
            >
              <Text style={styles.rescheduleButtonText}>Reschedule</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.summaryContent}
        >
          <StatCard
            label="Inspections"
            value={overdueInspections.length}
            color={overdueInspections.length > 0 ? '#E53935' : '#4CAF50'}
            onPress={() => setActiveTab('inspections')}
            size="medium"
          />
          <StatCard
            label="Defects"
            value={overdueDefects.length}
            color={overdueDefects.length > 0 ? '#E53935' : '#4CAF50'}
            onPress={() => setActiveTab('defects')}
            size="medium"
          />
          <StatCard
            label="Reviews"
            value={overdueReviews.length}
            color={overdueReviews.length > 0 ? '#E53935' : '#4CAF50'}
            onPress={() => setActiveTab('reviews')}
            size="medium"
          />
          <StatCard
            label="Total"
            value={overdueInspections.length + overdueDefects.length + overdueReviews.length}
            color="#1976D2"
            size="medium"
          />
        </ScrollView>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {allItems[tab.key].length > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                  {allItems[tab.key].length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={currentItems}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={currentItems.length === 0 ? styles.emptyListContent : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Overdue Items</Text>
            <Text style={styles.emptySubtitle}>
              All {activeTab} are within their deadlines
            </Text>
          </View>
        }
      />

      {/* Reschedule Modal */}
      <Modal visible={rescheduleModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reschedule Item</Text>

            {selectedItem && (
              <View style={styles.selectedItemInfo}>
                <Text style={styles.selectedItemTitle}>{selectedItem.title}</Text>
                <DaysOverdueBadge dueDate={selectedItem.dueDate} compact />
              </View>
            )}

            <Text style={styles.modalLabel}>New Due Date</Text>
            <TextInput
              style={styles.modalInput}
              value={newDueDate}
              onChangeText={setNewDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.modalLabel}>Reason for Rescheduling</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              value={rescheduleReason}
              onChangeText={setRescheduleReason}
              placeholder="Enter reason..."
              placeholderTextColor="#9E9E9E"
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setRescheduleModalVisible(false);
                  setSelectedItem(null);
                }}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  rescheduleMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleRescheduleSubmit}
                disabled={rescheduleMutation.isPending}
              >
                {rescheduleMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Reschedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },

  // Summary
  summaryContainer: { backgroundColor: '#fff', paddingVertical: 16 },
  summaryContent: { paddingHorizontal: 12, gap: 8 },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#1976D2' },
  tabText: { fontSize: 14, color: '#757575', fontWeight: '500' },
  tabTextActive: { color: '#1976D2', fontWeight: '600' },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabBadgeActive: { backgroundColor: '#1976D2' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#757575' },
  tabBadgeTextActive: { color: '#fff' },

  // List
  listContent: { padding: 12, paddingBottom: 32 },
  emptyListContent: { flexGrow: 1 },

  // Item Card
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemTitleContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#212121', flex: 1 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  priorityBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
  itemSubtitle: { fontSize: 13, color: '#757575', marginBottom: 6 },
  assignedText: { fontSize: 12, color: '#1976D2', marginBottom: 10 },
  itemActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  viewButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    alignItems: 'center',
  },
  viewButtonText: { fontSize: 13, fontWeight: '600', color: '#1976D2' },
  rescheduleButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    alignItems: 'center',
  },
  rescheduleButtonText: { fontSize: 13, fontWeight: '600', color: '#E65100' },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#212121', marginBottom: 16, textAlign: 'center' },
  selectedItemInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  selectedItemTitle: { fontSize: 14, fontWeight: '600', color: '#212121', flex: 1 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#212121',
    marginBottom: 16,
  },
  modalTextArea: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelButton: { flex: 1, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#BDBDBD', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#757575' },
  modalSubmitButton: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#FF9800', alignItems: 'center' },
  modalSubmitText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  buttonDisabled: { opacity: 0.6 },
});
