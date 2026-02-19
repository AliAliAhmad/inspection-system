/**
 * PushToTalk Component
 * Walkie-talkie style push-to-talk for team communication
 * Hold the button to record, release to send voice message
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

export interface PushToTalkProps {
  /** Called when recording completes with audio URI */
  onRecordingComplete: (audioUri: string, durationMs: number) => void;
  /** Channel or recipient ID */
  channelId: number;
  /** Whether the component is enabled */
  enabled?: boolean;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Whether currently connected to channel */
  isConnected?: boolean;
}

let Audio: any = null;
try {
  Audio = require('expo-av').Audio;
} catch {
  // expo-av not available
}

export function PushToTalk({
  onRecordingComplete,
  channelId,
  enabled = true,
  size = 'medium',
  isConnected = true,
}: PushToTalkProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const recordingRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const sizeConfig = {
    small: { button: 56, icon: 22, ring: 68 },
    medium: { button: 72, icon: 28, ring: 88 },
    large: { button: 96, icon: 36, ring: 112 },
  }[size];

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const startRecording = useCallback(async () => {
    if (!Audio || !enabled || !isConnected) return;

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          isAr ? 'صلاحية الميكروفون' : 'Microphone Permission',
          isAr ? 'يرجى تفعيل صلاحية الميكروفون' : 'Please enable microphone access'
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(Date.now() - startTimeRef.current);
      }, 100);

      // Haptic + visual feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      startPulse();

      Animated.spring(scaleAnim, {
        toValue: 0.9,
        useNativeDriver: true,
      }).start();
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [enabled, isConnected, isAr, startPulse, scaleAnim]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      stopPulse();
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
      }).start();

      setIsRecording(false);
      const durationMs = Date.now() - startTimeRef.current;
      setRecordingDuration(0);

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      // Minimum 500ms recording
      if (durationMs < 500) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      if (uri) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsSending(true);
        onRecordingComplete(uri, durationMs);
        setTimeout(() => setIsSending(false), 1000);
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setIsRecording(false);
      recordingRef.current = null;
    }
  }, [onRecordingComplete, stopPulse, scaleAnim]);

  const longPressGesture = Gesture.LongPress()
    .minDuration(200)
    .onStart(() => {
      startRecording();
    })
    .onEnd(() => {
      stopRecording();
    });

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${seconds}.${tenths}s`;
  };

  const buttonColor = isRecording
    ? '#f5222d'
    : !enabled || !isConnected
    ? '#d9d9d9'
    : '#1677ff';

  return (
    <View style={styles.container}>
      {/* Status indicator */}
      <View style={[styles.statusRow, isAr && styles.rtlRow]}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isConnected ? '#52c41a' : '#d9d9d9' },
          ]}
        />
        <Text style={[styles.statusText, isAr && styles.rtlText]}>
          {isRecording
            ? isAr
              ? 'جاري التسجيل...'
              : 'Recording...'
            : isSending
            ? isAr
              ? 'جاري الإرسال...'
              : 'Sending...'
            : isConnected
            ? isAr
              ? 'متصل'
              : 'Connected'
            : isAr
            ? 'غير متصل'
            : 'Disconnected'}
        </Text>
      </View>

      {/* Recording duration */}
      {isRecording && (
        <Text style={styles.durationText}>
          {formatDuration(recordingDuration)}
        </Text>
      )}

      {/* Push-to-talk button */}
      <GestureDetector gesture={longPressGesture}>
        <View style={styles.buttonWrapper}>
          {/* Pulse ring */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                width: sizeConfig.ring,
                height: sizeConfig.ring,
                borderRadius: sizeConfig.ring / 2,
                opacity: isRecording ? 0.3 : 0,
                transform: [{ scale: pulseAnim }],
                backgroundColor: '#f5222d',
              },
            ]}
          />

          {/* Main button */}
          <Animated.View
            style={[
              styles.button,
              {
                width: sizeConfig.button,
                height: sizeConfig.button,
                borderRadius: sizeConfig.button / 2,
                backgroundColor: buttonColor,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <Text style={[styles.buttonIcon, { fontSize: sizeConfig.icon }]}>
              🎙️
            </Text>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Instruction */}
      <Text style={[styles.instructionText, isAr && styles.rtlText]}>
        {isAr ? 'اضغط مطولاً للتحدث' : 'Hold to talk'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#8c8c8c',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  durationText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f5222d',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  buttonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)',
  },
  buttonIcon: {
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 12,
    color: '#8c8c8c',
    fontWeight: '500',
  },
});

export default PushToTalk;
