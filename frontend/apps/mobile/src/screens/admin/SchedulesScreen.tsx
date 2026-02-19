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
  Modal,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import { inspectionRoutinesApi } from '@inspection/shared';
import type { EquipmentSchedule, UpcomingEntry } from '@inspection/shared';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SHIFT_COLORS: Record<string, string> = {
  day: '#1976D2',
  night: '#7B1FA2',
  both: '#FF9800',
};

function ShiftBadge({ shift }: { shift: string | undefined }) {
  if (!shift) return <Text style={styles.shiftEmpty}>-</Text>;

  const color = SHIFT_COLORS[shift] ?? '#757575';
  const label = shift === 'day' ? 'D' : shift === 'night' ? 'N' : shift === 'both' ? 'D+N' : shift;

  return (
    <View style={[styles.shiftBadge, { backgroundColor: color }]}>
      <Text style={styles.shiftBadgeText}>{label}</Text>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

interface UpcomingCardProps {
  title: string;
  date: string;
  entries: UpcomingEntry[];
}

function UpcomingCard({ title, date, entries }: UpcomingCardProps) {
  // Group by berth
  const byBerth: Record<string, { day: UpcomingEntry[]; night: UpcomingEntry[] }> = {};
  for (const e of entries) {
    const berth = e.berth || 'Unknown';
    if (!byBerth[berth]) byBerth[berth] = { day: [], night: [] };
    if (e.shift === 'day') byBerth[berth].day.push(e);
    else byBerth[berth].night.push(e);
  }

  const berths = Object.entries(byBerth).sort(([a], [b]) => a.localeCompare(b));

  return (
    <View style={styles.upcomingCard}>
      <View style={styles.upcomingHeader}>
        <Text style={styles.upcomingTitle}>{title}</Text>
        {date && <Text style={styles.upcomingDate}>{date}</Text>}
      </View>

      {berths.length === 0 ? (
        <Text style={styles.noInspections}>No inspections scheduled</Text>
      ) : (
        berths.map(([berth, shifts]) => (
          <View key={berth} style={styles.berthRow}>
            <Badge label={berth} color="#3F51B5" />
            <View style={styles.shiftColumn}>
              <View style={styles.shiftRow}>
                <Badge label="D" color="#FFC107" />
                {shifts.day.length === 0 ? (
                  <Text style={styles.dashText}>—</Text>
                ) : (
                  <View style={styles.equipmentTags}>
                    {shifts.day.map((e) => (
                      <Text key={e.equipment_id} style={styles.equipmentTag}>
                        {e.equipment_name}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.shiftRow}>
                <Badge label="N" color="#7B1FA2" />
                {shifts.night.length === 0 ? (
                  <Text style={styles.dashText}>—</Text>
                ) : (
                  <View style={styles.equipmentTags}>
                    {shifts.night.map((e) => (
                      <Text key={e.equipment_id} style={styles.equipmentTag}>
                        {e.equipment_name}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function ScheduleCard({ schedule }: { schedule: EquipmentSchedule }) {
  return (
    <View style={styles.scheduleCard}>
      <View style={styles.scheduleHeader}>
        <Text style={styles.scheduleName}>{schedule.equipment_name}</Text>
        {schedule.berth && <Badge label={schedule.berth} color="#3F51B5" />}
      </View>
      <Text style={styles.scheduleType}>{schedule.equipment_type || '-'}</Text>

      <View style={styles.daysRow}>
        {DAY_NAMES.map((day, idx) => (
          <View key={day} style={styles.dayColumn}>
            <Text style={styles.dayLabel}>{day}</Text>
            <ShiftBadge shift={schedule.days[String(idx)]} />
          </View>
        ))}
      </View>
    </View>
  );
}

interface UploadResult {
  created: number;
  equipment_processed: number;
  errors: string[];
}

export default function SchedulesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'schedule'>('upcoming');
  const [uploadResultModalVisible, setUploadResultModalVisible] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ['inspection-schedules'],
    queryFn: () =>
      inspectionRoutinesApi.getSchedules().then((r) => (r.data as any).data as EquipmentSchedule[]),
  });

  const upcomingQuery = useQuery({
    queryKey: ['inspection-schedules', 'upcoming'],
    queryFn: () => inspectionRoutinesApi.getUpcoming().then((r) => (r.data as any).data),
  });

  const uploadMutation = useMutation({
    mutationFn: async (uri: string) => {
      // Fetch file as blob and upload
      const response = await fetch(uri);
      const blob = await response.blob();
      const file = new File([blob], 'schedule.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      return inspectionRoutinesApi.uploadSchedule(file);
    },
    onSuccess: (res) => {
      const result = res.data as any;
      setUploadResult({
        created: result.created ?? 0,
        equipment_processed: result.equipment_processed ?? 0,
        errors: result.errors ?? [],
      });
      setUploadResultModalVisible(true);
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
    },
    onError: (err: any) => {
      Alert.alert(
        t('common.error', 'Error'),
        err?.response?.data?.message || t('schedules.uploadError', 'Failed to upload schedule')
      );
    },
  });

  const handleImportSchedule = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        uploadMutation.mutate(file.uri);
      }
    } catch (error) {
      Alert.alert(t('common.error', 'Error'), t('schedules.pickError', 'Failed to select file'));
    }
  };

  const schedules = schedulesQuery.data ?? [];
  const todayEntries: UpcomingEntry[] = upcomingQuery.data?.today ?? [];
  const tomorrowEntries: UpcomingEntry[] = upcomingQuery.data?.tomorrow ?? [];
  const todayDate: string = upcomingQuery.data?.today_date ?? '';
  const tomorrowDate: string = upcomingQuery.data?.tomorrow_date ?? '';

  const handleRefresh = useCallback(() => {
    schedulesQuery.refetch();
    upcomingQuery.refetch();
  }, [schedulesQuery, upcomingQuery]);

  const isLoading = schedulesQuery.isLoading || upcomingQuery.isLoading;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.schedules', 'Inspection Schedules')}</Text>
        <TouchableOpacity
          style={styles.importButton}
          onPress={handleImportSchedule}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.importButtonText}>{t('schedules.import', 'Import')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            {t('schedules.upcoming', 'Upcoming')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'schedule' && styles.tabActive]}
          onPress={() => setActiveTab('schedule')}
        >
          <Text style={[styles.tabText, activeTab === 'schedule' && styles.tabTextActive]}>
            {t('schedules.weekly', 'Weekly Schedule')}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'upcoming' ? (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={upcomingQuery.isRefetching} onRefresh={handleRefresh} />
          }
        >
          <UpcomingCard
            title={t('schedules.todayInspections', "Today's Inspections")}
            date={todayDate}
            entries={todayEntries}
          />
          <UpcomingCard
            title={t('schedules.tomorrowInspections', "Tomorrow's Inspections")}
            date={tomorrowDate}
            entries={tomorrowEntries}
          />
          <View style={{ height: 32 }} />
        </ScrollView>
      ) : (
        <FlatList
          data={schedules}
          keyExtractor={(item) => String(item.equipment_id)}
          renderItem={({ item }) => <ScheduleCard schedule={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={schedulesQuery.isRefetching} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {t('schedules.noSchedule', 'No schedule imported yet')}
              </Text>
            </View>
          }
        />
      )}

      {/* Upload Result Modal */}
      <Modal visible={uploadResultModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('schedules.uploadResult', 'Schedule Upload Result')}</Text>

            {uploadResult && (
              <View style={styles.resultContent}>
                <Text style={styles.resultText}>
                  <Text style={styles.resultNumber}>{uploadResult.created}</Text> {t('schedules.entriesCreated', 'schedule entries created')}
                </Text>
                <Text style={styles.resultText}>
                  {t('schedules.forEquipment', 'for')} <Text style={styles.resultNumber}>{uploadResult.equipment_processed}</Text> {t('schedules.equipment', 'equipment')}
                </Text>

                {uploadResult.errors.length > 0 && (
                  <View style={styles.warningsContainer}>
                    <Text style={styles.warningsTitle}>
                      ⚠️ {uploadResult.errors.length} {t('schedules.warnings', 'warnings')}
                    </Text>
                    <ScrollView style={styles.warningsList}>
                      {uploadResult.errors.map((err, i) => (
                        <Text key={i} style={styles.warningText}>• {err}</Text>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.okButton}
              onPress={() => setUploadResultModalVisible(false)}
            >
              <Text style={styles.okButtonText}>{t('common.ok', 'OK')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  importButton: { backgroundColor: '#1976D2', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  importButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#1976D2' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#757575' },
  tabTextActive: { color: '#1976D2' },
  content: { flex: 1, paddingHorizontal: 16 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  upcomingCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2 },
  upcomingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  upcomingTitle: { fontSize: 16, fontWeight: 'bold', color: '#212121' },
  upcomingDate: { fontSize: 13, color: '#757575' },
  noInspections: { fontSize: 14, color: '#9e9e9e', fontStyle: 'italic' },
  berthRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  shiftColumn: { flex: 1, marginLeft: 12 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dashText: { fontSize: 14, color: '#9e9e9e', marginLeft: 8 },
  equipmentTags: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginLeft: 8 },
  equipmentTag: { fontSize: 12, color: '#424242', backgroundColor: '#e8e8e8', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: 4, marginBottom: 4 },
  scheduleCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2 },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  scheduleName: { fontSize: 15, fontWeight: '600', color: '#212121', flex: 1 },
  scheduleType: { fontSize: 13, color: '#757575', marginBottom: 12 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayColumn: { alignItems: 'center', flex: 1 },
  dayLabel: { fontSize: 11, color: '#757575', marginBottom: 4 },
  shiftBadge: { width: 28, height: 22, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  shiftBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  shiftEmpty: { fontSize: 14, color: '#bdbdbd' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#212121', marginBottom: 16, textAlign: 'center' },
  resultContent: { marginBottom: 20 },
  resultText: { fontSize: 15, color: '#424242', marginBottom: 4 },
  resultNumber: { fontWeight: '700', color: '#1976D2' },
  warningsContainer: { marginTop: 16, backgroundColor: '#FFF3E0', padding: 12, borderRadius: 8 },
  warningsTitle: { fontSize: 14, fontWeight: '600', color: '#E65100', marginBottom: 8 },
  warningsList: { maxHeight: 120 },
  warningText: { fontSize: 13, color: '#424242', marginBottom: 4 },
  okButton: { backgroundColor: '#1976D2', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  okButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
