import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  I18nManager,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import {
  notificationsApi,
  NotificationPreference,
  NotificationDigestMode,
  DoNotDisturbSchedule,
} from '@inspection/shared';

// ────────────────────────────────────────────────────────────────────
// Notification type groups (matches the web modal)
// ────────────────────────────────────────────────────────────────────

interface PreferenceGroup {
  key: string;
  labelKey: string;
  fallbackLabel: string;
  types: string[];
}

const PREFERENCE_GROUPS: PreferenceGroup[] = [
  {
    key: 'work',
    labelKey: 'notificationPrefs.groupWork',
    fallbackLabel: 'Work',
    types: [
      'inspection_assigned',
      'inspection_submitted',
      'work_plan_published',
    ],
  },
  {
    key: 'approvals',
    labelKey: 'notificationPrefs.groupApprovals',
    fallbackLabel: 'Approvals',
    types: [
      'leave_requested',
      'leave_approved',
      'leave_rejected',
      'bonus_star_requested',
    ],
  },
  {
    key: 'updates',
    labelKey: 'notificationPrefs.groupUpdates',
    fallbackLabel: 'Updates',
    types: [
      'specialist_job_assigned',
      'specialist_job_completed',
      'engineer_job_created',
      'engineer_job_completed',
      'quality_review_pending',
    ],
  },
  {
    key: 'alerts',
    labelKey: 'notificationPrefs.groupAlerts',
    fallbackLabel: 'Alerts',
    types: [
      'equipment_alert',
      'defect_created',
      'defect_assigned',
      'assessment_submitted',
    ],
  },
];

const DIGEST_OPTIONS: { value: NotificationDigestMode; labelKey: string; fallback: string }[] = [
  { value: 'instant', labelKey: 'notifications.preferencesModal.instant', fallback: 'Instant' },
  { value: 'hourly', labelKey: 'notifications.preferencesModal.hourly', fallback: 'Hourly Digest' },
  { value: 'daily', labelKey: 'notifications.preferencesModal.daily', fallback: 'Daily Digest' },
  { value: 'weekly', labelKey: 'notifications.preferencesModal.weekly', fallback: 'Weekly Digest' },
];

const DAYS_OF_WEEK = [
  { value: 0, labelKey: 'notificationPrefs.sun', fallback: 'Sun' },
  { value: 1, labelKey: 'notificationPrefs.mon', fallback: 'Mon' },
  { value: 2, labelKey: 'notificationPrefs.tue', fallback: 'Tue' },
  { value: 3, labelKey: 'notificationPrefs.wed', fallback: 'Wed' },
  { value: 4, labelKey: 'notificationPrefs.thu', fallback: 'Thu' },
  { value: 5, labelKey: 'notificationPrefs.fri', fallback: 'Fri' },
  { value: 6, labelKey: 'notificationPrefs.sat', fallback: 'Sat' },
];

// Humanise notification_type → "Inspection Assigned"
function humaniseType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ────────────────────────────────────────────────────────────────────
// Time picker helper (simple hour:minute selector via Alert prompt)
// ────────────────────────────────────────────────────────────────────

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0');
  return `${h}:00`;
});

// ────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────

export default function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const isRTL = I18nManager.isRTL;

  // ── Local state ────────────────────────────────────────────────
  const [localPreferences, setLocalPreferences] = useState<NotificationPreference[]>([]);
  const [dndSchedule, setDndSchedule] = useState<Partial<DoNotDisturbSchedule>>({
    start_time: '22:00',
    end_time: '08:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    is_active: false,
    allow_critical: true,
  });
  const [selectedDigest, setSelectedDigest] = useState<NotificationDigestMode>('instant');

  // ── Queries ────────────────────────────────────────────────────
  const { data: prefsData, isLoading: prefsLoading } = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => notificationsApi.getPreferences().then((r) => r.data),
  });

  const { data: dndData, isLoading: dndLoading } = useQuery({
    queryKey: ['notifications', 'dnd'],
    queryFn: () => notificationsApi.getDndSchedule().then((r) => r.data),
  });

  // Hydrate local state from server
  useEffect(() => {
    if (prefsData?.data) {
      setLocalPreferences(prefsData.data);
      // Derive digest mode from first preference
      if (prefsData.data.length > 0) {
        setSelectedDigest(prefsData.data[0].digest_mode ?? 'instant');
      }
    }
  }, [prefsData]);

  useEffect(() => {
    if (dndData?.data) {
      setDndSchedule(dndData.data);
    }
  }, [dndData]);

  // ── Mutations ──────────────────────────────────────────────────
  const updatePrefMutation = useMutation({
    mutationFn: (pref: {
      notification_type: string;
      channels?: { in_app?: boolean; push?: boolean };
      is_enabled?: boolean;
      digest_mode?: NotificationDigestMode;
    }) => notificationsApi.updatePreference(pref as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
    },
  });

  const setDndMutation = useMutation({
    mutationFn: (schedule: {
      start_time: string;
      end_time: string;
      days_of_week: number[];
      allow_critical?: boolean;
    }) => notificationsApi.setDndSchedule(schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'dnd'] });
    },
  });

  const deleteDndMutation = useMutation({
    mutationFn: () => notificationsApi.deleteDndSchedule(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'dnd'] });
    },
  });

  const resetPrefsMutation = useMutation({
    mutationFn: () => notificationsApi.resetPreferences(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'dnd'] });
    },
  });

  // ── Helpers ────────────────────────────────────────────────────
  const getPreference = useCallback(
    (type: string): NotificationPreference => {
      return (
        localPreferences.find((p) => p.notification_type === type) ??
        ({
          id: 0,
          user_id: 0,
          notification_type: type,
          channels: { in_app: true, email: false, sms: false, push: false },
          is_enabled: true,
          sound_type: 'default',
          digest_mode: 'instant',
        } as NotificationPreference)
      );
    },
    [localPreferences]
  );

  // Toggle a channel (in_app or push) on a specific type
  const handleChannelToggle = useCallback(
    (type: string, channel: 'in_app' | 'push', value: boolean) => {
      // Optimistic update
      setLocalPreferences((prev) =>
        prev.map((p) =>
          p.notification_type === type
            ? { ...p, channels: { ...p.channels, [channel]: value } }
            : p
        )
      );
      // Persist
      const pref = getPreference(type);
      updatePrefMutation.mutate({
        notification_type: type,
        channels: { ...pref.channels, [channel]: value },
      });
    },
    [getPreference, updatePrefMutation]
  );

  // Toggle DND on/off
  const handleDndToggle = useCallback(
    (enabled: boolean) => {
      setDndSchedule((prev) => ({ ...prev, is_active: enabled }));
      if (enabled) {
        setDndMutation.mutate({
          start_time: dndSchedule.start_time ?? '22:00',
          end_time: dndSchedule.end_time ?? '08:00',
          days_of_week: dndSchedule.days_of_week ?? [0, 1, 2, 3, 4, 5, 6],
          allow_critical: dndSchedule.allow_critical ?? true,
        });
      } else {
        deleteDndMutation.mutate();
      }
    },
    [dndSchedule, setDndMutation, deleteDndMutation]
  );

  // Pick time via action-sheet-like Alert
  const handleTimePick = useCallback(
    (field: 'start_time' | 'end_time') => {
      const current = field === 'start_time' ? dndSchedule.start_time : dndSchedule.end_time;
      const title =
        field === 'start_time'
          ? t('notificationPrefs.pickStartTime', 'Select Start Time')
          : t('notificationPrefs.pickEndTime', 'Select End Time');

      // Build quick-pick options (every 1 hour)
      const options = HOUR_OPTIONS.map((time) => ({
        text: time + (time === current ? ' *' : ''),
        onPress: () => {
          setDndSchedule((prev) => ({ ...prev, [field]: time }));
          if (dndSchedule.is_active) {
            setDndMutation.mutate({
              start_time: field === 'start_time' ? time : (dndSchedule.start_time ?? '22:00'),
              end_time: field === 'end_time' ? time : (dndSchedule.end_time ?? '08:00'),
              days_of_week: dndSchedule.days_of_week ?? [0, 1, 2, 3, 4, 5, 6],
              allow_critical: dndSchedule.allow_critical ?? true,
            });
          }
        },
      }));

      // iOS supports many buttons; Android is limited, so show a subset
      if (Platform.OS === 'ios') {
        Alert.alert(title, undefined, [
          ...options,
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        ]);
      } else {
        // On Android, show a simpler approach with common times
        const commonTimes = ['06:00', '07:00', '08:00', '09:00', '18:00', '20:00', '21:00', '22:00', '23:00', '00:00'];
        Alert.alert(
          title,
          t('notificationPrefs.selectTime', 'Choose a time'),
          [
            ...commonTimes.map((time) => ({
              text: time + (time === current ? ' *' : ''),
              onPress: () => {
                setDndSchedule((prev) => ({ ...prev, [field]: time }));
                if (dndSchedule.is_active) {
                  setDndMutation.mutate({
                    start_time: field === 'start_time' ? time : (dndSchedule.start_time ?? '22:00'),
                    end_time: field === 'end_time' ? time : (dndSchedule.end_time ?? '08:00'),
                    days_of_week: dndSchedule.days_of_week ?? [0, 1, 2, 3, 4, 5, 6],
                    allow_critical: dndSchedule.allow_critical ?? true,
                  });
                }
              },
            })),
            { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          ]
        );
      }
    },
    [dndSchedule, setDndMutation, t]
  );

  // Toggle a day in the DND schedule
  const handleDayToggle = useCallback(
    (dayValue: number) => {
      const currentDays = dndSchedule.days_of_week ?? [];
      const newDays = currentDays.includes(dayValue)
        ? currentDays.filter((d) => d !== dayValue)
        : [...currentDays, dayValue].sort();
      setDndSchedule((prev) => ({ ...prev, days_of_week: newDays }));
      if (dndSchedule.is_active) {
        setDndMutation.mutate({
          start_time: dndSchedule.start_time ?? '22:00',
          end_time: dndSchedule.end_time ?? '08:00',
          days_of_week: newDays,
          allow_critical: dndSchedule.allow_critical ?? true,
        });
      }
    },
    [dndSchedule, setDndMutation]
  );

  // Toggle allow critical during DND
  const handleAllowCriticalToggle = useCallback(
    (value: boolean) => {
      setDndSchedule((prev) => ({ ...prev, allow_critical: value }));
      if (dndSchedule.is_active) {
        setDndMutation.mutate({
          start_time: dndSchedule.start_time ?? '22:00',
          end_time: dndSchedule.end_time ?? '08:00',
          days_of_week: dndSchedule.days_of_week ?? [0, 1, 2, 3, 4, 5, 6],
          allow_critical: value,
        });
      }
    },
    [dndSchedule, setDndMutation]
  );

  // Digest mode selection
  const handleDigestSelect = useCallback(
    (mode: NotificationDigestMode) => {
      setSelectedDigest(mode);
      // Update all preferences with new digest mode
      localPreferences.forEach((pref) => {
        updatePrefMutation.mutate({
          notification_type: pref.notification_type,
          digest_mode: mode,
        });
      });
    },
    [localPreferences, updatePrefMutation]
  );

  // Reset to defaults
  const handleReset = useCallback(() => {
    Alert.alert(
      t('notificationPrefs.resetTitle', 'Reset Preferences'),
      t(
        'notificationPrefs.resetMessage',
        'Are you sure you want to reset all notification preferences to their defaults?'
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('notificationPrefs.reset', 'Reset'),
          style: 'destructive',
          onPress: () => resetPrefsMutation.mutate(),
        },
      ]
    );
  }, [resetPrefsMutation, t]);

  // ── Loading state ──────────────────────────────────────────────
  const isLoading = prefsLoading || dndLoading;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1677ff" />
        <Text style={styles.loadingText}>{t('common.loading', 'Loading...')}</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isRTL && styles.headerRTL]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backArrow}>{isRTL ? '>' : '<'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('notificationPrefs.title', 'Notification Preferences')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ──────────── Section 1: Notification Channels ──────────── */}
        <Text style={[styles.sectionTitle, isRTL && styles.textRTL]}>
          {t('notifications.preferencesModal.channels', 'Notification Channels')}
        </Text>
        <Text style={[styles.sectionSubtitle, isRTL && styles.textRTL]}>
          {t(
            'notificationPrefs.channelsDesc',
            'Choose how you receive each type of notification'
          )}
        </Text>

        {PREFERENCE_GROUPS.map((group) => (
          <View key={group.key} style={styles.card}>
            {/* Group Header */}
            <View style={[styles.groupHeader, isRTL && styles.rowRTL]}>
              <Text style={styles.groupHeaderText}>
                {t(group.labelKey, group.fallbackLabel)}
              </Text>
            </View>

            {/* Column headers: In-App / Push */}
            <View style={[styles.channelLabelsRow, isRTL && styles.rowRTL]}>
              <View style={styles.typeLabelSpacer} />
              <Text style={styles.channelLabel}>
                {t('notifications.preferencesModal.inApp', 'In-App')}
              </Text>
              <Text style={styles.channelLabel}>
                {t('notifications.preferencesModal.push', 'Push')}
              </Text>
            </View>

            {group.types.map((type, idx) => {
              const pref = getPreference(type);
              const isLast = idx === group.types.length - 1;
              return (
                <View
                  key={type}
                  style={[
                    styles.typeRow,
                    isRTL && styles.rowRTL,
                    !isLast && styles.typeRowBorder,
                  ]}
                >
                  <Text style={[styles.typeLabel, isRTL && styles.textRTL]} numberOfLines={1}>
                    {humaniseType(type)}
                  </Text>
                  <Switch
                    value={pref.channels.in_app}
                    onValueChange={(v) => handleChannelToggle(type, 'in_app', v)}
                    trackColor={{ false: '#e0e0e0', true: '#b7eb8f' }}
                    thumbColor={pref.channels.in_app ? '#52c41a' : '#f4f3f4'}
                    style={styles.switchSmall}
                  />
                  <Switch
                    value={pref.channels.push}
                    onValueChange={(v) => handleChannelToggle(type, 'push', v)}
                    trackColor={{ false: '#e0e0e0', true: '#91caff' }}
                    thumbColor={pref.channels.push ? '#1677ff' : '#f4f3f4'}
                    style={styles.switchSmall}
                  />
                </View>
              );
            })}
          </View>
        ))}

        {/* ──────────── Section 2: Quiet Hours (DND) ──────────── */}
        <Text style={[styles.sectionTitle, isRTL && styles.textRTL]}>
          {t('notifications.preferencesModal.doNotDisturb', 'Do Not Disturb')}
        </Text>
        <Text style={[styles.sectionSubtitle, isRTL && styles.textRTL]}>
          {t(
            'notificationPrefs.dndDesc',
            'Pause non-critical notifications during quiet hours'
          )}
        </Text>

        <View style={styles.card}>
          {/* Enable / Disable */}
          <View style={[styles.settingRow, isRTL && styles.rowRTL]}>
            <Text style={[styles.settingLabel, isRTL && styles.textRTL]}>
              {t('notificationPrefs.enableDnd', 'Enable Quiet Hours')}
            </Text>
            <Switch
              value={!!dndSchedule.is_active}
              onValueChange={handleDndToggle}
              trackColor={{ false: '#e0e0e0', true: '#91caff' }}
              thumbColor={dndSchedule.is_active ? '#1677ff' : '#f4f3f4'}
            />
          </View>

          {dndSchedule.is_active && (
            <>
              <View style={styles.divider} />

              {/* Start Time */}
              <View style={[styles.settingRow, isRTL && styles.rowRTL]}>
                <Text style={[styles.settingLabel, isRTL && styles.textRTL]}>
                  {t('notifications.preferencesModal.doNotDisturbStart', 'Start Time')}
                </Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => handleTimePick('start_time')}
                >
                  <Text style={styles.timeButtonText}>
                    {dndSchedule.start_time ?? '22:00'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* End Time */}
              <View style={[styles.settingRow, isRTL && styles.rowRTL]}>
                <Text style={[styles.settingLabel, isRTL && styles.textRTL]}>
                  {t('notifications.preferencesModal.doNotDisturbEnd', 'End Time')}
                </Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => handleTimePick('end_time')}
                >
                  <Text style={styles.timeButtonText}>
                    {dndSchedule.end_time ?? '08:00'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              {/* Day checkboxes */}
              <Text style={[styles.settingLabel, isRTL && styles.textRTL, { marginBottom: 10, paddingHorizontal: 16 }]}>
                {t('notificationPrefs.activeDays', 'Active Days')}
              </Text>
              <View style={[styles.daysRow, isRTL && styles.rowRTL]}>
                {DAYS_OF_WEEK.map((day) => {
                  const active = (dndSchedule.days_of_week ?? []).includes(day.value);
                  return (
                    <TouchableOpacity
                      key={day.value}
                      style={[styles.dayChip, active && styles.dayChipActive]}
                      onPress={() => handleDayToggle(day.value)}
                    >
                      <Text
                        style={[styles.dayChipText, active && styles.dayChipTextActive]}
                      >
                        {t(day.labelKey, day.fallback)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.divider} />

              {/* Allow critical during quiet hours */}
              <View style={[styles.settingRow, isRTL && styles.rowRTL]}>
                <Text style={[styles.settingLabel, isRTL && styles.textRTL, { flex: 1 }]}>
                  {t(
                    'notificationPrefs.allowCritical',
                    'Allow critical during quiet hours'
                  )}
                </Text>
                <Switch
                  value={!!dndSchedule.allow_critical}
                  onValueChange={handleAllowCriticalToggle}
                  trackColor={{ false: '#e0e0e0', true: '#ffccc7' }}
                  thumbColor={dndSchedule.allow_critical ? '#f5222d' : '#f4f3f4'}
                />
              </View>
            </>
          )}
        </View>

        {/* ──────────── Section 3: Digest Mode ──────────── */}
        <Text style={[styles.sectionTitle, isRTL && styles.textRTL]}>
          {t('notifications.preferencesModal.digestMode', 'Digest Mode')}
        </Text>
        <Text style={[styles.sectionSubtitle, isRTL && styles.textRTL]}>
          {t(
            'notificationPrefs.digestDesc',
            'Choose how often you receive notification summaries'
          )}
        </Text>

        <View style={styles.card}>
          {DIGEST_OPTIONS.map((option, idx) => {
            const selected = selectedDigest === option.value;
            const isLast = idx === DIGEST_OPTIONS.length - 1;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.digestRow,
                  isRTL && styles.rowRTL,
                  !isLast && styles.typeRowBorder,
                ]}
                onPress={() => handleDigestSelect(option.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                  {selected && <View style={styles.radioInner} />}
                </View>
                <Text
                  style={[
                    styles.digestLabel,
                    isRTL && styles.textRTL,
                    selected && styles.digestLabelSelected,
                  ]}
                >
                  {t(option.labelKey, option.fallback)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ──────────── Section 4: Reset to Defaults ──────────── */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleReset}
          activeOpacity={0.7}
          disabled={resetPrefsMutation.isPending}
        >
          {resetPrefsMutation.isPending ? (
            <ActivityIndicator size="small" color="#f5222d" />
          ) : (
            <Text style={styles.resetButtonText}>
              {t('notificationPrefs.resetToDefaults', 'Reset to Defaults')}
            </Text>
          )}
        </TouchableOpacity>

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  headerRTL: {
    flexDirection: 'row-reverse',
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1677ff',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  headerRight: {
    width: 36,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Section headings
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 8,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  // Group header
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fafafa',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  groupHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#595959',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Channel column headers
  channelLabelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  typeLabelSpacer: {
    flex: 1,
  },
  channelLabel: {
    width: 56,
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textAlign: 'center',
  },

  // Type rows
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  typeRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  typeLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  switchSmall: {
    width: 56,
    transform: Platform.OS === 'ios' ? [{ scaleX: 0.8 }, { scaleY: 0.8 }] : [],
  },

  // Settings row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingLabel: {
    fontSize: 15,
    color: '#333',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 16,
  },

  // Time button
  timeButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  timeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1677ff',
  },

  // Day chips
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dayChipActive: {
    backgroundColor: '#1677ff',
    borderColor: '#1677ff',
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  dayChipTextActive: {
    color: '#fff',
  },

  // Digest rows
  digestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d9d9d9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: '#1677ff',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1677ff',
  },
  digestLabel: {
    fontSize: 15,
    color: '#333',
  },
  digestLabelSelected: {
    fontWeight: '600',
    color: '#1677ff',
  },

  // Reset button
  resetButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffccc7',
    backgroundColor: '#fff2f0',
    marginTop: 4,
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f5222d',
  },

  // RTL helpers
  textRTL: {
    textAlign: 'right',
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
});
