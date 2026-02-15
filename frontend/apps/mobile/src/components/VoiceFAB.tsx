import React, { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Animated,
  View,
  Text,
} from 'react-native';
import { useVoiceCommands } from '../hooks/useVoiceCommands';

const COLORS = {
  primary: '#1677ff',
  listening: '#52c41a',
  disabled: '#d9d9d9',
  white: '#ffffff',
};

interface VoiceFABProps {
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  size?: number;
  showLabel?: boolean;
}

/**
 * VoiceFAB - Floating Action Button for triggering voice commands
 *
 * A simple, accessible button that users can tap to start voice recognition.
 * Shows visual feedback when listening.
 */
export function VoiceFAB({
  position = 'bottom-right',
  size = 56,
  showLabel = false,
}: VoiceFABProps) {
  const { isListening, isEnabled, isSupported, toggleListening, error } = useVoiceCommands();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when listening
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  // Don't render if voice commands are disabled or not supported
  if (!isEnabled || !isSupported) {
    return null;
  }

  const positionStyle = {
    'bottom-right': { right: 20, bottom: 100 },
    'bottom-left': { left: 20, bottom: 100 },
    'bottom-center': { alignSelf: 'center' as const, bottom: 100 },
  }[position];

  const buttonColor = isListening ? COLORS.listening : COLORS.primary;

  return (
    <View style={[styles.container, positionStyle]}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={[
            styles.fab,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: buttonColor,
            },
          ]}
          onPress={toggleListening}
          activeOpacity={0.8}
          accessibilityLabel={isListening ? 'Stop listening' : 'Start voice command'}
          accessibilityRole="button"
        >
          <Text style={styles.icon}>{isListening ? '...' : '🎤'}</Text>
        </TouchableOpacity>
      </Animated.View>
      {showLabel && (
        <Text style={styles.label}>
          {isListening ? 'Listening...' : 'Voice'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 1000,
  },
  fab: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  icon: {
    fontSize: 24,
    color: COLORS.white,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
});

export default VoiceFAB;
