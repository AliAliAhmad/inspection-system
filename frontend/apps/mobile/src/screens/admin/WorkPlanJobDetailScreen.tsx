import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  FlatList,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { workPlansApi, usersApi } from '@inspection/shared';
import type { WorkPlanJob, User } from '@inspection/shared';

const JOB_TYPE_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  pm: { emoji: '🔧', label: 'PM', color: '#1976D2' },
  defect: { emoji: '🔴', label: 'Defect', color: '#E53935' },
  inspection: { emoji: '✅', label: 'Inspection', color: '#4CAF50' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#4CAF50' },
  high: { label: 'High', color: '#FF9800' },
  critical: { label: 'Critical', color: '#F44336' },
};

export default function WorkPlanJobDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const { jobId, planId, dayId } = route.params;
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'lead' | 'member'>('member');

  // Fetch job details
  const { data: planData, isLoading } = useQuery({
    queryKey: ['work-plans', planId],
    queryFn: () => workPlansApi.list({ week_start: '', include_days: true }),
  });

  // Find the job
  const job: WorkPlanJob | undefined = planData?.data?.work_plans?.[0]?.days
    ?.flatMap((d: any) => [...(d.jobs_east || []), ...(d.jobs_west || []), ...(d.jobs_both || [])])
    ?.find((j: WorkPlanJob) => j.id === jobId);

  // Fetch available users
  const { data: usersData } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ is_active: true, per_page: 100 }),
    enabled: assignModalVisible,
  });

  const availableUsers = usersData?.data?.data?.filter(
    (u: User) => u.role !== 'admin' && !job?.assignments?.some(a => a.user_id === u.id)
  ) || [];

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: ({ userId, isLead }: { userId: number; isLead: boolean }) =>
      workPlansApi.assignUser(planId, jobId, { user_id: userId, is_lead: isLead }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      setAssignModalVisible(false);
      Alert.alert('Success', 'User assigned to job');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to assign user');
    },
  });

  // Unassign mutation
  const unassignMutation = useMutation({
    mutationFn: (assignmentId: number) =>
      workPlansApi.unassignUser(planId, jobId, assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      Alert.alert('Success', 'User removed from job');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to remove user');
    },
  });

  // Mark urgent mutation
  const updatePriorityMutation = useMutation({
    mutationFn: (priority: string) =>
      workPlansApi.updateJob(planId, jobId, { priority }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      Alert.alert('Success', 'Priority updated');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update priority');
    },
  });

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleMessage = (phone: string) => {
    Linking.openURL(`sms:${phone}`);
  };

  const handleAssignUser = (user: User) => {
    assignMutation.mutate({ userId: user.id, isLead: selectedRole === 'lead' });
  };

  const handleUnassign = (assignmentId: number, userName: string) => {
    Alert.alert(
      'Remove from Team',
      `Remove ${userName} from this job?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => unassignMutation.mutate(assignmentId) },
      ]
    );
  };

  const handleMarkUrgent = () => {
    const currentPriority = job?.priority || 'normal';
    const newPriority = currentPriority === 'urgent' ? 'normal' : 'urgent';

    Alert.alert(
      newPriority === 'urgent' ? 'Mark as Urgent' : 'Remove Urgent',
      `${newPriority === 'urgent' ? 'Mark' : 'Unmark'} this job as urgent?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => updatePriorityMutation.mutate(newPriority) },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Job not found</Text>
      </View>
    );
  }

  const typeConfig = JOB_TYPE_CONFIG[job.job_type] || JOB_TYPE_CONFIG.pm;
  const priority = job.computed_priority || job.priority || 'normal';
  const priorityConfig = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header Card */}
        <View style={[styles.headerCard, { borderLeftColor: typeConfig.color }]}>
          <View style={styles.headerRow}>
            <Text style={styles.typeEmoji}>{typeConfig.emoji}</Text>
            <View style={styles.headerInfo}>
              <Text style={styles.jobType}>{typeConfig.label}</Text>
              <Text style={styles.equipmentName}>
                {job.equipment?.serial_number || job.equipment?.name || 'N/A'}
              </Text>
            </View>
            <View style={[styles.priorityBadge, { backgroundColor: priorityConfig.color }]}>
              <Text style={styles.priorityText}>{priorityConfig.label}</Text>
            </View>
          </View>

          {job.description && (
            <Text style={styles.description}>{job.description}</Text>
          )}
        </View>

        {/* SAP Order */}
        {job.sap_order_number ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>SAP Order</Text>
            <Text style={styles.infoValue}>{job.sap_order_number}</Text>
          </View>
        ) : (
          <View style={[styles.infoCard, styles.warningCard]}>
            <Text style={styles.warningText}>⚠️ No SAP Order Number</Text>
          </View>
        )}

        {/* Overdue */}
        {job.overdue_value && job.overdue_value > 0 && (
          <View style={[styles.infoCard, styles.overdueCard]}>
            <Text style={styles.overdueText}>
              ⏰ Overdue by {job.overdue_value} {job.overdue_unit}
            </Text>
          </View>
        )}

        {/* Details Grid */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Est. Hours</Text>
            <Text style={styles.detailValue}>{job.estimated_hours}h</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Berth</Text>
            <Text style={styles.detailValue}>{job.berth?.toUpperCase() || 'Both'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Cycle</Text>
            <Text style={styles.detailValue}>{job.cycle?.display_label || 'N/A'}</Text>
          </View>
        </View>

        {/* Team Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>👥 Team</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setAssignModalVisible(true)}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {job.assignments && job.assignments.length > 0 ? (
          job.assignments.map((assignment) => (
            <View key={assignment.id} style={styles.teamMemberCard}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {assignment.is_lead ? '👑 ' : '👤 '}
                  {assignment.user?.full_name}
                </Text>
                <Text style={styles.memberRole}>
                  {assignment.user?.role} • {assignment.user?.specialization || 'General'}
                </Text>
              </View>
              <View style={styles.memberActions}>
                {assignment.user?.phone && (
                  <>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleCall(assignment.user!.phone!)}
                    >
                      <Text style={styles.actionIcon}>📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleMessage(assignment.user!.phone!)}
                    >
                      <Text style={styles.actionIcon}>💬</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity
                  style={[styles.actionButton, styles.removeButton]}
                  onPress={() => handleUnassign(assignment.id, assignment.user?.full_name || '')}
                >
                  <Text style={styles.removeIcon}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyTeam}>
            <Text style={styles.emptyTeamText}>No team members assigned</Text>
            <TouchableOpacity
              style={styles.assignNowButton}
              onPress={() => setAssignModalVisible(true)}
            >
              <Text style={styles.assignNowText}>Assign Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Materials Section */}
        {job.materials && job.materials.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🔩 Materials</Text>
            </View>
            {job.materials.map((m) => (
              <View key={m.id} style={styles.materialItem}>
                <Text style={styles.materialName}>{m.material?.name}</Text>
                <Text style={styles.materialQty}>{m.quantity} {m.material?.unit}</Text>
              </View>
            ))}
          </>
        )}

        {/* Notes */}
        {job.notes && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📝 Notes</Text>
            </View>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{job.notes}</Text>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.quickButton, job.priority === 'urgent' && styles.urgentActive]}
          onPress={handleMarkUrgent}
        >
          <Text style={styles.quickButtonText}>
            {job.priority === 'urgent' ? '🔥 Urgent' : '⚡ Mark Urgent'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickButton}
          onPress={() => setAssignModalVisible(true)}
        >
          <Text style={styles.quickButtonText}>👤 Assign</Text>
        </TouchableOpacity>
      </View>

      {/* Assign Modal */}
      <Modal
        visible={assignModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Assign Team Member</Text>
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
                👑 As Lead
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleButton, selectedRole === 'member' && styles.roleButtonActive]}
              onPress={() => setSelectedRole('member')}
            >
              <Text style={[styles.roleButtonText, selectedRole === 'member' && styles.roleButtonTextActive]}>
                👤 As Member
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={availableUsers}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item: user }) => (
              <TouchableOpacity
                style={styles.userItem}
                onPress={() => handleAssignUser(user)}
              >
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.full_name}</Text>
                  <Text style={styles.userRole}>{user.role} • {user.specialization || 'General'}</Text>
                </View>
                <Text style={styles.selectIcon}>+</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.noUsersText}>No available users</Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#E53935' },
  scrollView: { flex: 1 },

  headerCard: {
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  typeEmoji: { fontSize: 28, marginRight: 12 },
  headerInfo: { flex: 1 },
  jobType: { fontSize: 13, color: '#757575', fontWeight: '500' },
  equipmentName: { fontSize: 18, fontWeight: 'bold', color: '#212121' },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  priorityText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  description: { marginTop: 12, fontSize: 14, color: '#616161', lineHeight: 20 },

  infoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    padding: 14,
  },
  infoLabel: { fontSize: 12, color: '#757575', marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: '600', color: '#212121' },
  warningCard: { backgroundColor: '#FFF3E0' },
  warningText: { fontSize: 14, color: '#E65100', fontWeight: '500' },
  overdueCard: { backgroundColor: '#FFEBEE' },
  overdueText: { fontSize: 14, color: '#C62828', fontWeight: '500' },

  detailsGrid: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  detailItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  detailLabel: { fontSize: 11, color: '#757575', marginBottom: 4 },
  detailValue: { fontSize: 16, fontWeight: 'bold', color: '#1976D2' },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#424242' },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1976D2',
    borderRadius: 16,
  },
  addButtonText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  teamMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    padding: 12,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  memberRole: { fontSize: 12, color: '#757575', marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: { fontSize: 16 },
  removeButton: { backgroundColor: '#FFEBEE' },
  removeIcon: { fontSize: 14, color: '#E53935' },

  emptyTeam: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyTeamText: { fontSize: 14, color: '#757575', marginBottom: 12 },
  assignNowButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 20,
  },
  assignNowText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  materialItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 8,
    padding: 12,
  },
  materialName: { fontSize: 14, color: '#424242' },
  materialQty: { fontSize: 14, fontWeight: '600', color: '#1976D2' },

  notesCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    borderRadius: 10,
    padding: 14,
  },
  notesText: { fontSize: 14, color: '#616161', lineHeight: 20 },

  quickActions: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 10,
  },
  quickButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    alignItems: 'center',
  },
  quickButtonText: { fontSize: 14, fontWeight: '600', color: '#424242' },
  urgentActive: { backgroundColor: '#FFEBEE' },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#212121' },
  modalClose: { fontSize: 20, color: '#757575', padding: 4 },

  roleSelector: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  userRole: { fontSize: 12, color: '#757575', marginTop: 2 },
  selectIcon: { fontSize: 24, color: '#1976D2' },
  noUsersText: { textAlign: 'center', color: '#757575', padding: 40 },
});
