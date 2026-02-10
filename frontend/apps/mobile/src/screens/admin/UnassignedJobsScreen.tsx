import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { workPlansApi, usersApi } from '@inspection/shared';
import type { WorkPlanJob, User } from '@inspection/shared';

const JOB_TYPE_EMOJI: Record<string, string> = {
  pm: '🔧',
  defect: '🔴',
  inspection: '✅',
};

const PRIORITY_COLORS: Record<string, string> = {
  normal: '#4CAF50',
  high: '#FF9800',
  critical: '#F44336',
};

export default function UnassignedJobsScreen() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { planId } = route.params;

  const [selectedJob, setSelectedJob] = useState<WorkPlanJob | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'lead' | 'member'>('lead');

  // Fetch work plan
  const { data: planData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['work-plans', planId],
    queryFn: () => workPlansApi.get(planId),
  });

  const workPlan = (planData?.data as any)?.data ?? (planData?.data as any)?.work_plan;

  // Get all unassigned jobs
  const unassignedJobs = useMemo(() => {
    if (!workPlan?.days) return [];

    const jobs: (WorkPlanJob & { dayDate: string })[] = [];

    workPlan.days.forEach((day: any) => {
      const allJobs = [
        ...(day.jobs_east || []),
        ...(day.jobs_west || []),
        ...(day.jobs_both || []),
      ];

      allJobs.forEach((job: WorkPlanJob) => {
        if (!job.assignments || job.assignments.length === 0) {
          jobs.push({ ...job, dayDate: day.date });
        }
      });
    });

    // Sort by priority (critical > high > normal) then by date
    return jobs.sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2 };
      const aPriority = priorityOrder[a.computed_priority || a.priority || 'normal'] ?? 2;
      const bPriority = priorityOrder[b.computed_priority || b.priority || 'normal'] ?? 2;

      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(a.dayDate).getTime() - new Date(b.dayDate).getTime();
    });
  }, [workPlan]);

  // Fetch users for assignment
  const { data: usersData } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ is_active: true, per_page: 100 }),
    enabled: assignModalVisible,
  });

  const availableUsers = usersData?.data?.data?.filter((u: User) => u.role !== 'admin') || [];

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: ({ jobId, userId, isLead }: { jobId: number; userId: number; isLead: boolean }) =>
      workPlansApi.assignUser(planId, jobId, { user_id: userId, is_lead: isLead }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      setAssignModalVisible(false);
      setSelectedJob(null);
      Alert.alert('Success', 'User assigned successfully');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to assign user');
    },
  });

  const handleOpenAssign = (job: WorkPlanJob) => {
    setSelectedJob(job);
    setAssignModalVisible(true);
  };

  const handleAssignUser = (user: User) => {
    if (selectedJob) {
      assignMutation.mutate({
        jobId: selectedJob.id,
        userId: user.id,
        isLead: selectedRole === 'lead',
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const renderJob = ({ item: job }: { item: WorkPlanJob & { dayDate: string } }) => {
    const priority = job.computed_priority || job.priority || 'normal';
    const priorityColor = PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal;
    const hasNoSAP = !job.sap_order_number;

    return (
      <TouchableOpacity
        style={[styles.jobCard, { borderLeftColor: priorityColor }]}
        onPress={() => handleOpenAssign(job)}
        activeOpacity={0.7}
      >
        <View style={styles.jobHeader}>
          <Text style={styles.jobEmoji}>{JOB_TYPE_EMOJI[job.job_type] || '📋'}</Text>
          <View style={styles.jobInfo}>
            <Text style={styles.equipmentName} numberOfLines={1}>
              {job.equipment?.serial_number || job.equipment?.name || job.defect?.description?.substring(0, 30) || 'Job'}
            </Text>
            <Text style={styles.dayText}>{formatDate(job.dayDate)}</Text>
          </View>
          <TouchableOpacity
            style={styles.assignButton}
            onPress={() => handleOpenAssign(job)}
          >
            <Text style={styles.assignButtonText}>Assign</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.jobMeta}>
          <View style={[styles.priorityTag, { backgroundColor: priorityColor }]}>
            <Text style={styles.priorityText}>{priority.toUpperCase()}</Text>
          </View>
          <Text style={styles.hoursText}>{job.estimated_hours}h</Text>
          <Text style={styles.berthText}>{job.berth?.toUpperCase() || 'BOTH'}</Text>
          {hasNoSAP && (
            <View style={styles.noSapTag}>
              <Text style={styles.noSapText}>No SAP</Text>
            </View>
          )}
        </View>

        {job.overdue_value && job.overdue_value > 0 && (
          <View style={styles.overdueRow}>
            <Text style={styles.overdueText}>
              ⏰ Overdue: {job.overdue_value} {job.overdue_unit}
            </Text>
          </View>
        )}
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Unassigned Jobs</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{unassignedJobs.length}</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Tap a job to quickly assign a team lead
      </Text>

      {/* Jobs List */}
      <FlatList
        data={unassignedJobs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderJob}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🎉</Text>
            <Text style={styles.emptyTitle}>All Jobs Assigned!</Text>
            <Text style={styles.emptySubtitle}>Every job has a team member assigned</Text>
          </View>
        }
      />

      {/* Assign Modal */}
      <Modal
        visible={assignModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setAssignModalVisible(false);
          setSelectedJob(null);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Assign Team</Text>
              {selectedJob && (
                <Text style={styles.modalSubtitle}>
                  {selectedJob.equipment?.serial_number || 'Job'} • {selectedJob.estimated_hours}h
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Role Selector */}
          <View style={styles.roleSelector}>
            <TouchableOpacity
              style={[styles.roleButton, selectedRole === 'lead' && styles.roleButtonActive]}
              onPress={() => setSelectedRole('lead')}
            >
              <Text style={[styles.roleButtonText, selectedRole === 'lead' && styles.roleButtonTextActive]}>
                👑 Lead
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, selectedRole === 'member' && styles.roleButtonActive]}
              onPress={() => setSelectedRole('member')}
            >
              <Text style={[styles.roleButtonText, selectedRole === 'member' && styles.roleButtonTextActive]}>
                👤 Member
              </Text>
            </TouchableOpacity>
          </View>

          {/* Group by Role */}
          <FlatList
            data={availableUsers}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item: user }) => (
              <TouchableOpacity
                style={styles.userItem}
                onPress={() => handleAssignUser(user)}
                disabled={assignMutation.isPending}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userInitials}>
                    {user.full_name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.full_name}</Text>
                  <Text style={styles.userRole}>
                    {user.role} • {user.specialization || 'General'}
                  </Text>
                </View>
                <Text style={styles.selectIcon}>+</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.noUsersText}>No users available</Text>
            }
          />

          {assignMutation.isPending && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#1976D2" />
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#212121' },
  countBadge: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FF9800',
    borderRadius: 12,
  },
  countText: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  subtitle: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    fontSize: 13,
    color: '#757575',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },

  listContent: { padding: 12 },

  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  jobHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  jobEmoji: { fontSize: 22, marginRight: 10 },
  jobInfo: { flex: 1 },
  equipmentName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  dayText: { fontSize: 12, color: '#757575', marginTop: 2 },
  assignButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1976D2',
    borderRadius: 16,
  },
  assignButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  jobMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priorityTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  hoursText: { fontSize: 12, fontWeight: '600', color: '#1976D2' },
  berthText: { fontSize: 11, color: '#757575' },
  noSapTag: { backgroundColor: '#FFEBEE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  noSapText: { fontSize: 10, color: '#C62828' },

  overdueRow: { marginTop: 8 },
  overdueText: { fontSize: 12, color: '#E65100' },

  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242' },
  emptySubtitle: { fontSize: 14, color: '#757575', marginTop: 4 },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#212121' },
  modalSubtitle: { fontSize: 13, color: '#757575', marginTop: 4 },
  modalClose: { fontSize: 22, color: '#757575', padding: 4 },

  roleSelector: { flexDirection: 'row', padding: 12, gap: 10 },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  roleButtonActive: { backgroundColor: '#1976D2' },
  roleButtonText: { fontSize: 14, fontWeight: '500', color: '#616161' },
  roleButtonTextActive: { color: '#fff' },

  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userInitials: { fontSize: 14, fontWeight: '600', color: '#fff' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  userRole: { fontSize: 12, color: '#757575', marginTop: 2 },
  selectIcon: { fontSize: 28, color: '#1976D2' },
  noUsersText: { textAlign: 'center', color: '#757575', padding: 40 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
