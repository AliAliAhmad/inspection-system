import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  monitorFollowupsApi,
} from '@inspection/shared';
import type {
  MonitorFollowup,
  FollowupType,
  FollowupLocation,
  ScheduleFollowupPayload,
  AvailableInspector,
  AvailableInspectorsResponse,
} from '@inspection/shared';

// ─── Types ──────────────────────────────────────────────────

type RouteParams = { followupId: number };

// ─── Constants ──────────────────────────────────────────────

const FOLLOWUP_TYPES: { key: FollowupType; icon: string }[] = [
  { key: 'routine_check', icon: '🔄' },
  { key: 'detailed_inspection', icon: '🔍' },
  { key: 'operational_test', icon: '⚙️' },
];

const LOCATIONS: { key: FollowupLocation; icon: string }[] = [
  { key: 'east', icon: '➡️' },
  { key: 'west', icon: '⬅️' },
];

const SHIFTS: { key: 'day' | 'night'; icon: string }[] = [
  { key: 'day', icon: '☀️' },
  { key: 'night', icon: '🌙' },
];

// ─── Helpers ────────────────────────────────────────────────

function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Selectable Card Button ─────────────────────────────────

function SelectableCard({
  label,
  icon,
  selected,
  color,
  onPress,
}: {
  label: string;
  icon: string;
  selected: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.selectableCard,
        selected && { backgroundColor: color, borderColor: color },
        !selected && { backgroundColor: '#fff', borderColor: '#E0E0E0' },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.selectableIcon}>{icon}</Text>
      <Text
        style={[
          styles.selectableLabel,
          selected && { color: '#fff' },
          !selected && { color: '#424242' },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Dropdown Picker (Simple) ───────────────────────────────

function InspectorPicker({
  label,
  inspectors,
  selectedId,
  onSelect,
  loading,
}: {
  label: string;
  inspectors: AvailableInspector[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedInspector = inspectors.find((i) => i.id === selectedId);

  return (
    <View style={styles.pickerContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.pickerBtn}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#1890ff" />
        ) : (
          <Text
            style={[
              styles.pickerBtnText,
              !selectedInspector && { color: '#BDBDBD' },
            ]}
            numberOfLines={1}
          >
            {selectedInspector
              ? `${selectedInspector.name}${selectedInspector.workload ? ` (${selectedInspector.workload})` : ''}`
              : 'Select inspector...'}
          </Text>
        )}
        <Text style={styles.pickerArrow}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && !loading && (
        <View style={styles.pickerDropdown}>
          {inspectors.length === 0 ? (
            <Text style={styles.pickerEmpty}>No inspectors available</Text>
          ) : (
            inspectors.map((inspector) => (
              <TouchableOpacity
                key={inspector.id}
                style={[
                  styles.pickerOption,
                  inspector.id === selectedId && styles.pickerOptionSelected,
                ]}
                onPress={() => {
                  onSelect(inspector.id);
                  setExpanded(false);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.pickerOptionContent}>
                  <Text
                    style={[
                      styles.pickerOptionName,
                      inspector.id === selectedId && { color: '#1890ff', fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {inspector.name}
                  </Text>
                  {inspector.specialization && (
                    <Text style={styles.pickerOptionSpec}>{inspector.specialization}</Text>
                  )}
                </View>
                <Text style={styles.pickerOptionWorkload}>
                  {inspector.workload ?? 0} tasks
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────

export default function MonitorFollowupScheduleScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<{ params: RouteParams }, 'params'>>();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';

  const { followupId } = route.params;

  // ─── Form state ──────────────────────────────────────────

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDateInput, setShowDateInput] = useState(false);
  const [dateText, setDateText] = useState(formatDateForApi(new Date()));
  const [followupType, setFollowupType] = useState<FollowupType>('routine_check');
  const [location, setLocation] = useState<FollowupLocation>('east');
  const [shift, setShift] = useState<'day' | 'night' | null>(null);
  const [mechInspectorId, setMechInspectorId] = useState<number | null>(null);
  const [elecInspectorId, setElecInspectorId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  // ─── Fetch follow-up details ─────────────────────────────

  const { data: followup, isLoading: followupLoading } = useQuery({
    queryKey: ['monitor-followup', followupId],
    queryFn: () =>
      monitorFollowupsApi.get(followupId).then((r) => (r.data as any)?.data as MonitorFollowup),
    staleTime: 60000,
  });

  // Pre-fill form from existing follow-up data
  useEffect(() => {
    if (followup) {
      if (followup.followup_type) setFollowupType(followup.followup_type);
      if (followup.location) setLocation(followup.location);
      if (followup.shift) setShift(followup.shift);
      if (followup.followup_date) {
        const d = new Date(followup.followup_date);
        if (!isNaN(d.getTime())) {
          setSelectedDate(d);
          setDateText(formatDateForApi(d));
        }
      }
    }
  }, [followup]);

  // ─── Fetch available inspectors ──────────────────────────

  const {
    data: inspectorsData,
    isLoading: inspectorsLoading,
  } = useQuery({
    queryKey: ['available-inspectors', dateText, shift, location],
    queryFn: () =>
      monitorFollowupsApi
        .getAvailableInspectors({
          date: dateText,
          ...(shift ? { shift } : {}),
          ...(location ? { location } : {}),
        })
        .then((r) => (r.data as any)?.data as AvailableInspectorsResponse),
    enabled: dateText.length === 10,
    staleTime: 30000,
  });

  const mechInspectors = inspectorsData?.mechanical ?? [];
  const elecInspectors = inspectorsData?.electrical ?? [];

  // Auto-select first inspector when data arrives
  useEffect(() => {
    if (mechInspectors.length > 0 && mechInspectorId === null) {
      setMechInspectorId(mechInspectors[0].id);
    }
    if (elecInspectors.length > 0 && elecInspectorId === null) {
      setElecInspectorId(elecInspectors[0].id);
    }
  }, [mechInspectors, elecInspectors]);

  // ─── Date change handler ─────────────────────────────────

  const handleDateTextChange = useCallback((text: string) => {
    setDateText(text);
    // Try to parse the date
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime()) && text.length === 10) {
      setSelectedDate(parsed);
      // Reset inspector selections when date changes
      setMechInspectorId(null);
      setElecInspectorId(null);
    }
  }, []);

  // ─── Submit mutation ─────────────────────────────────────

  const scheduleMutation = useMutation({
    mutationFn: (payload: ScheduleFollowupPayload) =>
      monitorFollowupsApi.schedule(followupId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor-followups'] });
      queryClient.invalidateQueries({ queryKey: ['monitor-followup-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['monitor-followup', followupId] });
      Alert.alert(
        t('monitor_followup.success_title', 'Scheduled'),
        t('monitor_followup.success_message', 'Follow-up has been scheduled successfully.'),
        [{ text: t('common.ok', 'OK'), onPress: () => navigation.goBack() }],
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        t('monitor_followup.error_message', 'Failed to schedule follow-up.');
      Alert.alert(t('monitor_followup.error_title', 'Error'), message);
    },
  });

  const handleSubmit = useCallback(() => {
    if (!dateText || dateText.length !== 10) {
      Alert.alert(
        t('monitor_followup.validation_error', 'Validation Error'),
        t('monitor_followup.select_date', 'Please enter a valid date (YYYY-MM-DD).'),
      );
      return;
    }

    const payload: ScheduleFollowupPayload = {
      followup_date: dateText,
      followup_type: followupType,
      location,
      ...(shift ? { shift } : {}),
      ...(mechInspectorId ? { mechanical_inspector_id: mechInspectorId } : {}),
      ...(elecInspectorId ? { electrical_inspector_id: elecInspectorId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    scheduleMutation.mutate(payload);
  }, [dateText, followupType, location, shift, mechInspectorId, elecInspectorId, notes, scheduleMutation, t]);

  // ─── Type label helper ───────────────────────────────────

  function getTypeLabel(type: FollowupType): string {
    switch (type) {
      case 'routine_check':
        return t('monitor_followup.type_routine', 'Routine Check');
      case 'detailed_inspection':
        return t('monitor_followup.type_detailed', 'Detailed Inspection');
      case 'operational_test':
        return t('monitor_followup.type_operational', 'Operational Test');
      default:
        return type;
    }
  }

  // ─── Loading state ───────────────────────────────────────

  if (followupLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1890ff" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{isAr ? '←' : '←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('monitor_followup.schedule_title', 'Schedule Follow-up')}
        </Text>
      </View>

      {/* Equipment Info */}
      {followup && (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>
            {t('monitor_followup.equipment', 'Equipment')}
          </Text>
          <Text style={styles.infoValue}>
            {followup.equipment_name || t('monitor_followup.unknown_equipment', 'Unknown')}
          </Text>
        </View>
      )}

      {/* Date Field */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          {t('monitor_followup.date', 'Date')} *
        </Text>
        <TextInput
          style={styles.dateInput}
          value={dateText}
          onChangeText={handleDateTextChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#BDBDBD"
          keyboardType={Platform.OS === 'ios' ? 'default' : 'default'}
          maxLength={10}
        />
        <Text style={styles.fieldHint}>
          {t('monitor_followup.date_hint', 'Format: YYYY-MM-DD (e.g. 2026-02-20)')}
        </Text>
      </View>

      {/* Follow-up Type */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          {t('monitor_followup.followup_type', 'Follow-up Type')} *
        </Text>
        <View style={styles.cardOptionsRow}>
          {FOLLOWUP_TYPES.map((ft) => (
            <SelectableCard
              key={ft.key}
              label={getTypeLabel(ft.key)}
              icon={ft.icon}
              selected={followupType === ft.key}
              color="#1890ff"
              onPress={() => setFollowupType(ft.key)}
            />
          ))}
        </View>
      </View>

      {/* Location */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          {t('monitor_followup.location', 'Location')} *
        </Text>
        <View style={styles.buttonPairRow}>
          {LOCATIONS.map((loc) => (
            <TouchableOpacity
              key={loc.key}
              style={[
                styles.pairBtn,
                location === loc.key && styles.pairBtnActive,
                location !== loc.key && styles.pairBtnInactive,
              ]}
              onPress={() => setLocation(loc.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.pairBtnIcon}>{loc.icon}</Text>
              <Text
                style={[
                  styles.pairBtnLabel,
                  location === loc.key && { color: '#fff' },
                  location !== loc.key && { color: '#424242' },
                ]}
              >
                {loc.key === 'east'
                  ? t('monitor_followup.location_east', 'East')
                  : t('monitor_followup.location_west', 'West')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Shift (Optional) */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          {t('monitor_followup.shift', 'Shift')}{' '}
          <Text style={styles.optionalText}>
            ({t('monitor_followup.optional', 'Optional')})
          </Text>
        </Text>
        <View style={styles.buttonPairRow}>
          {SHIFTS.map((s) => {
            const isSelected = shift === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[
                  styles.pairBtn,
                  isSelected && styles.pairBtnActive,
                  !isSelected && styles.pairBtnInactive,
                ]}
                onPress={() => setShift(isSelected ? null : s.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.pairBtnIcon}>{s.icon}</Text>
                <Text
                  style={[
                    styles.pairBtnLabel,
                    isSelected && { color: '#fff' },
                    !isSelected && { color: '#424242' },
                  ]}
                >
                  {s.key === 'day'
                    ? t('monitor_followup.shift_day', 'Day')
                    : t('monitor_followup.shift_night', 'Night')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Mechanical Inspector */}
      <InspectorPicker
        label={t('monitor_followup.mech_inspector', 'Mechanical Inspector')}
        inspectors={mechInspectors}
        selectedId={mechInspectorId}
        onSelect={setMechInspectorId}
        loading={inspectorsLoading}
      />

      {/* Electrical Inspector */}
      <InspectorPicker
        label={t('monitor_followup.elec_inspector', 'Electrical Inspector')}
        inspectors={elecInspectors}
        selectedId={elecInspectorId}
        onSelect={setElecInspectorId}
        loading={inspectorsLoading}
      />

      {/* Notes */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          {t('monitor_followup.notes', 'Notes')}{' '}
          <Text style={styles.optionalText}>
            ({t('monitor_followup.optional', 'Optional')})
          </Text>
        </Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('monitor_followup.notes_placeholder', 'Add any notes or instructions...')}
          placeholderTextColor="#BDBDBD"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.submitBtn,
          scheduleMutation.isPending && styles.submitBtnDisabled,
        ]}
        onPress={handleSubmit}
        disabled={scheduleMutation.isPending}
        activeOpacity={0.7}
      >
        {scheduleMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>
            {t('monitor_followup.submit_schedule', 'Schedule Follow-up')}
          </Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  backBtnText: {
    fontSize: 20,
    color: '#424242',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },

  // Info card
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  infoLabel: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
  },

  // Field group
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 4,
  },
  optionalText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#9E9E9E',
  },

  // Date input
  dateInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },

  // Selectable cards (type)
  cardOptionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  selectableCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    minHeight: 80,
    justifyContent: 'center',
  },
  selectableIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  selectableLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Button pair (location, shift)
  buttonPairRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pairBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 6,
  },
  pairBtnActive: {
    backgroundColor: '#1890ff',
    borderColor: '#1890ff',
  },
  pairBtnInactive: {
    backgroundColor: '#fff',
    borderColor: '#E0E0E0',
  },
  pairBtnIcon: {
    fontSize: 18,
  },
  pairBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Inspector picker
  pickerContainer: {
    marginBottom: 18,
  },
  pickerBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pickerBtnText: {
    flex: 1,
    fontSize: 15,
    color: '#212121',
  },
  pickerArrow: {
    fontSize: 12,
    color: '#9E9E9E',
    marginLeft: 8,
  },
  pickerDropdown: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    maxHeight: 200,
    overflow: 'hidden',
  },
  pickerEmpty: {
    paddingVertical: 16,
    textAlign: 'center',
    color: '#9E9E9E',
    fontSize: 14,
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  pickerOptionSelected: {
    backgroundColor: '#E6F7FF',
  },
  pickerOptionContent: {
    flex: 1,
  },
  pickerOptionName: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
  },
  pickerOptionSpec: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 2,
  },
  pickerOptionWorkload: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 8,
  },

  // Notes
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 100,
  },

  // Submit
  submitBtn: {
    backgroundColor: '#1890ff',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    boxShadow: '0px 2px 4px rgba(24, 144, 255, 0.3)',
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
