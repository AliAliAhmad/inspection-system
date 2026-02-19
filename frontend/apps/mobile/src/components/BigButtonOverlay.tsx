/**
 * BigButtonOverlay Component
 *
 * Displays 4 giant color-coded action buttons fixed at the bottom of every screen.
 * Designed for high visibility in outdoor/industrial environments.
 *
 * Buttons:
 * - PAUSE (Yellow #faad14) - Pauses current job
 * - COMPLETE (Green #52c41a) - Marks job complete
 * - INCOMPLETE (Red #f5222d) - Marks job incomplete
 * - HELP (Blue #1677ff) - Opens help/support
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated,
  Linking,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlanTrackingApi } from '@inspection/shared';
import type { PauseReasonCategory, IncompleteReasonCategory } from '@inspection/shared';
import { useBigButtonMode } from '../hooks/useBigButtonMode';

// Button configuration
const BUTTON_SIZE = 120;
const BUTTON_MARGIN = 8;

interface ButtonConfig {
  id: 'pause' | 'resume' | 'complete' | 'incomplete' | 'help';
  labelEn: string;
  labelAr: string;
  icon: string;
  color: string;
  bgColor: string;
}

const BUTTONS: Record<string, ButtonConfig> = {
  pause: {
    id: 'pause',
    labelEn: 'PAUSE',
    labelAr: '\u0625\u064A\u0642\u0627\u0641',
    icon: '\u23F8\uFE0F',
    color: '#000000',
    bgColor: '#faad14',
  },
  resume: {
    id: 'resume',
    labelEn: 'RESUME',
    labelAr: '\u0625\u0633\u062A\u0626\u0646\u0627\u0641',
    icon: '\u25B6\uFE0F',
    color: '#000000',
    bgColor: '#faad14',
  },
  complete: {
    id: 'complete',
    labelEn: 'COMPLETE',
    labelAr: '\u0645\u0643\u062A\u0645\u0644',
    icon: '\u2705',
    color: '#ffffff',
    bgColor: '#52c41a',
  },
  incomplete: {
    id: 'incomplete',
    labelEn: 'INCOMPLETE',
    labelAr: '\u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644',
    icon: '\u274C',
    color: '#ffffff',
    bgColor: '#f5222d',
  },
  help: {
    id: 'help',
    labelEn: 'HELP',
    labelAr: '\u0645\u0633\u0627\u0639\u062F\u0629',
    icon: '\u2753',
    color: '#ffffff',
    bgColor: '#1677ff',
  },
};

const PAUSE_REASONS: { key: PauseReasonCategory; labelEn: string; labelAr: string }[] = [
  { key: 'break', labelEn: 'Break', labelAr: '\u0627\u0633\u062A\u0631\u0627\u062D\u0629' },
  { key: 'waiting_for_materials', labelEn: 'Waiting for Materials', labelAr: '\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u062F' },
  { key: 'urgent_task', labelEn: 'Called to Urgent Task', labelAr: '\u0645\u0647\u0645\u0629 \u0639\u0627\u062C\u0644\u0629' },
  { key: 'waiting_for_access', labelEn: 'Waiting for Access', labelAr: '\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0648\u0635\u0648\u0644' },
  { key: 'other', labelEn: 'Other', labelAr: '\u0623\u062E\u0631\u0649' },
];

const INCOMPLETE_REASONS: { key: IncompleteReasonCategory; labelEn: string; labelAr: string }[] = [
  { key: 'missing_parts', labelEn: 'Missing Parts', labelAr: '\u0642\u0637\u0639 \u0645\u0641\u0642\u0648\u062F\u0629' },
  { key: 'equipment_not_accessible', labelEn: 'Equipment Not Accessible', labelAr: '\u0627\u0644\u0645\u0639\u062F\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629' },
  { key: 'time_ran_out', labelEn: 'Time Ran Out', labelAr: '\u0627\u0646\u062A\u0647\u0649 \u0627\u0644\u0648\u0642\u062A' },
  { key: 'safety_concern', labelEn: 'Safety Concern', labelAr: '\u0645\u062E\u0627\u0648\u0641 \u0627\u0644\u0633\u0644\u0627\u0645\u0629' },
  { key: 'other', labelEn: 'Other', labelAr: '\u0623\u062E\u0631\u0649' },
];

// Animated button component with press effect
interface BigButtonProps {
  config: ButtonConfig;
  onPress: () => void;
  disabled?: boolean;
  isAr: boolean;
}

function BigButton({ config, onPress, disabled, isAr }: BigButtonProps) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPress();
  }, [onPress]);

  const label = isAr ? config.labelAr : config.labelEn;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.bigButton,
          { backgroundColor: config.bgColor },
          disabled && styles.bigButtonDisabled,
        ]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonIcon}>{config.icon}</Text>
        <Text style={[styles.buttonLabel, { color: config.color }]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function BigButtonOverlay() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = i18n.language === 'ar';
  const [minimized, setMinimized] = useState(false);

  const { isEnabled, isLoading, activeJob, refetchJobs } = useBigButtonMode();

  // Modal states
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [workNotes, setWorkNotes] = useState('');

  // Mutations
  const pauseMutation = useMutation({
    mutationFn: (payload: { reason_category: string; reason_details?: string }) =>
      workPlanTrackingApi.pauseJob(activeJob.jobId!, payload as any),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPauseModal(false);
      setSelectedReason('');
      setReasonDetails('');
      refetchJobs();
      queryClient.invalidateQueries({ queryKey: ['job-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(isAr ? '\u062E\u0637\u0623' : 'Error', err?.response?.data?.message || (isAr ? '\u0641\u0634\u0644 \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0639\u0645\u0644' : 'Failed to pause job'));
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => workPlanTrackingApi.resumeJob(activeJob.jobId!),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchJobs();
      queryClient.invalidateQueries({ queryKey: ['job-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(isAr ? '\u062E\u0637\u0623' : 'Error', err?.response?.data?.message || (isAr ? '\u0641\u0634\u0644 \u0627\u0633\u062A\u0626\u0646\u0627\u0641 \u0627\u0644\u0639\u0645\u0644' : 'Failed to resume job'));
    },
  });

  const completeMutation = useMutation({
    mutationFn: (payload: { work_notes?: string }) =>
      workPlanTrackingApi.completeJob(activeJob.jobId!, payload),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCompleteModal(false);
      setWorkNotes('');
      refetchJobs();
      queryClient.invalidateQueries({ queryKey: ['job-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      Alert.alert(
        isAr ? '\u062A\u0645' : 'Success',
        isAr ? '\u0627\u0643\u062A\u0645\u0644 \u0627\u0644\u0639\u0645\u0644!' : 'Job completed!'
      );
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(isAr ? '\u062E\u0637\u0623' : 'Error', err?.response?.data?.message || (isAr ? '\u0641\u0634\u0644 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0639\u0645\u0644' : 'Failed to complete job'));
    },
  });

  const incompleteMutation = useMutation({
    mutationFn: (payload: { reason_category: string; reason_details?: string }) =>
      workPlanTrackingApi.markIncomplete(activeJob.jobId!, payload as any),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowIncompleteModal(false);
      setSelectedReason('');
      setReasonDetails('');
      refetchJobs();
      queryClient.invalidateQueries({ queryKey: ['job-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      Alert.alert(
        isAr ? '\u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644' : 'Incomplete',
        isAr ? '\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0639\u0645\u0644 \u0643\u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644' : 'Job marked as incomplete. It will be carried over.'
      );
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(isAr ? '\u062E\u0637\u0623' : 'Error', err?.response?.data?.message || (isAr ? '\u0641\u0634\u0644' : 'Failed'));
    },
  });

  // Handler functions
  const handlePause = useCallback(() => {
    if (activeJob.canPause) {
      setShowPauseModal(true);
    }
  }, [activeJob.canPause]);

  const handleResume = useCallback(() => {
    if (activeJob.canResume) {
      resumeMutation.mutate();
    }
  }, [activeJob.canResume, resumeMutation]);

  const handleComplete = useCallback(() => {
    if (activeJob.canComplete) {
      setShowCompleteModal(true);
    }
  }, [activeJob.canComplete]);

  const handleIncomplete = useCallback(() => {
    if (activeJob.canMarkIncomplete) {
      setShowIncompleteModal(true);
    }
  }, [activeJob.canMarkIncomplete]);

  const handleHelp = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Open support phone/WhatsApp or in-app help
    Alert.alert(
      isAr ? '\u0645\u0633\u0627\u0639\u062F\u0629' : 'Help',
      isAr ? '\u0647\u0644 \u062A\u0631\u064A\u062F \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u062F\u0639\u0645\u061F' : 'Do you need to contact support?',
      [
        { text: isAr ? '\u0625\u0644\u063A\u0627\u0621' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? '\u0627\u062A\u0635\u0627\u0644' : 'Call',
          onPress: () => Linking.openURL('tel:+966500000000'),
        },
        {
          text: 'WhatsApp',
          onPress: () => Linking.openURL('https://wa.me/966500000000'),
        },
      ]
    );
  }, [isAr]);

  // Do not render if not enabled or loading
  if (!isEnabled || isLoading) {
    return null;
  }

  // Determine which buttons to show based on job state
  const hasActiveJob = !!activeJob.jobId;
  const isPaused = activeJob.isPaused;
  const isInProgress = activeJob.status === 'in_progress';

  // Build button array based on context
  const visibleButtons: ButtonConfig[] = [];

  if (hasActiveJob) {
    if (isPaused) {
      visibleButtons.push(BUTTONS.resume);
    } else if (isInProgress) {
      visibleButtons.push(BUTTONS.pause);
    }
    if (activeJob.canComplete) {
      visibleButtons.push(BUTTONS.complete);
    }
    if (activeJob.canMarkIncomplete) {
      visibleButtons.push(BUTTONS.incomplete);
    }
  }

  // Always show help
  visibleButtons.push(BUTTONS.help);

  // Minimized: show a small expand button
  if (minimized) {
    return (
      <TouchableOpacity
        style={styles.expandButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setMinimized(false);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.expandIcon}>▲</Text>
        <Text style={styles.expandLabel}>{isAr ? 'أزرار' : 'Actions'}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      {/* Main overlay container */}
      <View style={styles.container}>
        {/* Minimize button */}
        <TouchableOpacity
          style={styles.minimizeButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMinimized(true);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
        >
          <Text style={styles.minimizeIcon}>▼</Text>
        </TouchableOpacity>

        <View style={[styles.buttonRow, isAr && styles.buttonRowRtl]}>
          {visibleButtons.map((btn) => (
            <BigButton
              key={btn.id}
              config={btn}
              isAr={isAr}
              onPress={
                btn.id === 'pause'
                  ? handlePause
                  : btn.id === 'resume'
                    ? handleResume
                    : btn.id === 'complete'
                      ? handleComplete
                      : btn.id === 'incomplete'
                        ? handleIncomplete
                        : handleHelp
              }
              disabled={
                (btn.id === 'pause' && !activeJob.canPause) ||
                (btn.id === 'resume' && !activeJob.canResume) ||
                (btn.id === 'complete' && !activeJob.canComplete) ||
                (btn.id === 'incomplete' && !activeJob.canMarkIncomplete)
              }
            />
          ))}
        </View>
      </View>

      {/* Pause Modal */}
      <Modal visible={showPauseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isAr ? '\u0633\u0628\u0628 \u0627\u0644\u0625\u064A\u0642\u0627\u0641' : 'Pause Reason'}
            </Text>
            <ScrollView style={styles.reasonList}>
              {PAUSE_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.key}
                  style={[
                    styles.reasonButton,
                    selectedReason === reason.key && styles.reasonButtonSelected,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedReason(reason.key);
                  }}
                >
                  <Text
                    style={[
                      styles.reasonButtonText,
                      selectedReason === reason.key && styles.reasonButtonTextSelected,
                    ]}
                  >
                    {isAr ? reason.labelAr : reason.labelEn}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedReason === 'other' && (
              <TextInput
                style={styles.textInput}
                placeholder={isAr ? '\u0648\u0635\u0641 \u0627\u0644\u0633\u0628\u0628...' : 'Describe reason...'}
                value={reasonDetails}
                onChangeText={setReasonDetails}
                multiline
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowPauseModal(false);
                  setSelectedReason('');
                }}
              >
                <Text style={styles.modalCancelText}>
                  {isAr ? '\u0625\u0644\u063A\u0627\u0621' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  styles.pauseConfirm,
                  !selectedReason && styles.modalConfirmDisabled,
                ]}
                onPress={() => {
                  if (selectedReason) {
                    pauseMutation.mutate({
                      reason_category: selectedReason,
                      reason_details: reasonDetails || undefined,
                    });
                  }
                }}
                disabled={!selectedReason || pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.modalConfirmTextDark}>
                    {isAr ? '\u0625\u064A\u0642\u0627\u0641' : 'Pause'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Modal */}
      <Modal visible={showCompleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isAr ? '\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0639\u0645\u0644' : 'Complete Job'}
            </Text>
            <TextInput
              style={[styles.textInput, { height: 80 }]}
              placeholder={isAr ? '\u0645\u0644\u0627\u062D\u0638\u0627\u062A (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)...' : 'Work notes (optional)...'}
              value={workNotes}
              onChangeText={setWorkNotes}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowCompleteModal(false)}
              >
                <Text style={styles.modalCancelText}>
                  {isAr ? '\u0625\u0644\u063A\u0627\u0621' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, styles.completeConfirm]}
                onPress={() => completeMutation.mutate({ work_notes: workNotes || undefined })}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {isAr ? '\u0625\u0643\u0645\u0627\u0644' : 'Complete'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Incomplete Modal */}
      <Modal visible={showIncompleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isAr ? '\u062A\u0633\u062C\u064A\u0644 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644' : 'Mark Incomplete'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {isAr ? '\u0627\u062E\u062A\u0631 \u0627\u0644\u0633\u0628\u0628:' : 'Select reason:'}
            </Text>
            <ScrollView style={styles.reasonList}>
              {INCOMPLETE_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.key}
                  style={[
                    styles.reasonButton,
                    selectedReason === reason.key && styles.reasonButtonSelected,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedReason(reason.key);
                  }}
                >
                  <Text
                    style={[
                      styles.reasonButtonText,
                      selectedReason === reason.key && styles.reasonButtonTextSelected,
                    ]}
                  >
                    {isAr ? reason.labelAr : reason.labelEn}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.textInput, { height: 60 }]}
              placeholder={isAr ? '\u062A\u0641\u0627\u0635\u064A\u0644 \u0625\u0636\u0627\u0641\u064A\u0629...' : 'Additional details...'}
              value={reasonDetails}
              onChangeText={setReasonDetails}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowIncompleteModal(false);
                  setSelectedReason('');
                }}
              >
                <Text style={styles.modalCancelText}>
                  {isAr ? '\u0625\u0644\u063A\u0627\u0621' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  styles.incompleteConfirm,
                  !selectedReason && styles.modalConfirmDisabled,
                ]}
                onPress={() => {
                  if (selectedReason) {
                    incompleteMutation.mutate({
                      reason_category: selectedReason,
                      reason_details: reasonDetails || undefined,
                    });
                  }
                }}
                disabled={!selectedReason || incompleteMutation.isPending}
              >
                {incompleteMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {isAr ? '\u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644' : 'Mark Incomplete'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 24,
    paddingTop: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // High contrast shadow for outdoor visibility
    boxShadow: '0px -4px 8px rgba(0, 0, 0, 0.3)',
    elevation: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: BUTTON_MARGIN,
  },
  buttonRowRtl: {
    flexDirection: 'row-reverse',
  },
  bigButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: BUTTON_MARGIN / 2,
    // Strong shadow for depth
    boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.3)',
    elevation: 8,
    // Border for high contrast
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  bigButtonDisabled: {
    opacity: 0.4,
  },
  buttonIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#262626',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 12,
  },
  reasonList: {
    maxHeight: 200,
  },
  reasonButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    marginBottom: 10,
  },
  reasonButtonSelected: {
    backgroundColor: '#e6f4ff',
    borderWidth: 2,
    borderColor: '#1677ff',
  },
  reasonButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  reasonButtonTextSelected: {
    color: '#1677ff',
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    fontSize: 16,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  modalCancel: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  modalConfirm: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  modalConfirmDisabled: {
    opacity: 0.5,
  },
  pauseConfirm: {
    backgroundColor: '#faad14',
  },
  completeConfirm: {
    backgroundColor: '#52c41a',
  },
  incompleteConfirm: {
    backgroundColor: '#f5222d',
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  modalConfirmTextDark: {
    color: '#000',
    fontWeight: '700',
    fontSize: 16,
  },
  minimizeButton: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  minimizeIcon: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  expandButton: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  expandIcon: {
    fontSize: 14,
    color: '#fff',
  },
  expandLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
