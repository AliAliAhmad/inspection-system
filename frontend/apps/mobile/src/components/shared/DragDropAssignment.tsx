/**
 * DragDropAssignment Component
 * Drag-and-drop job assignment interface
 * Allows dragging jobs to inspector cards to assign them
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

export interface AssignableJob {
  id: number;
  title: string;
  equipmentName: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedMinutes: number;
  dueDate?: string;
  requiredRole: string;
}

export interface AssignableInspector {
  id: number;
  name: string;
  role: string;
  currentLoad: number;
  maxLoad: number;
  status: 'available' | 'busy' | 'on_leave';
  skills: string[];
}

export interface DragDropAssignmentProps {
  /** Unassigned jobs */
  jobs: AssignableJob[];
  /** Available inspectors */
  inspectors: AssignableInspector[];
  /** Called when job is assigned to inspector */
  onAssign: (jobId: number, inspectorId: number) => Promise<void>;
  /** Called when assignment needs confirmation */
  onAssignConfirm?: (job: AssignableJob, inspector: AssignableInspector) => void;
  /** Whether data is loading */
  isLoading?: boolean;
}

const PRIORITY_CONFIG = {
  critical: { color: '#f5222d', bg: '#fff1f0', icon: '🔴', label: 'Critical', labelAr: 'حرج' },
  high: { color: '#fa541c', bg: '#fff2e8', icon: '🟠', label: 'High', labelAr: 'عالي' },
  medium: { color: '#faad14', bg: '#fffbe6', icon: '🟡', label: 'Medium', labelAr: 'متوسط' },
  low: { color: '#52c41a', bg: '#f6ffed', icon: '🟢', label: 'Low', labelAr: 'منخفض' },
};

const STATUS_CONFIG = {
  available: { color: '#52c41a', label: 'Available', labelAr: 'متاح' },
  busy: { color: '#faad14', label: 'Busy', labelAr: 'مشغول' },
  on_leave: { color: '#d9d9d9', label: 'On Leave', labelAr: 'إجازة' },
};

export function DragDropAssignment({
  jobs,
  inspectors,
  onAssign,
  isLoading = false,
}: DragDropAssignmentProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [selectedJob, setSelectedJob] = useState<AssignableJob | null>(null);
  const [assigningTo, setAssigningTo] = useState<number | null>(null);

  const availableInspectors = useMemo(
    () => inspectors.filter((i) => i.status !== 'on_leave'),
    [inspectors]
  );

  const sortedJobs = useMemo(() => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...jobs].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }, [jobs]);

  const handleJobSelect = useCallback(
    (job: AssignableJob) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelectedJob(selectedJob?.id === job.id ? null : job);
    },
    [selectedJob]
  );

  const handleAssign = useCallback(
    async (inspector: AssignableInspector) => {
      if (!selectedJob) return;

      const loadPct = Math.round(
        ((inspector.currentLoad + 1) / inspector.maxLoad) * 100
      );
      const isOverloaded = loadPct > 100;

      const message = isAr
        ? `تعيين "${selectedJob.title}" إلى ${inspector.name}؟${
            isOverloaded ? '\n⚠️ هذا سيتجاوز الحمل الأقصى!' : ''
          }`
        : `Assign "${selectedJob.title}" to ${inspector.name}?${
            isOverloaded ? '\n⚠️ This will exceed max workload!' : ''
          }`;

      Alert.alert(
        isAr ? 'تأكيد التعيين' : 'Confirm Assignment',
        message,
        [
          { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
          {
            text: isAr ? 'تعيين' : 'Assign',
            onPress: async () => {
              setAssigningTo(inspector.id);
              try {
                await onAssign(selectedJob.id, inspector.id);
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                );
                setSelectedJob(null);
              } catch (err) {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Error
                );
                Alert.alert(
                  isAr ? 'خطأ' : 'Error',
                  isAr ? 'فشل التعيين' : 'Assignment failed'
                );
              } finally {
                setAssigningTo(null);
              }
            },
          },
        ]
      );
    },
    [selectedJob, onAssign, isAr]
  );

  return (
    <View style={styles.container}>
      {/* Unassigned Jobs Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isAr && styles.rtlText]}>
          {isAr ? `📋 مهام غير معيّنة (${sortedJobs.length})` : `📋 Unassigned Jobs (${sortedJobs.length})`}
        </Text>

        {sortedJobs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {isAr ? '✅ جميع المهام معيّنة' : '✅ All jobs assigned'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={sortedJobs}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.jobList}
            renderItem={({ item }) => {
              const priority = PRIORITY_CONFIG[item.priority];
              const isSelected = selectedJob?.id === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.jobCard,
                    { borderColor: priority.color },
                    isSelected && styles.selectedJobCard,
                  ]}
                  onPress={() => handleJobSelect(item)}
                >
                  <View style={[styles.jobHeader, isAr && styles.rtlRow]}>
                    <Text style={styles.jobPriority}>{priority.icon}</Text>
                    <Text
                      style={[styles.jobTitle, isAr && styles.rtlText]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                  </View>
                  <Text
                    style={[styles.jobEquipment, isAr && styles.rtlText]}
                    numberOfLines={1}
                  >
                    🔧 {item.equipmentName}
                  </Text>
                  <View style={[styles.jobMeta, isAr && styles.rtlRow]}>
                    <Text style={styles.jobMetaText}>
                      ⏱ {item.estimatedMinutes}m
                    </Text>
                    {item.dueDate && (
                      <Text style={styles.jobMetaText}>
                        📅{' '}
                        {new Date(item.dueDate).toLocaleDateString(
                          isAr ? 'ar' : 'en',
                          { month: 'short', day: 'numeric' }
                        )}
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <Text style={styles.tapHint}>
                      {isAr ? '👇 اختر المفتش أدناه' : '👇 Select inspector below'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {/* Inspectors Grid */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isAr && styles.rtlText]}>
          {isAr ? '👥 المفتشون' : '👥 Inspectors'}
          {selectedJob && (
            <Text style={styles.assignHint}>
              {' '}
              — {isAr ? 'انقر للتعيين' : 'tap to assign'}
            </Text>
          )}
        </Text>

        <View style={styles.inspectorGrid}>
          {availableInspectors.map((inspector) => {
            const loadPct = Math.round(
              (inspector.currentLoad / inspector.maxLoad) * 100
            );
            const loadColor =
              loadPct >= 90
                ? '#f5222d'
                : loadPct >= 70
                ? '#faad14'
                : '#52c41a';
            const statusConfig = STATUS_CONFIG[inspector.status];
            const isAssigning = assigningTo === inspector.id;

            return (
              <TouchableOpacity
                key={inspector.id}
                style={[
                  styles.inspectorCard,
                  selectedJob && styles.inspectorSelectable,
                  isAssigning && styles.inspectorAssigning,
                ]}
                onPress={() => selectedJob && handleAssign(inspector)}
                disabled={!selectedJob || isAssigning}
              >
                <View style={[styles.inspectorTop, isAr && styles.rtlRow]}>
                  <View
                    style={[
                      styles.inspectorAvatar,
                      { borderColor: statusConfig.color },
                    ]}
                  >
                    <Text style={styles.inspectorInitial}>
                      {inspector.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={[styles.inspectorInfo, isAr && { alignItems: 'flex-end' }]}>
                    <Text style={[styles.inspectorName, isAr && styles.rtlText]} numberOfLines={1}>
                      {inspector.name}
                    </Text>
                    <Text style={[styles.inspectorRole, isAr && styles.rtlText]}>
                      {isAr ? statusConfig.labelAr : statusConfig.label}
                    </Text>
                  </View>
                </View>

                {/* Workload bar */}
                <View style={styles.loadRow}>
                  <View style={styles.loadBarBg}>
                    <View
                      style={[
                        styles.loadBarFill,
                        {
                          width: `${Math.min(loadPct, 100)}%`,
                          backgroundColor: loadColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.loadText, { color: loadColor }]}>
                    {inspector.currentLoad}/{inspector.maxLoad}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#262626',
  },
  assignHint: {
    fontSize: 12,
    fontWeight: '400',
    color: '#1677ff',
  },
  jobList: {
    gap: 10,
    paddingVertical: 4,
  },
  jobCard: {
    width: width * 0.55,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 2,
    borderLeftWidth: 4,
    elevation: 1,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.08)',
  },
  selectedJobCard: {
    backgroundColor: '#e6f4ff',
    borderColor: '#1677ff',
    elevation: 3,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.15)',
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  jobPriority: {
    fontSize: 12,
  },
  jobTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#262626',
    flex: 1,
  },
  jobEquipment: {
    fontSize: 11,
    color: '#595959',
  },
  jobMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  jobMetaText: {
    fontSize: 10,
    color: '#8c8c8c',
  },
  tapHint: {
    fontSize: 11,
    color: '#1677ff',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  inspectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inspectorCard: {
    width: (width - 48) / 2,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  inspectorSelectable: {
    borderColor: '#91caff',
    borderStyle: 'dashed',
  },
  inspectorAssigning: {
    opacity: 0.5,
  },
  inspectorTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inspectorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  inspectorInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: '#595959',
  },
  inspectorInfo: {
    flex: 1,
    gap: 1,
  },
  inspectorName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#262626',
  },
  inspectorRole: {
    fontSize: 10,
    color: '#8c8c8c',
  },
  loadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loadBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loadBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  loadText: {
    fontSize: 10,
    fontWeight: '600',
    width: 28,
    textAlign: 'right',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 16,
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

export default DragDropAssignment;
