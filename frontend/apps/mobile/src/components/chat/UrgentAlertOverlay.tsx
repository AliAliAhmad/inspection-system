import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';

export interface UrgentAlertProps {
  visible: boolean;
  senderName: string;
  channelName: string;
  messagePreview: string;
  onDismiss: () => void;
}

export function UrgentAlertOverlay({
  visible,
  senderName,
  channelName,
  messagePreview,
  onDismiss,
}: UrgentAlertProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const vibrationActiveRef = useRef(false);

  // Pulsing animation
  useEffect(() => {
    if (!visible) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    return () => {
      pulse.stop();
      pulseAnim.setValue(1);
    };
  }, [visible, pulseAnim]);

  // Sound and vibration
  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    // Start continuous vibration pattern (500ms on, 500ms off, repeating)
    vibrationActiveRef.current = true;
    Vibration.vibrate([500, 500, 500, 500], true);

    // Play alarm sound on loop
    const startSound = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        // Use a system-like alert sound via expo-av
        // We create a short beep pattern by playing a frequency tone
        // Since expo-av doesn't support tone generation, we rely on vibration
        // and attempt to load a bundled alert asset if available
        // For maximum compatibility, the vibration IS the alert sound backup
        try {
          const { sound } = await Audio.Sound.createAsync(
            // Try to use a bundled notification sound
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('../../../assets/alert-sound.mp3'),
            { isLooping: true, volume: 1.0 },
          );
          if (mounted) {
            soundRef.current = sound;
            await sound.playAsync();
          } else {
            await sound.unloadAsync();
          }
        } catch {
          // Alert sound asset not found - vibration alone will serve as alert
          // This is acceptable; the visual + vibration is the primary alert
          console.log('UrgentAlert: No alert sound asset, using vibration only');
        }
      } catch (err) {
        console.error('UrgentAlert sound setup failed:', err);
      }
    };

    startSound();

    return () => {
      mounted = false;
      Vibration.cancel();
      vibrationActiveRef.current = false;
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [visible]);

  const handleDismiss = () => {
    // Stop vibration
    Vibration.cancel();
    vibrationActiveRef.current = false;

    // Stop sound
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => {});
      soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }

    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: pulseAnim }]}>
        <View style={styles.content}>
          {/* Alert icon */}
          <Text style={styles.alertIcon}>{'🚨'}</Text>

          {/* URGENT header */}
          <Text style={styles.urgentHeader}>
            {isAr ? 'رسالة عاجلة!' : 'URGENT MESSAGE!'}
          </Text>

          {/* Sender info */}
          <View style={styles.infoSection}>
            <Text style={styles.label}>
              {isAr ? 'من:' : 'From:'}
            </Text>
            <Text style={styles.value}>{senderName}</Text>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.label}>
              {isAr ? 'القناة:' : 'Channel:'}
            </Text>
            <Text style={styles.value}>{channelName}</Text>
          </View>

          {/* Message preview */}
          {messagePreview ? (
            <View style={styles.previewContainer}>
              <Text style={styles.previewText} numberOfLines={4}>
                {messagePreview}
              </Text>
            </View>
          ) : null}

          {/* Dismiss button */}
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={handleDismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.dismissBtnText}>
              {isAr ? 'تم - إغلاق' : 'DISMISS'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(220, 38, 38, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    padding: 20,
  },
  alertIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  urgentHeader: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  previewContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    width: '100%',
  },
  previewText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 26,
  },
  dismissBtn: {
    marginTop: 32,
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingHorizontal: 48,
    paddingVertical: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  dismissBtnText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#dc2626',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default UrgentAlertOverlay;
