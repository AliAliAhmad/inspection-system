import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface SmartTimerProps {
  startedAt: string | null;
  plannedHours: number | null;
  isPaused: boolean;
  pausedMinutes?: number;
  onPause: (reason: string, details?: string) => void;
  onResume: () => void;
  onComplete: () => void;
  jobId: string;
}

const PAUSE_REASONS = [
  { value: 'parts', label: 'Waiting for Parts' },
  { value: 'duty_finish', label: 'End of Shift' },
  { value: 'tools', label: 'Need Tools' },
  { value: 'manpower', label: 'Need Assistance' },
  { value: 'oem', label: 'Waiting for OEM' },
  { value: 'other', label: 'Other' },
];

const INACTIVITY_WARNING_MS = 15 * 60 * 1000; // 15 minutes

export function SmartTimer({
  startedAt,
  plannedHours,
  isPaused,
  pausedMinutes = 0,
  onPause,
  onResume,
  onComplete,
  jobId,
}: SmartTimerProps) {
  const { t } = useTranslation();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState<string>('');
  const [pauseDetails, setPauseDetails] = useState('');
  const [lastActiveTime, setLastActiveTime] = useState(Date.now());
  const appState = useRef(AppState.currentState);

  // Calculate elapsed time
  useEffect(() => {
    if (!startedAt || isPaused) return;

    const startTime = new Date(startedAt).getTime();
    const pausedMs = (pausedMinutes || 0) * 60 * 1000;

    const updateElapsed = () => {
      const now = Date.now();
      const totalElapsed = now - startTime - pausedMs;
      setElapsedSeconds(Math.max(0, Math.floor(totalElapsed / 1000)));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startedAt, isPaused, pausedMinutes]);

  // Track app state for inactivity detection
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current === 'background' && nextAppState === 'active') {
        // App came to foreground - check how long it was in background
        const inactiveTime = Date.now() - lastActiveTime;
        if (inactiveTime > INACTIVITY_WARNING_MS && !isPaused) {
          Alert.alert(
            t('jobs.inactivity_warning', 'Long Inactivity Detected'),
            t('jobs.inactivity_mobile_description', 'The app was in background for a while. Do you want to pause the job?'),
            [
              { text: t('jobs.continue_working', 'Continue Working'), style: 'cancel' },
              {
                text: t('jobs.pause', 'Pause'),
                onPress: () => setShowPauseModal(true),
              },
            ]
          );
        }
      }
      if (nextAppState === 'background') {
        setLastActiveTime(Date.now());
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [lastActiveTime, isPaused, t]);

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const plannedSeconds = (plannedHours || 0) * 3600;
  const progressPercent = plannedSeconds > 0 ? Math.min((elapsedSeconds / plannedSeconds) * 100, 100) : 0;
  const isOvertime = elapsedSeconds > plannedSeconds && plannedSeconds > 0;
  const overtimeSeconds = isOvertime ? elapsedSeconds - plannedSeconds : 0;

  const handlePauseSubmit = () => {
    if (pauseReason) {
      onPause(pauseReason, pauseDetails);
      setShowPauseModal(false);
      setPauseReason('');
      setPauseDetails('');
    }
  };

  const getProgressColor = () => {
    if (isOvertime) return '#f5222d';
    if (progressPercent > 80) return '#faad14';
    return '#52c41a';
  };

  return (
    <View style={styles.container}>
      {/* Timer Display */}
      <View style={styles.timerSection}>
        <View style={[styles.statusBadge, { backgroundColor: isPaused ? '#722ed1' : '#1890ff' }]}>
          <Text style={styles.statusText}>
            {isPaused ? t('status.paused') : t('status.in_progress')}
          </Text>
        </View>
        <Text style={[styles.timerText, isOvertime && styles.timerOvertime]}>
          {formatTime(elapsedSeconds)}
        </Text>
        {isOvertime && (
          <Text style={styles.overtimeText}>
            ⚠️ Overtime: +{formatTime(overtimeSeconds)}
          </Text>
        )}
      </View>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(progressPercent, 100)}%`, backgroundColor: getProgressColor() },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {Math.round(progressPercent)}% • Planned: {plannedHours || 0}h
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        {isPaused ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.resumeButton]}
            onPress={onResume}
          >
            <Text style={styles.actionButtonText}>▶ {t('jobs.resume', 'Resume')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.pauseButton]}
            onPress={() => setShowPauseModal(true)}
          >
            <Text style={styles.actionButtonText}>⏸ {t('jobs.pause', 'Pause')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionButton, styles.completeButton]}
          onPress={onComplete}
        >
          <Text style={styles.actionButtonText}>✓ {t('jobs.complete', 'Complete')}</Text>
        </TouchableOpacity>
      </View>

      {/* Pause Modal */}
      <Modal
        visible={showPauseModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPauseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('jobs.pause_job', 'Pause Job')}</Text>

            <Text style={styles.modalLabel}>{t('jobs.pause_reason', 'Reason')}</Text>
            <View style={styles.reasonsGrid}>
              {PAUSE_REASONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[
                    styles.reasonChip,
                    pauseReason === r.value && styles.reasonChipActive,
                  ]}
                  onPress={() => setPauseReason(r.value)}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      pauseReason === r.value && styles.reasonChipTextActive,
                    ]}
                  >
                    {t(`jobs.pause_reasons.${r.value}`, r.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>
              {t('jobs.additional_details', 'Details')} ({t('common.optional', 'Optional')})
            </Text>
            <TextInput
              style={styles.detailsInput}
              value={pauseDetails}
              onChangeText={setPauseDetails}
              placeholder={t('jobs.pause_details_placeholder', 'Additional details...')}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPauseModal(false);
                  setPauseReason('');
                  setPauseDetails('');
                }}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  !pauseReason && styles.buttonDisabled,
                ]}
                onPress={handlePauseSubmit}
                disabled={!pauseReason}
              >
                <Text style={styles.modalSubmitText}>{t('jobs.pause', 'Pause')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  timerSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timerText: {
    fontSize: 48,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: '#212121',
  },
  timerOvertime: {
    color: '#f5222d',
  },
  overtimeText: {
    fontSize: 14,
    color: '#f5222d',
    marginTop: 4,
  },
  progressSection: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: '#722ed1',
  },
  resumeButton: {
    backgroundColor: '#1890ff',
  },
  completeButton: {
    backgroundColor: '#52c41a',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  reasonChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  reasonChipActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976D2',
  },
  reasonChipText: {
    fontSize: 14,
    color: '#424242',
  },
  reasonChipTextActive: {
    color: '#1976D2',
    fontWeight: '600',
  },
  detailsInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bdbdbd',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#722ed1',
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default SmartTimer;
