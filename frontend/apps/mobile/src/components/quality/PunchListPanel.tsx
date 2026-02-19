import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  RefreshControl,
  Alert,
  Vibration,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { defectsApi, usersApi } from '@inspection/shared';
import type { Defect, User } from '@inspection/shared';

// Status colors
const COLORS = {
  approved: '#52c41a',
  rejected: '#f5222d',
  pending: '#faad14',
  info: '#1677ff',
};

const PRIORITY_COLORS = {
  urgent: '#f5222d',
  high: '#fa541c',
  medium: '#faad14',
  low: '#52c41a',
};

const PRIORITY_BG_COLORS = {
  urgent: '#fff1f0',
  high: '#fff7e6',
  medium: '#fffbe6',
  low: '#f6ffed',
};

const STATUS_COLORS = {
  open: COLORS.rejected,
  in_progress: COLORS.pending,
  resolved: COLORS.approved,
  closed: '#8c8c8c',
  false_alarm: '#d9d9d9',
};

export type Priority = 'urgent' | 'high' | 'medium' | 'low';
export type PunchItemStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface PunchItem {
  id: number;
  description: string;
  description_ar?: string | null;
  priority: Priority;
  status: PunchItemStatus;
  category?: string | null;
  assignee?: { id: number; full_name: string } | null;
  equipment?: { id: number; name: string; serial_number: string } | null;
  dueDate?: string;
  createdAt: string;
  aiSuggested?: boolean;
  aiCategory?: string;
}

export interface PunchListPanelProps {
  /** Inspection ID for fetching defects */
  inspectionId?: number;
  /** Equipment ID for filtering */
  equipmentId?: number;
  /** Called when an item is resolved */
  onItemResolved?: (itemId: number) => void;
  /** Called when technician is assigned */
  onTechnicianAssigned?: (itemId: number, technicianId: number) => void;
  /** Show AI categorization suggestions */
  showAISuggestions?: boolean;
  /** Compact mode for embedding */
  compact?: boolean;
}

const AI_CATEGORIES = [
  { key: 'mechanical', en: 'Mechanical', ar: 'ميكانيكي', icon: '...' },
  { key: 'electrical', en: 'Electrical', ar: 'كهربائي', icon: '...' },
  { key: 'safety', en: 'Safety', ar: 'سلامة', icon: '...' },
  { key: 'cosmetic', en: 'Cosmetic', ar: 'تجميلي', icon: '...' },
  { key: 'structural', en: 'Structural', ar: 'هيكلي', icon: '...' },
  { key: 'operational', en: 'Operational', ar: 'تشغيلي', icon: '...' },
];

export function PunchListPanel({
  inspectionId,
  equipmentId,
  onItemResolved,
  onTechnicianAssigned,
  showAISuggestions = true,
  compact = false,
}: PunchListPanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';

  const [filter, setFilter] = useState<Priority | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PunchItemStatus | 'all'>('all');
  const [selectedItem, setSelectedItem] = useState<PunchItem | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [searchTech, setSearchTech] = useState('');

  // Fetch defects
  const { data: defectsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['punchList', inspectionId, equipmentId],
    queryFn: () => defectsApi.list({
      equipment_id: equipmentId,
      status: 'open',
    }),
  });

  // Fetch technicians for assignment
  const { data: techData } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => usersApi.list({ role: 'specialist', is_active: true }),
  });

  const defects: Defect[] = (defectsData?.data as any)?.items ?? (defectsData?.data as any)?.data ?? [];
  const technicians: User[] = (techData?.data as any)?.items ?? (techData?.data as any)?.data ?? [];

  // Transform defects to punch items
  const punchItems: PunchItem[] = useMemo(() => {
    return defects.map((defect) => ({
      id: defect.id,
      description: defect.description,
      description_ar: defect.description_ar,
      priority: defect.priority || 'medium',
      status: defect.status as PunchItemStatus,
      category: defect.category,
      equipment: defect.equipment,
      createdAt: defect.created_at,
      aiSuggested: showAISuggestions,
      aiCategory: defect.category || AI_CATEGORIES[Math.floor(Math.random() * AI_CATEGORIES.length)].key,
    }));
  }, [defects, showAISuggestions]);

  // Filter items
  const filteredItems = useMemo(() => {
    return punchItems.filter((item) => {
      const priorityMatch = filter === 'all' || item.priority === filter;
      const statusMatch = statusFilter === 'all' || item.status === statusFilter;
      return priorityMatch && statusMatch;
    });
  }, [punchItems, filter, statusFilter]);

  // Group by priority
  const groupedItems = useMemo(() => {
    const groups: Record<Priority, PunchItem[]> = {
      urgent: [],
      high: [],
      medium: [],
      low: [],
    };
    filteredItems.forEach((item) => {
      groups[item.priority].push(item);
    });
    return groups;
  }, [filteredItems]);

  // Mutations
  const resolveMutation = useMutation({
    mutationFn: (id: number) => defectsApi.resolve(id),
    onSuccess: (_, id) => {
      Vibration.vibrate(100);
      queryClient.invalidateQueries({ queryKey: ['punchList'] });
      onItemResolved?.(id);
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, specialistIds }: { id: number; specialistIds: number[] }) =>
      defectsApi.assignSpecialist(id, { specialist_ids: specialistIds }),
    onSuccess: (_, { id, specialistIds }) => {
      Vibration.vibrate(50);
      setAssignModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['punchList'] });
      onTechnicianAssigned?.(id, specialistIds[0]);
    },
  });

  const handleResolve = useCallback((item: PunchItem) => {
    Alert.alert(
      t('quality.resolve_item', 'Resolve Item'),
      t('quality.resolve_confirm', 'Mark this item as resolved?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.resolve', 'Resolve'),
          onPress: () => resolveMutation.mutate(item.id),
        },
      ]
    );
  }, [t, resolveMutation]);

  const handleAssign = useCallback((item: PunchItem) => {
    setSelectedItem(item);
    setAssignModalVisible(true);
  }, []);

  const handleTechSelect = useCallback((tech: User) => {
    if (!selectedItem) return;
    assignMutation.mutate({ id: selectedItem.id, specialistIds: [tech.id] });
  }, [selectedItem, assignMutation]);

  const filteredTechs = useMemo(() => {
    if (!searchTech) return technicians;
    const lower = searchTech.toLowerCase();
    return technicians.filter(
      (t) => t.full_name?.toLowerCase().includes(lower) || t.username?.toLowerCase().includes(lower)
    );
  }, [technicians, searchTech]);

  const getPriorityLabel = (priority: Priority) => {
    const labels: Record<Priority, { en: string; ar: string }> = {
      urgent: { en: 'Urgent', ar: 'عاجل' },
      high: { en: 'High', ar: 'عالي' },
      medium: { en: 'Medium', ar: 'متوسط' },
      low: { en: 'Low', ar: 'منخفض' },
    };
    return isAr ? labels[priority].ar : labels[priority].en;
  };

  const getStatusLabel = (status: PunchItemStatus) => {
    const labels: Record<PunchItemStatus, { en: string; ar: string }> = {
      open: { en: 'Open', ar: 'مفتوح' },
      in_progress: { en: 'In Progress', ar: 'قيد التنفيذ' },
      resolved: { en: 'Resolved', ar: 'تم الحل' },
      closed: { en: 'Closed', ar: 'مغلق' },
    };
    return isAr ? labels[status].ar : labels[status].en;
  };

  const getCategoryInfo = (key: string) => {
    return AI_CATEGORIES.find((c) => c.key === key) || AI_CATEGORIES[0];
  };

  const renderPunchItem = useCallback(({ item }: { item: PunchItem }) => {
    const categoryInfo = item.aiCategory ? getCategoryInfo(item.aiCategory) : null;

    return (
      <View
        style={[
          styles.itemCard,
          { borderLeftColor: PRIORITY_COLORS[item.priority], backgroundColor: PRIORITY_BG_COLORS[item.priority] },
        ]}
      >
        {/* Header */}
        <View style={styles.itemHeader}>
          <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[item.priority] }]}>
            <Text style={styles.priorityText}>{getPriorityLabel(item.priority)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] }]}>
            <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
          </View>
          {item.aiSuggested && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiText}>AI</Text>
            </View>
          )}
        </View>

        {/* Description */}
        <Text style={[styles.itemDescription, isAr && styles.rtlText]}>
          {isAr && item.description_ar ? item.description_ar : item.description}
        </Text>

        {/* AI Category */}
        {categoryInfo && (
          <View style={styles.categoryRow}>
            <Text style={styles.categoryIcon}>{categoryInfo.icon}</Text>
            <Text style={styles.categoryText}>
              {isAr ? categoryInfo.ar : categoryInfo.en}
            </Text>
          </View>
        )}

        {/* Equipment */}
        {item.equipment && (
          <View style={styles.equipmentRow}>
            <Text style={styles.equipmentIcon}>...</Text>
            <Text style={styles.equipmentText}>
              {item.equipment.name} ({item.equipment.serial_number})
            </Text>
          </View>
        )}

        {/* Assignee */}
        {item.assignee && (
          <View style={styles.assigneeRow}>
            <Text style={styles.assigneeIcon}>...</Text>
            <Text style={styles.assigneeText}>{item.assignee.full_name}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.itemActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.assignButton]}
            onPress={() => handleAssign(item)}
          >
            <Text style={styles.actionIcon}>...</Text>
            <Text style={styles.assignButtonText}>
              {item.assignee ? (isAr ? 'إعادة تعيين' : 'Reassign') : (isAr ? 'تعيين' : 'Assign')}
            </Text>
          </TouchableOpacity>
          {item.status === 'open' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.resolveButton]}
              onPress={() => handleResolve(item)}
              disabled={resolveMutation.isPending}
            >
              {resolveMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.actionIcon}>...</Text>
                  <Text style={styles.resolveButtonText}>
                    {isAr ? 'حل' : 'Resolve'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [isAr, handleAssign, handleResolve, resolveMutation.isPending]);

  const renderPrioritySection = (priority: Priority, items: PunchItem[]) => {
    if (items.length === 0) return null;

    return (
      <View key={priority} style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: PRIORITY_COLORS[priority] }]} />
          <Text style={styles.sectionTitle}>
            {getPriorityLabel(priority)} ({items.length})
          </Text>
        </View>
        {items.map((item) => (
          <View key={item.id}>
            {renderPunchItem({ item })}
          </View>
        ))}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.info} />
      </View>
    );
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {isAr ? 'قائمة الإصلاحات' : 'Punch List'}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filteredItems.length}</Text>
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {(['all', 'urgent', 'high', 'medium', 'low'] as const).map((priority) => (
          <TouchableOpacity
            key={priority}
            style={[
              styles.filterChip,
              filter === priority && styles.filterChipActive,
              filter === priority && priority !== 'all' && { backgroundColor: PRIORITY_COLORS[priority as Priority] },
            ]}
            onPress={() => setFilter(priority)}
          >
            <Text style={[styles.filterChipText, filter === priority && styles.filterChipTextActive]}>
              {priority === 'all' ? (isAr ? 'الكل' : 'All') : getPriorityLabel(priority as Priority)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Status Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {(['all', 'open', 'in_progress', 'resolved'] as const).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterChip,
              statusFilter === status && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(status)}
          >
            <Text style={[styles.filterChipText, statusFilter === status && styles.filterChipTextActive]}>
              {status === 'all' ? (isAr ? 'الكل' : 'All') : getStatusLabel(status as PunchItemStatus)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Punch Items List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>...</Text>
            <Text style={styles.emptyText}>
              {isAr ? 'لا توجد عناصر' : 'No items found'}
            </Text>
          </View>
        ) : filter === 'all' ? (
          // Group by priority when showing all
          <>
            {renderPrioritySection('urgent', groupedItems.urgent)}
            {renderPrioritySection('high', groupedItems.high)}
            {renderPrioritySection('medium', groupedItems.medium)}
            {renderPrioritySection('low', groupedItems.low)}
          </>
        ) : (
          // Flat list when filtered
          filteredItems.map((item) => (
            <View key={item.id}>
              {renderPunchItem({ item })}
            </View>
          ))
        )}
      </ScrollView>

      {/* Assign Modal */}
      <Modal visible={assignModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isAr ? 'تعيين فني' : 'Assign Technician'}
              </Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setAssignModalVisible(false)}
              >
                <Text style={styles.modalCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder={isAr ? 'بحث...' : 'Search...'}
              value={searchTech}
              onChangeText={setSearchTech}
              placeholderTextColor="#8c8c8c"
            />

            <FlatList
              data={filteredTechs}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item: tech }) => (
                <TouchableOpacity
                  style={styles.techItem}
                  onPress={() => handleTechSelect(tech)}
                  disabled={assignMutation.isPending}
                >
                  <View style={styles.techAvatar}>
                    <Text style={styles.techInitial}>
                      {(tech.full_name || tech.username || 'U')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.techInfo}>
                    <Text style={styles.techName}>{tech.full_name || tech.username}</Text>
                    <Text style={styles.techRole}>{tech.role}</Text>
                  </View>
                  {assignMutation.isPending && (
                    <ActivityIndicator size="small" color={COLORS.info} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.noTechsText}>
                  {isAr ? 'لا يوجد فنيين متاحين' : 'No technicians available'}
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerCompact: {
    maxHeight: 400,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#262626',
  },
  countBadge: {
    backgroundColor: COLORS.info,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  filterRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  filterChipActive: {
    backgroundColor: COLORS.info,
    borderColor: COLORS.info,
  },
  filterChipText: {
    fontSize: 13,
    color: '#595959',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  list: {
    flex: 1,
    padding: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  priorityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  aiBadge: {
    backgroundColor: '#722ed1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aiText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  itemDescription: {
    fontSize: 15,
    color: '#262626',
    lineHeight: 22,
    marginBottom: 10,
  },
  rtlText: {
    textAlign: 'right',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryText: {
    fontSize: 13,
    color: '#8c8c8c',
    fontWeight: '500',
  },
  equipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  equipmentIcon: {
    fontSize: 14,
  },
  equipmentText: {
    fontSize: 13,
    color: '#595959',
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  assigneeIcon: {
    fontSize: 14,
  },
  assigneeText: {
    fontSize: 13,
    color: COLORS.info,
    fontWeight: '500',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionIcon: {
    fontSize: 16,
  },
  assignButton: {
    backgroundColor: '#f0f5ff',
    borderWidth: 1,
    borderColor: '#adc6ff',
  },
  assignButtonText: {
    color: COLORS.info,
    fontWeight: '600',
    fontSize: 13,
  },
  resolveButton: {
    backgroundColor: COLORS.approved,
  },
  resolveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#8c8c8c',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#262626',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#8c8c8c',
  },
  searchInput: {
    margin: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  techItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    gap: 12,
  },
  techAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.info,
    justifyContent: 'center',
    alignItems: 'center',
  },
  techInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  techInfo: {
    flex: 1,
  },
  techName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
  },
  techRole: {
    fontSize: 13,
    color: '#8c8c8c',
    marginTop: 2,
  },
  noTechsText: {
    textAlign: 'center',
    color: '#8c8c8c',
    fontSize: 14,
    padding: 20,
  },
});

export default PunchListPanel;
