/**
 * QuestionNumberPad - Large number buttons for outdoor/gloves use
 * Features:
 * - Big touch targets (good for gloves)
 * - Large visible numbers
 * - Clear, backspace, and Go buttons
 * - Haptic feedback on each press
 * - Shows entered number prominently
 * - Bilingual support (AR/EN)
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_SIZE = Math.min((SCREEN_WIDTH - 100) / 3, 70);

interface QuestionNumberPadProps {
  value: string;
  onPress: (value: string) => void;
  maxValue: number;
  isArabic?: boolean;
  disabled?: boolean;
}

export default function QuestionNumberPad({
  value,
  onPress,
  maxValue,
  isArabic = false,
  disabled = false,
}: QuestionNumberPadProps) {
  const handlePress = (btnValue: string) => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(btnValue);
  };

  const handleGoPress = () => {
    if (disabled || !value) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress('go');
  };

  // Check if entered number is valid
  const numValue = parseInt(value, 10);
  const isValidNumber = !isNaN(numValue) && numValue >= 1 && numValue <= maxValue;
  const isOverMax = !isNaN(numValue) && numValue > maxValue;

  return (
    <View style={styles.container}>
      {/* Number display */}
      <View style={[
        styles.display,
        isOverMax && styles.displayError,
        isValidNumber && styles.displayValid,
      ]}>
        <Text style={[
          styles.displayText,
          !value && styles.displayPlaceholder,
          isOverMax && styles.displayTextError,
          isValidNumber && styles.displayTextValid,
        ]}>
          {value || (isArabic ? 'ادخل رقم' : 'Enter #')}
        </Text>
        {isOverMax && (
          <Text style={styles.errorHint}>
            {isArabic ? `اقصى ${maxValue}` : `Max ${maxValue}`}
          </Text>
        )}
      </View>

      {/* Number buttons grid */}
      <View style={styles.grid}>
        {/* Row 1: 1, 2, 3 */}
        <View style={styles.row}>
          {['1', '2', '3'].map((num) => (
            <TouchableOpacity
              key={num}
              style={styles.numberButton}
              onPress={() => handlePress(num)}
              activeOpacity={0.7}
              disabled={disabled}
            >
              <Text style={styles.numberText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 2: 4, 5, 6 */}
        <View style={styles.row}>
          {['4', '5', '6'].map((num) => (
            <TouchableOpacity
              key={num}
              style={styles.numberButton}
              onPress={() => handlePress(num)}
              activeOpacity={0.7}
              disabled={disabled}
            >
              <Text style={styles.numberText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 3: 7, 8, 9 */}
        <View style={styles.row}>
          {['7', '8', '9'].map((num) => (
            <TouchableOpacity
              key={num}
              style={styles.numberButton}
              onPress={() => handlePress(num)}
              activeOpacity={0.7}
              disabled={disabled}
            >
              <Text style={styles.numberText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 4: Clear, 0, Backspace */}
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.numberButton, styles.actionButton, styles.clearButton]}
            onPress={() => handlePress('clear')}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <Text style={styles.actionText}>C</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.numberButton}
            onPress={() => handlePress('0')}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <Text style={styles.numberText}>0</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.numberButton, styles.actionButton, styles.backspaceButton]}
            onPress={() => handlePress('backspace')}
            activeOpacity={0.7}
            disabled={disabled || !value}
          >
            <Text style={styles.actionText}>{'\u232b'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Go button */}
      <TouchableOpacity
        style={[
          styles.goButton,
          (!value || isOverMax) && styles.goButtonDisabled,
          isValidNumber && styles.goButtonActive,
        ]}
        onPress={handleGoPress}
        activeOpacity={0.7}
        disabled={disabled || !value || isOverMax}
      >
        <Text style={[
          styles.goButtonText,
          (!value || isOverMax) && styles.goButtonTextDisabled,
        ]}>
          {isArabic ? 'اذهب' : 'Go'} {'\u2192'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  display: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
    minWidth: 140,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  displayError: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  displayValid: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  displayText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#212121',
  },
  displayPlaceholder: {
    color: '#9E9E9E',
    fontSize: 18,
  },
  displayTextError: {
    color: '#F44336',
  },
  displayTextValid: {
    color: '#2E7D32',
  },
  errorHint: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
  },
  grid: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  numberButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 4,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  numberText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
  },
  actionButton: {
    borderWidth: 0,
  },
  clearButton: {
    backgroundColor: '#FFEBEE',
  },
  backspaceButton: {
    backgroundColor: '#FFF3E0',
  },
  actionText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#616161',
  },
  goButton: {
    marginTop: 16,
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  goButtonActive: {
    backgroundColor: '#4CAF50',
  },
  goButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  goButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  goButtonTextDisabled: {
    color: '#fff',
    opacity: 0.7,
  },
});

export type { QuestionNumberPadProps };
