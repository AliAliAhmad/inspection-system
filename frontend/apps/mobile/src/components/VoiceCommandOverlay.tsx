import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useVoiceCommands } from '../hooks/useVoiceCommands';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Colors
const COLORS = {
  listening: '#1677ff',      // Blue for listening
  success: '#52c41a',        // Green for success
  error: '#ff4d4f',          // Red for error
  overlay: 'rgba(0, 0, 0, 0.7)',
  white: '#ffffff',
  lightGray: '#f5f5f5',
  darkGray: '#262626',
};

interface VoiceCommandOverlayProps {
  showCommands?: boolean;
}

export default function VoiceCommandOverlay({ showCommands = true }: VoiceCommandOverlayProps) {
  const { i18n } = useTranslation();
  const { isListening, isEnabled, lastCommand, lastTranscript, error, stopListening } = useVoiceCommands();
  const isAr = i18n.language === 'ar';

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0)).current;

  // Pulse animation for microphone
  useEffect(() => {
    if (isListening) {
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

      // Ring expand animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringScale, {
            toValue: 2,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(ringScale, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      ringScale.stopAnimation();
      ringScale.setValue(0);
    }
  }, [isListening, pulseAnim, ringScale]);

  // Fade in/out animation
  useEffect(() => {
    if (isListening) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isListening, fadeAnim]);

  // Command hints
  const commandHints = isAr
    ? [
        { command: 'وقف', action: 'Pause' },
        { command: 'كامل', action: 'Complete' },
        { command: 'التالي', action: 'Next' },
        { command: 'نعم', action: 'Pass' },
        { command: 'لا', action: 'Fail' },
      ]
    : [
        { command: 'Pause', action: 'Pause current task' },
        { command: 'Complete', action: 'Complete task' },
        { command: 'Next', action: 'Go to next' },
        { command: 'Pass', action: 'Mark as passed' },
        { command: 'Fail', action: 'Mark as failed' },
        { command: 'Help', action: 'Show help' },
      ];

  if (!isEnabled) {
    return null;
  }

  return (
    <Modal
      visible={isListening}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={stopListening}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={stopListening}
        >
          {/* Microphone Icon with Pulse */}
          <View style={styles.micContainer}>
            {/* Expanding ring */}
            <Animated.View
              style={[
                styles.ring,
                {
                  transform: [{ scale: ringScale }],
                  opacity: ringScale.interpolate({
                    inputRange: [0, 2],
                    outputRange: [0.6, 0],
                  }),
                },
              ]}
            />

            {/* Microphone button */}
            <Animated.View
              style={[
                styles.micButton,
                {
                  transform: [{ scale: pulseAnim }],
                  backgroundColor: error ? COLORS.error : COLORS.listening,
                },
              ]}
            >
              <Text style={styles.micIcon}>🎤</Text>
            </Animated.View>
          </View>

          {/* Status Text */}
          <Text style={styles.statusText}>
            {error
              ? error
              : isAr
              ? 'جاري الاستماع...'
              : 'Listening...'}
          </Text>

          {/* Last Transcript */}
          {lastTranscript ? (
            <View style={styles.transcriptContainer}>
              <Text style={styles.transcriptLabel}>
                {isAr ? 'سمعت:' : 'Heard:'}
              </Text>
              <Text style={styles.transcriptText}>{lastTranscript}</Text>
            </View>
          ) : null}

          {/* Last Command Result */}
          {lastCommand && (
            <View
              style={[
                styles.commandResult,
                { backgroundColor: COLORS.success },
              ]}
            >
              <Text style={styles.commandText}>
                {isAr ? `الأمر: ${lastCommand.action}` : `Command: ${lastCommand.action}`}
              </Text>
            </View>
          )}

          {/* Command Hints */}
          {showCommands && (
            <View style={styles.hintsContainer}>
              <Text style={styles.hintsTitle}>
                {isAr ? 'الأوامر المتاحة:' : 'Available Commands:'}
              </Text>
              <View style={styles.hintsGrid}>
                {commandHints.map((hint, index) => (
                  <View key={index} style={styles.hintItem}>
                    <Text style={styles.hintCommand}>"{hint.command}"</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Tap to Close Hint */}
          <Text style={styles.closeHint}>
            {isAr ? 'اضغط للإغلاق' : 'Tap to close'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTouchable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  micContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  ring: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.listening,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 12px rgba(22, 119, 255, 0.4)',
    elevation: 8,
  },
  micIcon: {
    fontSize: 48,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 16,
  },
  transcriptContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    maxWidth: SCREEN_WIDTH - 80,
  },
  transcriptLabel: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginBottom: 4,
  },
  transcriptText: {
    fontSize: 16,
    color: COLORS.white,
    textAlign: 'center',
  },
  commandResult: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 24,
  },
  commandText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  hintsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    maxWidth: SCREEN_WIDTH - 60,
    width: '100%',
  },
  hintsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.lightGray,
    marginBottom: 12,
    textAlign: 'center',
  },
  hintsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  hintItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  hintCommand: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '500',
  },
  closeHint: {
    position: 'absolute',
    bottom: 60,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
});
