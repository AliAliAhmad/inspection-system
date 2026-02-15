/**
 * BatchApprovalWidget Component
 * Review queue with batch approval/rejection for quality engineers
 * Supports select-all, multi-select, and bulk actions
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

export interface ReviewItem {
  id: number;
  inspectionId: number;
  equipmentName: string;
  inspectorName: string;
  completedAt: string;
  qualityScore: number;
  defectsCount: number;
  photosCount: number;
  status: 'pending' | 'approved' | 'rejected';
  priority: 'high' | 'medium' | 'low';
}

export interface BatchApprovalWidgetProps {
  /** List of items pending review */
  items: ReviewItem[];
  /** Called when items are batch-approved */
  onBatchApprove: (ids: number[]) => Promise<void>;
  /** Called when items are batch-rejected */
  onBatchReject: (ids: number[], reason: string) => Promise<void>;
  /** Called when single item is tapped for detail */
  onItemPress?: (item: ReviewItem) => void;
  /** Whether data is loading */
  isLoading?: boolean;
  /** Max items to show before "show more" */
  maxVisible?: number;
}

const PRIORITY_CONFIG = {
  high: { color: '#f5222d', bg: '#fff1f0', label: 'High', labelAr: 'عالي', icon: '🔴' },
  medium: { color: '#faad14', bg: '#fffbe6', label: 'Medium', labelAr: 'متوسط', icon: '🟡' },
  low: { color: '#52c41a', bg: '#f6ffed', label: 'Low', labelAr: 'منخفض', icon: '🟢' },
};

export function BatchApprovalWidget({
  items,
  onBatchApprove,
  onBatchReject,
  onItemPress,
  isLoading = false,
  maxVisible = 20,
}: BatchApprovalWidgetProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const pendingItems = useMemo(
    () => items.filter((i) => i.status === 'pending'),
    [items]
  );

  const displayItems = showAll ? pendingItems : pendingItems.slice(0, maxVisible);

  const toggleSelect = useCallback((id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedIds.size === pendingItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingItems.map((i) => i.id)));
    }
  }, [pendingItems, selectedIds.size]);

  const handleBatchApprove = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    Alert.alert(
      isAr ? 'تأكيد الموافقة' : 'Confirm Approval',
      isAr
        ? `هل تريد الموافقة على ${count} عنصر؟`
        : `Approve ${count} item${count > 1 ? 's' : ''}?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'موافقة' : 'Approve',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await onBatchApprove(Array.from(selectedIds));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSelectedIds(new Set());
            } catch (err) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                isAr ? 'خطأ' : 'Error',
                isAr ? 'فشلت الموافقة' : 'Approval failed'
              );
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }, [selectedIds, onBatchApprove, isAr]);

  const handleBatchReject = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    Alert.prompt(
      isAr ? 'سبب الرفض' : 'Rejection Reason',
      isAr
        ? `أدخل سبب رفض ${count} عنصر`
        : `Enter reason for rejecting ${count} item${count > 1 ? 's' : ''}`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'رفض' : 'Reject',
          style: 'destructive',
          onPress: async (reason?: string) => {
            if (!reason) return;
            setIsProcessing(true);
            try {
              await onBatchReject(Array.from(selectedIds), reason);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSelectedIds(new Set());
            } catch (err) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ],
      'plain-text'
    );
  }, [selectedIds, onBatchReject, isAr]);

  const renderItem = useCallback(
    ({ item }: { item: ReviewItem }) => {
      const isSelected = selectedIds.has(item.id);
      const priority = PRIORITY_CONFIG[item.priority];
      const scoreColor =
        item.qualityScore >= 80
          ? '#52c41a'
          : item.qualityScore >= 60
          ? '#faad14'
          : '#f5222d';

      return (
        <TouchableOpacity
          style={[styles.itemCard, isSelected && styles.selectedCard]}
          onPress={() => (onItemPress ? onItemPress(item) : toggleSelect(item.id))}
          onLongPress={() => toggleSelect(item.id)}
        >
          {/* Checkbox */}
          <TouchableOpacity
            style={[styles.checkbox, isSelected && styles.checkedBox]}
            onPress={() => toggleSelect(item.id)}
          >
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>

          {/* Content */}
          <View style={[styles.itemContent, isAr && { alignItems: 'flex-end' }]}>
            <View style={[styles.itemTopRow, isAr && styles.rtlRow]}>
              <Text style={[styles.equipmentName, isAr && styles.rtlText]} numberOfLines={1}>
                {item.equipmentName}
              </Text>
              <Text style={[styles.priorityBadge, { color: priority.color, backgroundColor: priority.bg }]}>
                {priority.icon} {isAr ? priority.labelAr : priority.label}
              </Text>
            </View>

            <Text style={[styles.inspectorText, isAr && styles.rtlText]}>
              👤 {item.inspectorName}
            </Text>

            <View style={[styles.statsRow, isAr && styles.rtlRow]}>
              <Text style={[styles.statText, { color: scoreColor }]}>
                ⭐ {item.qualityScore}%
              </Text>
              <Text style={styles.statText}>
                🐛 {item.defectsCount}
              </Text>
              <Text style={styles.statText}>
                📷 {item.photosCount}
              </Text>
              <Text style={styles.dateText}>
                {new Date(item.completedAt).toLocaleDateString(isAr ? 'ar' : 'en', {
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [selectedIds, isAr, onItemPress, toggleSelect]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1677ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with count and select all */}
      <View style={[styles.header, isAr && styles.rtlRow]}>
        <Text style={[styles.headerTitle, isAr && styles.rtlText]}>
          {isAr ? '📋 قائمة المراجعة' : '📋 Review Queue'}
        </Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{pendingItems.length}</Text>
        </View>
      </View>

      {/* Toolbar */}
      {pendingItems.length > 0 && (
        <View style={[styles.toolbar, isAr && styles.rtlRow]}>
          <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
            <View style={[styles.checkbox, selectedIds.size === pendingItems.length && styles.checkedBox]}>
              {selectedIds.size === pendingItems.length && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </View>
            <Text style={styles.selectAllText}>
              {isAr ? 'تحديد الكل' : 'Select All'}
            </Text>
          </TouchableOpacity>

          {selectedIds.size > 0 && (
            <View style={[styles.bulkActions, isAr && styles.rtlRow]}>
              <Text style={styles.selectedCount}>
                {selectedIds.size} {isAr ? 'محدد' : 'selected'}
              </Text>
              <TouchableOpacity
                style={[styles.approveBtn, isProcessing && styles.disabledBtn]}
                onPress={handleBatchApprove}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.approveBtnText}>
                    ✅ {isAr ? 'موافقة' : 'Approve'}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectBtn, isProcessing && styles.disabledBtn]}
                onPress={handleBatchReject}
                disabled={isProcessing}
              >
                <Text style={styles.rejectBtnText}>
                  ❌ {isAr ? 'رفض' : 'Reject'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Items list */}
      {pendingItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={[styles.emptyText, isAr && styles.rtlText]}>
            {isAr ? 'لا توجد مراجعات معلقة' : 'No pending reviews'}
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={displayItems}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            contentContainerStyle={styles.listContent}
          />
          {!showAll && pendingItems.length > maxVisible && (
            <TouchableOpacity
              style={styles.showMoreBtn}
              onPress={() => setShowAll(true)}
            >
              <Text style={styles.showMoreText}>
                {isAr
                  ? `عرض ${pendingItems.length - maxVisible} المزيد`
                  : `Show ${pendingItems.length - maxVisible} more`}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#262626',
    flex: 1,
  },
  headerBadge: {
    backgroundColor: '#1677ff',
    borderRadius: 10,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectAllText: {
    fontSize: 13,
    color: '#595959',
  },
  bulkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedCount: {
    fontSize: 12,
    color: '#8c8c8c',
  },
  approveBtn: {
    backgroundColor: '#52c41a',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  approveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectBtn: {
    backgroundColor: '#fff1f0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#ffa39e',
  },
  rejectBtnText: {
    color: '#f5222d',
    fontSize: 12,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d9d9d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedBox: {
    backgroundColor: '#1677ff',
    borderColor: '#1677ff',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  selectedCard: {
    borderColor: '#1677ff',
    backgroundColor: '#e6f4ff',
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  equipmentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    flex: 1,
  },
  priorityBadge: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  inspectorText: {
    fontSize: 12,
    color: '#595959',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  statText: {
    fontSize: 11,
    color: '#8c8c8c',
    fontWeight: '500',
  },
  dateText: {
    fontSize: 11,
    color: '#bfbfbf',
    marginLeft: 'auto',
  },
  listContent: {
    gap: 6,
  },
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  showMoreText: {
    fontSize: 13,
    color: '#1677ff',
    fontWeight: '500',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 28,
  },
  emptyText: {
    fontSize: 14,
    color: '#8c8c8c',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default BatchApprovalWidget;
