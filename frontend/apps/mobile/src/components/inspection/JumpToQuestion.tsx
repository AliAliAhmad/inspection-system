import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import QuestionNumberPad from './QuestionNumberPad';

export interface JumpToQuestionProps {
  visible: boolean;
  onClose: () => void;
  onJump: (index: number) => void;
  totalQuestions: number;
  currentQuestion: number;
}

export function JumpToQuestion({
  visible,
  onClose,
  onJump,
  totalQuestions,
  currentQuestion,
}: JumpToQuestionProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [useNumPad, setUseNumPad] = useState(true); // Default to numpad for glove-friendly use
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      setInputValue(String(currentQuestion + 1));
      setError(null);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
      if (!useNumPad) {
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.setSelection(0, String(currentQuestion + 1).length);
        }, 100);
      }
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, currentQuestion, fadeAnim, scaleAnim, useNumPad]);

  const handleJump = () => {
    const num = parseInt(inputValue, 10);

    if (isNaN(num)) {
      setError(t('inspection.enterValidNumber', 'Please enter a valid number'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (num < 1 || num > totalQuestions) {
      setError(t('inspection.questionOutOfRange', `Enter a number between 1 and ${totalQuestions}`));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onJump(num - 1); // Convert to 0-indexed
    onClose();
  };

  const handleQuickJump = (position: 'first' | 'last' | 'middle') => {
    let index = 0;
    if (position === 'last') {
      index = totalQuestions - 1;
    } else if (position === 'middle') {
      index = Math.floor(totalQuestions / 2);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onJump(index);
    onClose();
  };

  // Handle numpad input
  const handleNumPadPress = useCallback((value: string) => {
    setError(null);
    if (value === 'clear') {
      setInputValue('');
    } else if (value === 'backspace') {
      setInputValue(prev => prev.slice(0, -1));
    } else if (value === 'go') {
      handleJump();
    } else {
      // Limit to reasonable number of digits
      if (inputValue.length < 4) {
        setInputValue(prev => prev + value);
      }
    }
  }, [inputValue, handleJump]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Text style={styles.title}>
            {t('inspection.jumpToQuestion', 'Jump to Question')}
          </Text>

          <Text style={styles.subtitle}>
            {t('inspection.currentlyAt', 'Currently at')} {currentQuestion + 1} {t('inspection.of', 'of')} {totalQuestions}
          </Text>

          {/* Toggle between numpad and keyboard */}
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, useNumPad && styles.toggleButtonActive]}
              onPress={() => setUseNumPad(true)}
            >
              <Text style={[styles.toggleText, useNumPad && styles.toggleTextActive]}>
                {isArabic ? 'لوحة ارقام' : 'NumPad'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, !useNumPad && styles.toggleButtonActive]}
              onPress={() => setUseNumPad(false)}
            >
              <Text style={[styles.toggleText, !useNumPad && styles.toggleTextActive]}>
                {isArabic ? 'كيبورد' : 'Keyboard'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* NumPad or Keyboard input based on toggle */}
          {useNumPad ? (
            <View style={styles.numPadWrapper}>
              <QuestionNumberPad
                value={inputValue}
                onPress={handleNumPadPress}
                maxValue={totalQuestions}
                isArabic={isArabic}
              />
            </View>
          ) : (
            <View style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                style={[styles.input, error && styles.inputError]}
                value={inputValue}
                onChangeText={(text) => {
                  setInputValue(text.replace(/[^0-9]/g, ''));
                  setError(null);
                }}
                keyboardType="number-pad"
                placeholder={`1 - ${totalQuestions}`}
                placeholderTextColor="#9E9E9E"
                maxLength={String(totalQuestions).length}
                selectTextOnFocus
                onSubmitEditing={handleJump}
                returnKeyType="go"
              />
              <Text style={styles.totalLabel}>/ {totalQuestions}</Text>
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.quickJumpRow}>
            <TouchableOpacity
              style={styles.quickJumpButton}
              onPress={() => handleQuickJump('first')}
            >
              <Text style={styles.quickJumpText}>|&lt;</Text>
              <Text style={styles.quickJumpLabel}>{t('inspection.first', 'First')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickJumpButton}
              onPress={() => handleQuickJump('middle')}
            >
              <Text style={styles.quickJumpText}>|</Text>
              <Text style={styles.quickJumpLabel}>{t('inspection.middle', 'Middle')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickJumpButton}
              onPress={() => handleQuickJump('last')}
            >
              <Text style={styles.quickJumpText}>&gt;|</Text>
              <Text style={styles.quickJumpLabel}>{t('inspection.last', 'Last')}</Text>
            </TouchableOpacity>
          </View>

          {/* Only show action buttons in keyboard mode - numpad has its own Go button */}
          {!useNumPad && (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>
                  {t('common.cancel', 'Cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.jumpButton} onPress={handleJump}>
                <Text style={styles.jumpButtonText}>
                  {t('inspection.go', 'Go')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  input: {
    width: 100,
    height: 56,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1976D2',
    backgroundColor: '#F5F5F5',
  },
  inputError: {
    borderColor: '#F44336',
    backgroundColor: '#FFEBEE',
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#757575',
    marginLeft: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 12,
  },
  quickJumpRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  quickJumpButton: {
    alignItems: 'center',
    padding: 8,
  },
  quickJumpText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976D2',
    marginBottom: 4,
  },
  quickJumpLabel: {
    fontSize: 11,
    color: '#757575',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
  jumpButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    alignItems: 'center',
  },
  jumpButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#1976D2',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },
  numPadWrapper: {
    marginBottom: 12,
  },
});

// Floating button variant for header integration
export interface JumpToQuestionButtonProps {
  currentQuestion: number;
  totalQuestions: number;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
  position?: 'left' | 'right';
  highlightOnJump?: boolean;
}

export function JumpToQuestionButton({
  currentQuestion,
  totalQuestions,
  onPress,
  size = 'medium',
  position = 'right',
  highlightOnJump = false,
}: JumpToQuestionButtonProps) {
  const highlightAnim = useRef(new Animated.Value(1)).current;
  const bgColorAnim = useRef(new Animated.Value(0)).current;

  // Flash highlight effect when jumped to a question
  useEffect(() => {
    if (highlightOnJump) {
      highlightAnim.setValue(1.2);
      bgColorAnim.setValue(1);
      Animated.parallel([
        Animated.spring(highlightAnim, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(bgColorAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [currentQuestion, highlightOnJump, highlightAnim, bgColorAnim]);

  const sizeConfig = {
    small: { width: 40, height: 40, fontSize: 12, subSize: 8 },
    medium: { width: 50, height: 50, fontSize: 14, subSize: 10 },
    large: { width: 60, height: 60, fontSize: 16, subSize: 12 },
  };

  const config = sizeConfig[size];

  const backgroundColor = bgColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1976D2', '#4CAF50'],
  });

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      activeOpacity={0.8}
    >
      <Animated.View
        style={[
          floatingStyles.button,
          {
            width: config.width,
            height: config.height,
            borderRadius: config.width / 2,
            backgroundColor,
            transform: [{ scale: highlightAnim }],
          },
          position === 'left' && floatingStyles.buttonLeft,
        ]}
      >
        <Text style={[floatingStyles.buttonNumber, { fontSize: config.fontSize }]}>
          {currentQuestion + 1}
        </Text>
        <Text style={[floatingStyles.buttonTotal, { fontSize: config.subSize }]}>
          /{totalQuestions}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const floatingStyles = StyleSheet.create({
  button: {
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  buttonLeft: {
    marginRight: 8,
  },
  buttonNumber: {
    color: '#fff',
    fontWeight: '700',
  },
  buttonTotal: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    marginTop: -2,
  },
});

export default JumpToQuestion;
