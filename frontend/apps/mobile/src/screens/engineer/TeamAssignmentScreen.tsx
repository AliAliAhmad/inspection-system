import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  inspectionAssignmentsApi,
  usersApi,
} from '@inspection/shared';
import type {
  InspectionList,
  InspectionAssignment,
  User,
} from '@inspection/shared';

export default function TeamAssignmentScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Generate list form
  const [targetDate, setTargetDate] = useState('');
  const [shift, setShift] = useState<'day' | 'night'>('day');

  // Expanded lists
  const [expandedListId, setExpandedListId] = useState<number | null>(null);

  // Inspector picker modal
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [pickerType, setPickerType] = useState<'mechanical' | 'electrical'>('mechanical');
  const [currentAssignmentId, setCurrentAssignmentId] = useState<number | null>(null);
  const [selectedMechId, setSelectedMechId] = useState<number | null>(null);
  const [selectedElecId, setSelectedElecId] = useState<number | null>(null);
  const [assigningAssignmentId, setAssigningAssignmentId] = useState<number | null>(null);

  // Queries
  const listsQuery = useQuery({
    queryKey: ['inspection-lists'],
    queryFn: () => inspectionAssignmentsApi.getLists(),
  });

  const mechInspectorsQuery = useQuery({
    queryKey: ['inspectors', 'mechanical'],
    queryFn: () => usersApi.list({ role: 'inspector', is_active: true }),
  });

  const elecInspectorsQuery = useQuery({
    queryKey: ['inspectors', 'electrical'],
    queryFn: () => usersApi.list({ role: 'inspector', is_active: true }),
  });

  const inspectionLists: InspectionList[] = (listsQuery.data?.data as any)?.items ?? (listsQuery.data?.data as any)?.data ?? (listsQuery.data?.data as any) ?? [];

  const allMechInspectors: User[] = ((mechInspectorsQuery.data?.data as any)?.items ?? (mechInspectorsQuery.data?.data as any)?.data ?? (mechInspectorsQuery.data?.data as any) ?? [])
    .filter((u: User) => u.specialization === 'mechanical');

  const allElecInspectors: User[] = ((elecInspectorsQuery.data?.data as any)?.items ?? (elecInspectorsQuery.data?.data as any)?.data ?? (elecInspectorsQuery.data?.data as any) ?? [])
    .filter((u: User) => u.specialization === 'electrical');

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (payload: { target_date: string; shift: 'day' | 'night' }) =>
      inspectionAssignmentsApi.generateList(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-lists'] });
      Alert.alert(t('common.success', 'Success'), t('assignments.list_generated', 'Inspection list generated.'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('assignments.generate_failed', 'Failed to generate list.'));
    },
  });

  const assignTeamMutation = useMutation({
    mutationFn: ({ assignmentId, mechId, elecId }: { assignmentId: number; mechId: number; elecId: number }) =>
      inspectionAssignmentsApi.assignTeam(assignmentId, {
        mechanical_inspector_id: mechId,
        electrical_inspector_id: elecId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-lists'] });
      setSelectedMechId(null);
      setSelectedElecId(null);
      setAssigningAssignmentId(null);
      Alert.alert(t('common.success', 'Success'), t('assignments.team_assigned', 'Team assigned successfully.'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('assignments.assign_failed', 'Failed to assign team.'));
    },
  });

  const handleGenerate = () => {
    if (!targetDate) {
      Alert.alert(t('common.error', 'Error'), t('assignments.enter_date', 'Please enter a target date.'));
      return;
    }
    generateMutation.mutate({ target_date: targetDate, shift });
  };

  const openPicker = (type: 'mechanical' | 'electrical', assignmentId: number) => {
    setPickerType(type);
    setCurrentAssignmentId(assignmentId);
    setPickerModalVisible(true);
  };

  const handleSelectInspector = (user: User) => {
    if (currentAssignmentId === null) return;
    if (pickerType === 'mechanical') {
      setSelectedMechId(user.id);
    } else {
      setSelectedElecId(user.id);
    }
    setAssigningAssignmentId(currentAssignmentId);
    setPickerModalVisible(false);
  };

  const handleAssign = (assignmentId: number) => {
    if (!selectedMechId || !selectedElecId) {
      Alert.alert(t('common.error', 'Error'), t('assignments.select_both', 'Please select both mechanical and electrical inspectors.'));
      return;
    }
    assignTeamMutation.mutate({
      assignmentId,
      mechId: selectedMechId,
      elecId: selectedElecId,
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const getInspectorName = (id: number | null, type: 'mechanical' | 'electrical') => {
    if (!id) return t('assignments.not_selected', 'Not selected');
    const list = type === 'mechanical' ? allMechInspectors : allElecInspectors;
    const user = list.find((u) => u.id === id);
    return user?.full_name ?? `#${id}`;
  };

  const toggleExpand = (listId: number) => {
    setExpandedListId((prev) => (prev === listId ? null : listId));
    setSelectedMechId(null);
    setSelectedElecId(null);
    setAssigningAssignmentId(null);
  };

  const renderAssignment = (assignment: InspectionAssignment) => {
    const equipmentName = assignment.equipment?.name ?? `Equipment #${assignment.equipment_id}`;
    const equipmentType = assignment.equipment?.equipment_type ?? '';
    const isAssigning = assigningAssignmentId === assignment.id;
    const isAssigned = !!assignment.mechanical_inspector_id && !!assignment.electrical_inspector_id;

    return (
      <View key={assignment.id} style={styles.assignmentCard}>
        <View style={styles.assignmentHeader}>
          <Text style={styles.equipmentName}>{equipmentName}</Text>
          {isAssigned && (
            <View style={styles.assignedBadge}>
              <Text style={styles.assignedBadgeText}>{t('status.assigned', 'Assigned')}</Text>
            </View>
          )}
        </View>

        {equipmentType ? (
          <Text style={styles.detailText}>
            {t('equipment.type', 'Type')}: {equipmentType}
          </Text>
        ) : null}
        {assignment.berth ? (
          <Text style={styles.detailText}>
            {t('equipment.berth', 'Berth')}: {assignment.berth}
          </Text>
        ) : null}

        {!isAssigned && (
          <View style={styles.inspectorSelection}>
            <TouchableOpacity
              style={styles.inspectorBtn}
              onPress={() => openPicker('mechanical', assignment.id)}
            >
              <Text style={styles.inspectorBtnLabel}>{t('assignments.mechanical', 'Mechanical')}</Text>
              <Text style={styles.inspectorBtnValue} numberOfLines={1}>
                {isAssigning && selectedMechId
                  ? getInspectorName(selectedMechId, 'mechanical')
                  : assignment.mechanical_inspector_id
                    ? `#${assignment.mechanical_inspector_id}`
                    : t('assignments.select', 'Select')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.inspectorBtn}
              onPress={() => openPicker('electrical', assignment.id)}
            >
              <Text style={styles.inspectorBtnLabel}>{t('assignments.electrical', 'Electrical')}</Text>
              <Text style={styles.inspectorBtnValue} numberOfLines={1}>
                {isAssigning && selectedElecId
                  ? getInspectorName(selectedElecId, 'electrical')
                  : assignment.electrical_inspector_id
                    ? `#${assignment.electrical_inspector_id}`
                    : t('assignments.select', 'Select')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!isAssigned && isAssigning && selectedMechId && selectedElecId && (
          <TouchableOpacity
            style={[styles.assignBtn, assignTeamMutation.isPending && styles.disabledButton]}
            onPress={() => handleAssign(assignment.id)}
            disabled={assignTeamMutation.isPending}
          >
            {assignTeamMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.assignBtnText}>{t('assignments.assign_team', 'Assign Team')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderListItem = ({ item }: { item: InspectionList }) => {
    const isExpanded = expandedListId === item.id;
    const assignmentCount = item.assignments?.length ?? 0;

    return (
      <View style={styles.listCard}>
        <TouchableOpacity style={styles.listHeader} onPress={() => toggleExpand(item.id)} activeOpacity={0.7}>
          <View style={styles.listHeaderLeft}>
            <Text style={styles.listDate}>{formatDate(item.target_date)}</Text>
            <View style={[styles.shiftBadge, item.shift === 'night' ? styles.shiftNight : styles.shiftDay]}>
              <Text style={styles.shiftBadgeText}>
                {item.shift === 'day' ? t('shifts.day', 'Day') : t('shifts.night', 'Night')}
              </Text>
            </View>
          </View>
          <View style={styles.listHeaderRight}>
            <Text style={styles.countText}>{assignmentCount} {t('assignments.assignments', 'assignments')}</Text>
            <Text style={styles.expandIcon}>{isExpanded ? '\u25B2' : '\u25BC'}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && item.assignments && item.assignments.length > 0 && (
          <View style={styles.assignmentsList}>
            {item.assignments.map(renderAssignment)}
          </View>
        )}

        {isExpanded && (!item.assignments || item.assignments.length === 0) && (
          <Text style={styles.noAssignmentsText}>
            {t('assignments.no_assignments', 'No assignments in this list.')}
          </Text>
        )}
      </View>
    );
  };

  const renderEmpty = () => {
    if (listsQuery.isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('assignments.no_lists', 'No Inspection Lists')}</Text>
        <Text style={styles.emptySubtitle}>
          {t('assignments.no_lists_message', 'Generate a new list to get started.')}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={listsQuery.isRefetching} onRefresh={listsQuery.refetch} />
        }
      >
        <Text style={styles.title}>{t('assignments.team_assignment', 'Team Assignment')}</Text>

        {/* Generate List Form */}
        <View style={styles.generateSection}>
          <Text style={styles.sectionHeader}>{t('assignments.generate_list', 'Generate List')}</Text>

          <Text style={styles.fieldLabel}>{t('assignments.target_date', 'Target Date')}</Text>
          <TextInput
            style={styles.input}
            value={targetDate}
            onChangeText={setTargetDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#999"
          />

          <Text style={styles.fieldLabel}>{t('users.shift', 'Shift')}</Text>
          <View style={styles.shiftToggle}>
            <TouchableOpacity
              style={[styles.shiftOption, shift === 'day' && styles.shiftOptionActive]}
              onPress={() => setShift('day')}
            >
              <Text style={[styles.shiftOptionText, shift === 'day' && styles.shiftOptionTextActive]}>
                {t('shifts.day', 'Day')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shiftOption, shift === 'night' && styles.shiftOptionActive]}
              onPress={() => setShift('night')}
            >
              <Text style={[styles.shiftOptionText, shift === 'night' && styles.shiftOptionTextActive]}>
                {t('shifts.night', 'Night')}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.generateBtn, generateMutation.isPending && styles.disabledButton]}
            onPress={handleGenerate}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.generateBtnText}>{t('assignments.generate', 'Generate List')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Lists */}
        <Text style={styles.sectionHeader}>{t('assignments.inspection_lists', 'Inspection Lists')}</Text>

        {listsQuery.isLoading ? (
          <ActivityIndicator size="large" color="#1976D2" style={{ marginVertical: 32 }} />
        ) : inspectionLists.length === 0 ? (
          renderEmpty()
        ) : (
          inspectionLists.map((list) => (
            <View key={list.id}>
              {renderListItem({ item: list })}
            </View>
          ))
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Inspector Picker Modal */}
      <Modal visible={pickerModalVisible} animationType="slide" transparent onRequestClose={() => setPickerModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {pickerType === 'mechanical'
                ? t('assignments.select_mechanical', 'Select Mechanical Inspector')
                : t('assignments.select_electrical', 'Select Electrical Inspector')}
            </Text>

            {(pickerType === 'mechanical' ? mechInspectorsQuery.isLoading : elecInspectorsQuery.isLoading) ? (
              <ActivityIndicator size="large" color="#1976D2" style={{ marginVertical: 32 }} />
            ) : (
              <FlatList
                data={pickerType === 'mechanical' ? allMechInspectors : allElecInspectors}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.candidateCard}
                    onPress={() => handleSelectInspector(item)}
                  >
                    <Text style={styles.candidateName}>{item.full_name}</Text>
                    <Text style={styles.candidateDetail}>
                      {item.employee_id} | {item.shift ?? '-'} | {item.specialization ?? '-'}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptySubtitle}>
                    {t('assignments.no_inspectors', 'No inspectors available for this specialization.')}
                  </Text>
                }
                style={{ maxHeight: 400 }}
              />
            )}

            <TouchableOpacity style={styles.cancelButton} onPress={() => setPickerModalVisible(false)}>
              <Text style={styles.cancelButtonText}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContainer: { flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#424242',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  generateSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 8, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#fafafa',
  },
  shiftToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  shiftOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
  },
  shiftOptionActive: { backgroundColor: '#1976D2' },
  shiftOptionText: { fontSize: 14, fontWeight: '600', color: '#555' },
  shiftOptionTextActive: { color: '#fff' },
  generateBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  listCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
    elevation: 2,
    overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  listHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listDate: { fontSize: 16, fontWeight: '700', color: '#212121' },
  shiftBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  shiftDay: { backgroundColor: '#FFF3E0' },
  shiftNight: { backgroundColor: '#E8EAF6' },
  shiftBadgeText: { fontSize: 12, fontWeight: '500', color: '#424242' },
  countText: { fontSize: 13, color: '#757575' },
  expandIcon: { fontSize: 12, color: '#757575' },
  assignmentsList: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    padding: 12,
  },
  assignmentCard: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  equipmentName: { fontSize: 15, fontWeight: '700', color: '#212121', flex: 1, marginRight: 8 },
  assignedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#4CAF50' },
  assignedBadgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  detailText: { fontSize: 13, color: '#757575', marginBottom: 2 },
  inspectorSelection: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  inspectorBtn: {
    flex: 1,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  inspectorBtnLabel: { fontSize: 11, color: '#1565C0', fontWeight: '600', marginBottom: 4 },
  inspectorBtnValue: { fontSize: 13, color: '#212121', fontWeight: '500' },
  assignBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  assignBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  noAssignmentsText: {
    textAlign: 'center',
    color: '#757575',
    padding: 16,
    fontSize: 14,
  },
  emptyContainer: { alignItems: 'center', paddingTop: 32, paddingBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', paddingHorizontal: 16 },
  bottomSpacer: { height: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#212121', marginBottom: 16 },
  candidateCard: {
    padding: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  candidateName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  candidateDetail: { fontSize: 13, color: '#757575', marginTop: 2 },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    marginTop: 12,
  },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#424242' },
  disabledButton: { opacity: 0.6 },
});
