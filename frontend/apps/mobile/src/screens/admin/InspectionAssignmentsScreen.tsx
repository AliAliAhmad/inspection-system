import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionAssignmentsApi, rosterApi } from '@inspection/shared';
import type { AssignTeamPayload } from '@inspection/shared';

const STATUS_COLORS: Record<string, string> = {
  unassigned: '#757575',
  assigned: '#1976D2',
  in_progress: '#FF9800',
  mech_complete: '#9C27B0',
  elec_complete: '#9C27B0',
  both_complete: '#00BCD4',
  assessment_pending: '#FF5722',
  completed: '#4CAF50',
};

const PENDING_LABELS: Record<string, string> = {
  both_inspections: 'Pending: Both inspections',
  mechanical_inspection: 'Pending: Mechanical inspection',
  electrical_inspection: 'Pending: Electrical inspection',
  both_verdicts: 'Pending: Both verdicts',
  mechanical_verdict: 'Pending: Mechanical verdict',
  electrical_verdict: 'Pending: Electrical verdict',
};

interface AssignmentItem {
  id: number;
  equipment_id: number;
  equipment?: {
    name: string;
    equipment_type: string;
    serial_number: string;
    berth?: string;
  };
  berth?: string;
  status: string;
  pending_on?: string;
  mechanical_inspector_id?: number;
  electrical_inspector_id?: number;
  mechanical_inspector?: { id: number; full_name: string };
  electrical_inspector?: { id: number; full_name: string };
  list_target_date: string;
  list_shift: string;
  list_status: string;
}

interface InspectorOption {
  id: number;
  full_name: string;
  role: string;
  specialization: string;
  covering_for?: { id: number; full_name: string };
  isOnLeave?: boolean;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label.replace(/_/g, ' ')}</Text>
    </View>
  );
}

function AssignmentCard({
  assignment,
  onAssign,
}: {
  assignment: AssignmentItem;
  onAssign: (a: AssignmentItem) => void;
}) {
  const statusColor = STATUS_COLORS[assignment.status] ?? '#757575';
  const isCompleted = assignment.status === 'completed';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badgeRow}>
          <Badge label={assignment.status} color={statusColor} />
          <Badge
            label={assignment.list_shift}
            color={assignment.list_shift === 'day' ? '#FFC107' : '#3F51B5'}
          />
        </View>
        <Text style={styles.dateText}>
          {new Date(assignment.list_target_date).toLocaleDateString()}
        </Text>
      </View>

      <Text style={styles.equipmentName}>
        {assignment.equipment?.name || `Equipment #${assignment.equipment_id}`}
      </Text>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Type: </Text>
        <Text style={styles.cardValue}>{assignment.equipment?.equipment_type || '-'}</Text>
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Serial: </Text>
        <Text style={styles.cardValue}>{assignment.equipment?.serial_number || '-'}</Text>
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Berth: </Text>
        <Text style={styles.cardValue}>{assignment.berth || assignment.equipment?.berth || '-'}</Text>
      </View>

      {assignment.pending_on && PENDING_LABELS[assignment.pending_on] && (
        <Text style={styles.pendingText}>{PENDING_LABELS[assignment.pending_on]}</Text>
      )}

      <View style={styles.inspectorsSection}>
        <View style={styles.inspectorRow}>
          <Text style={styles.inspectorLabel}>Mech: </Text>
          <Text style={styles.inspectorValue}>
            {assignment.mechanical_inspector?.full_name || '—'}
          </Text>
        </View>
        <View style={styles.inspectorRow}>
          <Text style={styles.inspectorLabel}>Elec: </Text>
          <Text style={styles.inspectorValue}>
            {assignment.electrical_inspector?.full_name || '—'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.assignButton, isCompleted && styles.assignButtonDisabled]}
        onPress={() => onAssign(assignment)}
        disabled={isCompleted}
      >
        <Text style={[styles.assignButtonText, isCompleted && styles.assignButtonTextDisabled]}>
          {assignment.mechanical_inspector_id ? 'Reassign Team' : 'Assign Team'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function InspectionAssignmentsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page] = useState(1);
  const [selectedShift, setSelectedShift] = useState<'day' | 'night'>('day');
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [inspectorPickerVisible, setInspectorPickerVisible] = useState(false);
  const [inspectorPickerType, setInspectorPickerType] = useState<'mech' | 'elec'>('mech');
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [selectedMechInspector, setSelectedMechInspector] = useState<InspectorOption | null>(null);
  const [selectedElecInspector, setSelectedElecInspector] = useState<InspectorOption | null>(null);
  const [targetDateStr, setTargetDateStr] = useState(new Date().toISOString().split('T')[0]);

  const listsQuery = useQuery({
    queryKey: ['inspection-assignments'],
    queryFn: () =>
      inspectionAssignmentsApi.getLists({ page, per_page: 100 }).then((r) => {
        return (r.data as any);
      }),
  });

  // Flatten all assignments from all lists
  const rawLists: any[] = listsQuery.data?.data ?? [];
  const allAssignments: AssignmentItem[] = [];
  for (const list of rawLists) {
    const assignments = list.assignments || [];
    for (const a of assignments) {
      allAssignments.push({
        ...a,
        list_target_date: list.target_date,
        list_shift: list.shift,
        list_status: list.status,
      });
    }
  }
  // Sort by date descending
  allAssignments.sort((a, b) => (b.list_target_date || '').localeCompare(a.list_target_date || ''));

  // Fetch roster availability when assign modal is open
  const assignmentDate = selectedAssignment?.list_target_date;
  const assignmentShift = selectedAssignment?.list_shift;

  const availabilityQuery = useQuery({
    queryKey: ['roster', 'day-availability', assignmentDate, assignmentShift],
    queryFn: () => rosterApi.getDayAvailability(assignmentDate!, assignmentShift),
    enabled: assignModalVisible && !!assignmentDate && !!assignmentShift,
  });

  const generateMutation = useMutation({
    mutationFn: (payload: { target_date: string; shift: 'day' | 'night' }) =>
      inspectionAssignmentsApi.generateList(payload),
    onSuccess: (res) => {
      const result = (res.data as any)?.data ?? res.data;
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setGenerateModalVisible(false);
      Alert.alert(
        t('common.success', 'Success'),
        t('assignments.generateSuccess', `List generated — ${result?.total_assets ?? 0} assignments created`)
      );
    },
    onError: (err: any) => {
      Alert.alert(
        t('common.error', 'Error'),
        err?.response?.data?.message || t('assignments.generateError', 'Failed to generate list')
      );
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssignTeamPayload }) =>
      inspectionAssignmentsApi.assignTeam(id, payload),
    onSuccess: (res) => {
      const data = res.data as any;
      const autoCount = data.auto_assigned || 0;
      const msg =
        autoCount > 0
          ? `Team assigned (also auto-assigned to ${autoCount} other equipment at same berth)`
          : t('assignments.assignSuccess', 'Team assigned successfully');
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setAssignModalVisible(false);
      setSelectedAssignment(null);
      setSelectedMechInspector(null);
      setSelectedElecInspector(null);
      Alert.alert(t('common.success', 'Success'), msg);
    },
    onError: (err: any) => {
      Alert.alert(
        t('common.error', 'Error'),
        err?.response?.data?.message || t('assignments.assignError', 'Failed to assign team')
      );
    },
  });

  const handleRefresh = useCallback(() => {
    listsQuery.refetch();
  }, [listsQuery]);

  const handleGenerate = () => {
    if (!targetDateStr) {
      Alert.alert(t('common.error', 'Error'), 'Please enter a target date');
      return;
    }
    generateMutation.mutate({ target_date: targetDateStr, shift: selectedShift });
  };

  const handleAssignPress = (assignment: AssignmentItem) => {
    setSelectedAssignment(assignment);
    setSelectedMechInspector(null);
    setSelectedElecInspector(null);
    setAssignModalVisible(true);
  };

  const handleAssignSubmit = () => {
    if (!selectedAssignment) return;
    if (!selectedMechInspector || !selectedElecInspector) {
      Alert.alert(t('common.error', 'Error'), 'Please select both inspectors');
      return;
    }
    assignMutation.mutate({
      id: selectedAssignment.id,
      payload: {
        mechanical_inspector_id: selectedMechInspector.id,
        electrical_inspector_id: selectedElecInspector.id,
      },
    });
  };

  const openInspectorPicker = (type: 'mech' | 'elec') => {
    setInspectorPickerType(type);
    setInspectorPickerVisible(true);
  };

  const selectInspector = (inspector: InspectorOption) => {
    if (inspectorPickerType === 'mech') {
      setSelectedMechInspector(inspector);
    } else {
      setSelectedElecInspector(inspector);
    }
    setInspectorPickerVisible(false);
  };

  // Build inspector options from roster availability
  const availData = (availabilityQuery.data?.data as any)?.data ?? availabilityQuery.data?.data;
  const availableUsers: any[] = availData?.available ?? [];
  const onLeaveUsers: any[] = availData?.on_leave ?? [];

  // Mechanical: inspectors + specialists covering for inspectors
  const mechAvailable: InspectorOption[] = availableUsers
    .filter(
      (u: any) =>
        u.specialization === 'mechanical' &&
        (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for))
    )
    .map((u: any) => ({ ...u, isOnLeave: false }));

  const mechOnLeave: InspectorOption[] = onLeaveUsers
    .filter((u: any) => u.role === 'inspector' && u.specialization === 'mechanical')
    .map((u: any) => ({ ...u, isOnLeave: true }));

  const allMechOptions = [...mechAvailable, ...mechOnLeave];

  // Electrical: inspectors + specialists covering for inspectors
  const elecAvailable: InspectorOption[] = availableUsers
    .filter(
      (u: any) =>
        u.specialization === 'electrical' &&
        (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for))
    )
    .map((u: any) => ({ ...u, isOnLeave: false }));

  const elecOnLeave: InspectorOption[] = onLeaveUsers
    .filter((u: any) => u.role === 'inspector' && u.specialization === 'electrical')
    .map((u: any) => ({ ...u, isOnLeave: true }));

  const allElecOptions = [...elecAvailable, ...elecOnLeave];

  const currentPickerOptions = inspectorPickerType === 'mech' ? allMechOptions : allElecOptions;

  if (listsQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.inspectionAssignments', 'Assignments')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setGenerateModalVisible(true)}>
          <Text style={styles.addButtonText}>+ {t('assignments.generate', 'Generate')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={allAssignments}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <AssignmentCard assignment={item} onAssign={handleAssignPress} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={listsQuery.isRefetching} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {t('assignments.empty', 'No assignments. Click "Generate" to create a list.')}
            </Text>
          </View>
        }
      />

      {/* Generate Modal */}
      <Modal visible={generateModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setGenerateModalVisible(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('assignments.generate', 'Generate List')}</Text>
            <TouchableOpacity onPress={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? (
                <ActivityIndicator size="small" color="#1976D2" />
              ) : (
                <Text style={styles.modalSave}>{t('common.generate', 'Generate')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.fieldLabel}>{t('assignments.targetDate', 'Target Date')}</Text>
            <TextInput
              style={styles.dateInput}
              value={targetDateStr}
              onChangeText={setTargetDateStr}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#999"
            />

            <Text style={styles.fieldLabel}>{t('assignments.shift', 'Shift')}</Text>
            <View style={styles.shiftRow}>
              <TouchableOpacity
                style={[styles.shiftButton, selectedShift === 'day' && styles.shiftButtonActive]}
                onPress={() => setSelectedShift('day')}
              >
                <Text
                  style={[
                    styles.shiftButtonText,
                    selectedShift === 'day' && styles.shiftButtonTextActive,
                  ]}
                >
                  Day
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.shiftButton,
                  selectedShift === 'night' && styles.shiftButtonActiveNight,
                ]}
                onPress={() => setSelectedShift('night')}
              >
                <Text
                  style={[
                    styles.shiftButtonText,
                    selectedShift === 'night' && styles.shiftButtonTextActive,
                  ]}
                >
                  Night
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.noteText}>
              This will generate an inspection list for {targetDateStr || 'the selected date'}{' '}
              {selectedShift} shift based on the configured schedule.
            </Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Assign Team Modal */}
      <Modal visible={assignModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setAssignModalVisible(false);
                setSelectedAssignment(null);
              }}
            >
              <Text style={styles.modalCancel}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('assignments.assignTeam', 'Assign Team')}</Text>
            <TouchableOpacity onPress={handleAssignSubmit} disabled={assignMutation.isPending}>
              {assignMutation.isPending ? (
                <ActivityIndicator size="small" color="#1976D2" />
              ) : (
                <Text style={styles.modalSave}>{t('common.save', 'Assign')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedAssignment && (
              <View style={styles.equipmentInfo}>
                <Text style={styles.equipmentInfoTitle}>
                  {selectedAssignment.equipment?.name || `Equipment #${selectedAssignment.equipment_id}`}
                </Text>
                <Text style={styles.equipmentInfoDetail}>
                  Type: {selectedAssignment.equipment?.equipment_type || '-'}
                </Text>
                <Text style={styles.equipmentInfoDetail}>
                  Serial: {selectedAssignment.equipment?.serial_number || '-'}
                </Text>
                <Text style={styles.equipmentInfoDetail}>
                  Berth: {selectedAssignment.berth || selectedAssignment.equipment?.berth || '-'}
                </Text>
                <Text style={styles.equipmentInfoDetail}>
                  Date: {selectedAssignment.list_target_date} | Shift:{' '}
                  {selectedAssignment.list_shift?.toUpperCase()}
                </Text>
              </View>
            )}

            {availabilityQuery.isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#1976D2" />
                <Text style={styles.loadingText}>Loading available inspectors...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.fieldLabel}>
                  {t('assignments.mechInspector', 'Mechanical Inspector')}
                </Text>
                <TouchableOpacity
                  style={styles.inspectorPickerButton}
                  onPress={() => openInspectorPicker('mech')}
                >
                  <Text
                    style={[
                      styles.inspectorPickerText,
                      !selectedMechInspector && styles.placeholderText,
                    ]}
                  >
                    {selectedMechInspector
                      ? `${selectedMechInspector.full_name}${selectedMechInspector.covering_for ? ` (Covering)` : ''}`
                      : 'Select mechanical inspector...'}
                  </Text>
                  <Text style={styles.chevron}>▼</Text>
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>
                  {t('assignments.elecInspector', 'Electrical Inspector')}
                </Text>
                <TouchableOpacity
                  style={styles.inspectorPickerButton}
                  onPress={() => openInspectorPicker('elec')}
                >
                  <Text
                    style={[
                      styles.inspectorPickerText,
                      !selectedElecInspector && styles.placeholderText,
                    ]}
                  >
                    {selectedElecInspector
                      ? `${selectedElecInspector.full_name}${selectedElecInspector.covering_for ? ` (Covering)` : ''}`
                      : 'Select electrical inspector...'}
                  </Text>
                  <Text style={styles.chevron}>▼</Text>
                </TouchableOpacity>

                {(allMechOptions.length === 0 || allElecOptions.length === 0) && (
                  <Text style={styles.warningText}>
                    Note: Some inspectors may not be available for this shift. Check the roster.
                  </Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Inspector Picker Modal */}
      <Modal
        visible={inspectorPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setInspectorPickerVisible(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>
                {inspectorPickerType === 'mech' ? 'Mechanical Inspector' : 'Electrical Inspector'}
              </Text>
              <TouchableOpacity onPress={() => setInspectorPickerVisible(false)}>
                <Text style={styles.pickerModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={currentPickerOptions}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.inspectorOption, item.isOnLeave && styles.inspectorOptionDisabled]}
                  onPress={() => !item.isOnLeave && selectInspector(item)}
                  disabled={item.isOnLeave}
                >
                  <Text
                    style={[
                      styles.inspectorOptionName,
                      item.covering_for && styles.inspectorCovering,
                      item.isOnLeave && styles.inspectorOnLeave,
                    ]}
                  >
                    {item.full_name}
                  </Text>
                  <Text style={styles.inspectorOptionDetail}>
                    {item.covering_for
                      ? `Covering ${item.covering_for.full_name}`
                      : item.isOnLeave
                        ? 'On Leave'
                        : item.role}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.noInspectorsText}>
                  No inspectors available for this specialization and shift.
                </Text>
              }
              style={styles.inspectorList}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  addButton: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: { flexDirection: 'row', gap: 6 },
  dateText: { fontSize: 12, color: '#757575' },
  equipmentName: { fontSize: 16, fontWeight: '700', color: '#212121', marginBottom: 8 },
  cardInfoRow: { flexDirection: 'row', marginBottom: 4 },
  cardLabel: { fontSize: 13, color: '#757575' },
  cardValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },
  pendingText: { fontSize: 12, color: '#FF5722', marginTop: 4, fontStyle: 'italic' },
  inspectorsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  inspectorRow: { flexDirection: 'row', marginBottom: 4 },
  inspectorLabel: { fontSize: 13, color: '#757575', width: 50 },
  inspectorValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },
  assignButton: {
    marginTop: 12,
    backgroundColor: '#1976D2',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  assignButtonDisabled: { backgroundColor: '#BDBDBD' },
  assignButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  assignButtonTextDisabled: { color: '#757575' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575', textAlign: 'center', paddingHorizontal: 32 },
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCancel: { fontSize: 16, color: '#757575' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#212121' },
  modalSave: { fontSize: 16, color: '#1976D2', fontWeight: '600' },
  modalContent: { padding: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 6, marginTop: 16 },
  dateInput: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    fontSize: 15,
    color: '#212121',
  },
  shiftRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  shiftButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  shiftButtonActive: { backgroundColor: '#FFC107', borderColor: '#FFC107' },
  shiftButtonActiveNight: { backgroundColor: '#3F51B5', borderColor: '#3F51B5' },
  shiftButtonText: { fontSize: 14, fontWeight: '600', color: '#616161' },
  shiftButtonTextActive: { color: '#fff' },
  noteText: { fontSize: 14, color: '#616161', marginTop: 16, lineHeight: 20 },
  equipmentInfo: {
    backgroundColor: '#E3F2FD',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  equipmentInfoTitle: { fontSize: 16, fontWeight: '700', color: '#1976D2', marginBottom: 6 },
  equipmentInfoDetail: { fontSize: 13, color: '#424242', marginBottom: 2 },
  loadingContainer: { alignItems: 'center', paddingVertical: 24 },
  loadingText: { fontSize: 14, color: '#757575', marginTop: 8 },
  inspectorPickerButton: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inspectorPickerText: { fontSize: 15, color: '#212121', flex: 1 },
  placeholderText: { color: '#999' },
  chevron: { fontSize: 12, color: '#757575', marginLeft: 8 },
  warningText: {
    fontSize: 13,
    color: '#FF9800',
    marginTop: 16,
    fontStyle: 'italic',
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  pickerModalTitle: { fontSize: 17, fontWeight: '600', color: '#212121' },
  pickerModalClose: { fontSize: 20, color: '#757575', paddingHorizontal: 8 },
  inspectorList: { padding: 8 },
  inspectorOption: {
    padding: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  inspectorOptionDisabled: { opacity: 0.5 },
  inspectorOptionName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  inspectorCovering: { color: '#4CAF50' },
  inspectorOnLeave: { color: '#F44336' },
  inspectorOptionDetail: { fontSize: 13, color: '#757575', marginTop: 2 },
  noInspectorsText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    padding: 24,
  },
});
