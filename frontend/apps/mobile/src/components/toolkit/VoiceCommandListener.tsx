import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Vibration,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface VoiceCommandListenerProps {
  onCommand: (action: string) => void;
  language?: 'en' | 'ar';
  isVisible: boolean;
  onClose: () => void;
}

const COMMAND_EXAMPLES = {
  en: [
    { icon: '⏸️', command: '"Pause"', action: 'pause' },
    { icon: '✅', command: '"Complete"', action: 'complete' },
    { icon: '❌', command: '"Not done"', action: 'incomplete' },
    { icon: '🆘', command: '"Help"', action: 'help' },
    { icon: '▶️', command: '"Start"', action: 'start' },
    { icon: '📸', command: '"Photo"', action: 'photo' },
    { icon: '⚠️', command: '"Defect"', action: 'defect' },
  ],
  ar: [
    { icon: '⏸️', command: '"إيقاف"', action: 'pause' },
    { icon: '✅', command: '"تم"', action: 'complete' },
    { icon: '❌', command: '"لم يتم"', action: 'incomplete' },
    { icon: '🆘', command: '"مساعدة"', action: 'help' },
    { icon: '▶️', command: '"ابدأ"', action: 'start' },
    { icon: '📸', command: '"صورة"', action: 'photo' },
    { icon: '⚠️', command: '"عطل"', action: 'defect' },
  ],
};

export default function VoiceCommandListener({
  onCommand,
  language = 'en',
  isVisible,
  onClose,
}: VoiceCommandListenerProps) {
  const { t } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [detectedText, setDetectedText] = useState('');
  const [detectedAction, setDetectedAction] = useState<string | null>(null);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  const startListening = useCallback(() => {
    setIsListening(true);
    setDetectedText('');
    setDetectedAction(null);
    Vibration.vibrate(50);

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const simulateCommand = (action: string) => {
    Vibration.vibrate(100);
    setDetectedAction(action);
    onCommand(action);
    setTimeout(() => {
      onClose();
      setDetectedAction(null);
    }, 1000);
  };

  const examples = COMMAND_EXAMPLES[language] || COMMAND_EXAMPLES.en;
  const isAr = language === 'ar';

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {isAr ? '🎙️ الأوامر الصوتية' : '🎙️ Voice Commands'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Listening indicator */}
          <View style={styles.micContainer}>
            <Animated.View
              style={[
                styles.micCircle,
                isListening && {
                  transform: [{ scale: pulseAnim }],
                  backgroundColor: '#ff4d4f',
                },
              ]}
            >
              <TouchableOpacity
                onPressIn={startListening}
                onPressOut={stopListening}
                style={styles.micButton}
              >
                <Text style={styles.micIcon}>
                  {isListening ? '🔴' : '🎤'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
            <Text style={styles.micHint}>
              {isListening
                ? (isAr ? 'جاري الاستماع...' : 'Listening...')
                : (isAr ? 'اضغط مع الاستمرار للتحدث' : 'Hold to speak')}
            </Text>
            {detectedText ? (
              <Text style={styles.detectedText}>"{detectedText}"</Text>
            ) : null}
            {detectedAction && (
              <View style={styles.actionDetected}>
                <Text style={styles.actionDetectedText}>
                  ✅ {detectedAction.toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Quick command buttons (fallback for when voice isn't working) */}
          <View style={styles.commandsSection}>
            <Text style={styles.commandsTitle}>
              {isAr ? 'أو اضغط على أمر:' : 'Or tap a command:'}
            </Text>
            <View style={styles.commandsGrid}>
              {examples.map((cmd) => (
                <TouchableOpacity
                  key={cmd.action}
                  style={styles.commandBtn}
                  onPress={() => simulateCommand(cmd.action)}
                >
                  <Text style={styles.commandIcon}>{cmd.icon}</Text>
                  <Text style={styles.commandText}>{cmd.command}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#262626',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#8c8c8c',
  },
  micContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  micCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e6f4ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    fontSize: 44,
  },
  micHint: {
    fontSize: 16,
    color: '#8c8c8c',
    fontWeight: '500',
  },
  detectedText: {
    fontSize: 18,
    color: '#262626',
    fontWeight: '600',
    marginTop: 12,
  },
  actionDetected: {
    marginTop: 12,
    backgroundColor: '#f6ffed',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionDetectedText: {
    fontSize: 16,
    color: '#52c41a',
    fontWeight: '700',
  },
  commandsSection: {
    paddingHorizontal: 20,
  },
  commandsTitle: {
    fontSize: 14,
    color: '#8c8c8c',
    marginBottom: 12,
    fontWeight: '600',
  },
  commandsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  commandIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  commandText: {
    fontSize: 14,
    color: '#595959',
    fontWeight: '500',
  },
});
