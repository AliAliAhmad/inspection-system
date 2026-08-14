/**
 * Job details for a worker — what the job actually IS.
 *
 * Reached by tapping a card in My Work Plan. Read-only: Start/Pause/Complete
 * stay on the card so the work flow is untouched.
 *
 * Shows a SAP block or a defect block depending on which the server sends
 * (`sap` / `defect` are null when not applicable, so we branch on presence
 * rather than on job_type). For an inspection defect that means the photo and
 * the voice note the inspector recorded.
 *
 * Arabic: labels come from i18n, and the server sends already-translated
 * content when the user's language is ar.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Modal,
  RefreshControl,
} from 'react-native';
import { Audio } from 'expo-av';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRoute } from '@react-navigation/native';
import { workPlansApi } from '@inspection/shared';
import type { JobDetails } from '@inspection/shared';

const SEVERITY_COLORS: Record<string, string> = {
  low: '#9E9E9E',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#B71C1C',
};

const JOB_TYPE_COLORS: Record<string, string> = {
  pm: '#1976D2',
  defect: '#E53935',
  inspection: '#4CAF50',
  corrective: '#F9A825',
};

export default function JobDetailsScreen() {
  const { t, i18n } = useTranslation();
  const route = useRoute<any>();
  const { jobId } = route.params || {};
  const isAr = i18n.language === 'ar';

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['job-details', jobId],
    queryFn: async (): Promise<JobDetails> => {
      const r = await workPlansApi.getJobDetails(jobId);
      return r.data.data as JobDetails;
    },
    enabled: !!jobId,
  });

  // Release the audio player when leaving the screen, otherwise it keeps
  // playing after navigating away.
  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  const toggleVoice = useCallback(async (url: string) => {
    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
        return;
      }
      const { sound: created } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
      );
      setSound(created);
      setIsPlaying(true);
      created.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          created.unloadAsync();
          setSound(null);
        }
      });
    } catch (err) {
      console.warn('Failed to play voice note', err);
      setIsPlaying(false);
    }
  }, [sound, isPlaying]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1677ff" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('job_details.load_failed', 'Could not load job details')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const eq = data.equipment;
  const equipmentName = (isAr && eq?.name_ar) || eq?.name || t('job_details.no_equipment', 'No equipment');
  const equipmentType = (isAr && eq?.equipment_type_ar) || eq?.equipment_type;
  const location = (isAr && eq?.location_ar) || eq?.location;

  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    ) : null;

  return (
    <ScrollView
      testID="job-details-screen"
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.equipmentName}>{equipmentName}</Text>
          <View style={[styles.typeBadge, { backgroundColor: JOB_TYPE_COLORS[data.job_type] || '#607D8B' }]}>
            <Text style={styles.typeBadgeText}>
              {t(`job_type.${data.job_type}`, data.job_type.toUpperCase())}
            </Text>
          </View>
        </View>
        {!!eq?.serial_number && <Text style={styles.serial}>{eq.serial_number}</Text>}
        <View style={styles.headerMeta}>
          {!!data.day_date && <Text style={styles.metaText}>{data.day_date}</Text>}
          {data.estimated_hours != null && (
            <Text style={styles.metaText}>
              {data.estimated_hours}{t('job_details.hours_short', 'h')}
            </Text>
          )}
        </View>
      </View>

      {/* ── SAP block ── */}
      {data.sap && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('job_details.sap_info', 'SAP order')}</Text>
          <Row label={t('job_details.order_number', 'Order number')} value={data.sap.order_number} />
          <Row label={t('job_details.order_type', 'Order type')} value={data.sap.order_type} />
          <Row label={t('job_details.work_center', 'Work center')} value={data.sap.work_center} />
          <Row label={t('job_details.maintenance_base', 'Maintenance base')} value={data.sap.maintenance_base} />
          <Row label={t('job_details.cycle', 'Cycle')} value={data.sap.cycle} />
        </View>
      )}

      {/* ── Defect block (from an inspection) ── */}
      {data.defect && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t('job_details.defect_info', 'Defect')}</Text>
            {!!data.defect.severity && (
              <View style={[styles.severityChip, { backgroundColor: SEVERITY_COLORS[data.defect.severity] || '#9E9E9E' }]}>
                <Text style={styles.severityChipText}>
                  {t(`severity.${data.defect.severity}`, data.defect.severity)}
                </Text>
              </View>
            )}
          </View>
          <Row label={t('job_details.category', 'Category')}
               value={data.defect.category ? t(`category.${data.defect.category}`, data.defect.category) : null} />
          <Row label={t('job_details.hazard', 'Hazard')} value={data.defect.hazard_type} />
          <Row label={t('job_details.due_date', 'Due date')} value={data.defect.due_date} />
          <Row label={t('job_details.reported_by', 'Reported by')} value={data.defect.reported_by} />
          {!!data.defect.inspection && (
            <Row
              label={t('job_details.from_inspection', 'From inspection')}
              value={[data.defect.inspection.date, data.defect.inspection.inspector].filter(Boolean).join(' · ')}
            />
          )}
        </View>
      )}

      {/* ── Description ── */}
      {!!(data.defect?.description || data.description) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('job_details.description', 'Description')}</Text>
          <Text style={styles.descriptionText}>
            {data.defect?.description || data.description}
          </Text>
        </View>
      )}

      {/* ── Photo from the inspection ── */}
      {!!data.defect?.photo_url && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('job_details.photo', 'Photo')}</Text>
          <TouchableOpacity testID="job-details-photo" onPress={() => setPhotoOpen(true)} activeOpacity={0.85}>
            <Image source={{ uri: data.defect.photo_url }} style={styles.photo} resizeMode="cover" />
            <Text style={styles.photoHint}>{t('job_details.tap_to_enlarge', 'Tap to enlarge')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Voice note the inspector recorded ── */}
      {!!data.defect?.voice_note_url && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('job_details.voice_note', 'Voice note')}</Text>
          <TouchableOpacity
            testID="job-details-voice"
            style={styles.voiceButton}
            onPress={() => toggleVoice(data.defect!.voice_note_url!)}
            activeOpacity={0.8}
          >
            <Text style={styles.voiceIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            <Text style={styles.voiceButtonText}>
              {isPlaying ? t('job_details.pause', 'Pause') : t('job_details.play', 'Play')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Team ── */}
      {data.assignments.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('job_details.team', 'Team')}</Text>
          {data.assignments.map((a) => (
            <View key={a.user_id} style={styles.row}>
              <Text style={styles.rowValue}>{a.full_name}</Text>
              {a.is_lead && <Text style={styles.leadTag}>★ {t('job_details.lead', 'Lead')}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* ── Notes / equipment extras ── */}
      {(!!data.notes || !!equipmentType || !!location) && (
        <View style={styles.card}>
          <Row label={t('job_details.equipment_type', 'Equipment type')} value={equipmentType} />
          <Row label={t('job_details.location', 'Location')} value={location} />
          <Row label={t('job_details.notes', 'Notes')} value={data.notes} />
        </View>
      )}

      {/* Full-screen photo */}
      <Modal visible={photoOpen} transparent animationType="fade" onRequestClose={() => setPhotoOpen(false)}>
        <TouchableOpacity style={styles.photoOverlay} activeOpacity={1} onPress={() => setPhotoOpen(false)}>
          <Image source={{ uri: data.defect?.photo_url || '' }} style={styles.photoFull} resizeMode="contain" />
          <Text style={styles.photoCloseHint}>{t('common.close', 'Close')}</Text>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 12, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  errorText: { fontSize: 15, color: '#8c8c8c', marginBottom: 12 },
  retryButton: { backgroundColor: '#1677ff', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },

  header: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  equipmentName: { flex: 1, fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  typeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  serial: { fontSize: 12, color: '#8c8c8c', marginTop: 2 },
  headerMeta: { flexDirection: 'row', gap: 12, marginTop: 8 },
  metaText: { fontSize: 13, color: '#595959' },

  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 12 },
  rowLabel: { fontSize: 13, color: '#8c8c8c' },
  rowValue: { flex: 1, fontSize: 14, color: '#1a1a1a', fontWeight: '500', textAlign: 'right' },

  severityChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  severityChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  descriptionText: { fontSize: 15, color: '#262626', lineHeight: 22 },

  photo: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#f0f0f0' },
  photoHint: { fontSize: 11, color: '#8c8c8c', textAlign: 'center', marginTop: 6 },
  photoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  photoFull: { width: '100%', height: '80%' },
  photoCloseHint: { color: '#fff', marginTop: 16, fontSize: 14 },

  voiceButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#1677ff', paddingVertical: 12, borderRadius: 8,
  },
  voiceIcon: { color: '#fff', fontSize: 18 },
  voiceButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  leadTag: { fontSize: 12, color: '#faad14', fontWeight: '700' },
});
