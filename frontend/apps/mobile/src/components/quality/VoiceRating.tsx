import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  Vibration,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { getApiClient } from '@inspection/shared';

// Status colors
const COLORS = {
  approved: '#52c41a',
  rejected: '#f5222d',
  pending: '#faad14',
  info: '#1677ff',
};

export interface VoiceRatingProps {
  /** Initial rating value (1-10) */
  initialRating?: number;
  /** Called when rating changes */
  onRatingChange: (rating: number) => void;
  /** Called when voice note is recorded */
  onVoiceNoteRecorded?: (voiceNoteId: number, transcription?: string) => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Current language for transcription */
  language?: 'en' | 'ar';
  /** Label above the rating */
  label?: string;
  /** Show compact version during inspection */
  compact?: boolean;
}

const RATING_LABELS: Record<number, { en: string; ar: string; color: string }> = {
  1: { en: 'Poor', ar: 'ضعيف', color: '#f5222d' },
  2: { en: 'Very Bad', ar: 'سيء جدا', color: '#f5222d' },
  3: { en: 'Bad', ar: 'سيء', color: '#fa541c' },
  4: { en: 'Below Average', ar: 'أقل من المتوسط', color: '#fa8c16' },
  5: { en: 'Average', ar: 'متوسط', color: '#faad14' },
  6: { en: 'Above Average', ar: 'فوق المتوسط', color: '#a0d911' },
  7: { en: 'Good', ar: 'جيد', color: '#52c41a' },
  8: { en: 'Very Good', ar: 'جيد جدا', color: '#52c41a' },
  9: { en: 'Excellent', ar: 'ممتاز', color: '#13c2c2' },
  10: { en: 'Perfect', ar: 'مثالي', color: '#1677ff' },
};

const VOICE_COMMANDS: Record<string, number> = {
  // English
  'one': 1, '1': 1,
  'two': 2, '2': 2,
  'three': 3, '3': 3,
  'four': 4, '4': 4,
  'five': 5, '5': 5,
  'six': 6, '6': 6,
  'seven': 7, '7': 7,
  'eight': 8, '8': 8,
  'nine': 9, '9': 9,
  'ten': 10, '10': 10,
  // Arabic numerals
  'واحد': 1, 'اثنين': 2, 'ثلاثة': 3, 'أربعة': 4, 'خمسة': 5,
  'ستة': 6, 'سبعة': 7, 'ثمانية': 8, 'تسعة': 9, 'عشرة': 10,
};

export function VoiceRating({
  initialRating = 0,
  onRatingChange,
  onVoiceNoteRecorded,
  disabled = false,
  language = 'en',
  label,
  compact = false,
}: VoiceRatingProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(initialRating);
  const [isListening, setIsListening] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hasVoiceNote, setHasVoiceNote] = useState(false);
  const [detectedText, setDetectedText] = useState('');

  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const starAnimations = useRef(
    Array.from({ length: 10 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Animate stars when rating changes
    starAnimations.forEach((anim, index) => {
      Animated.spring(anim, {
        toValue: index < rating ? 1 : 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    });
  }, [rating, starAnimations]);

  const handleRatingPress = useCallback((newRating: number) => {
    if (disabled) return;
    Vibration.vibrate(30);
    setRating(newRating);
    onRatingChange(newRating);
  }, [disabled, onRatingChange]);

  const parseVoiceCommand = useCallback((text: string): number | null => {
    const lowerText = text.toLowerCase().trim();

    // Check direct matches
    for (const [key, value] of Object.entries(VOICE_COMMANDS)) {
      if (lowerText.includes(key)) {
        return value;
      }
    }

    // Try to extract numbers
    const numberMatch = lowerText.match(/\d+/);
    if (numberMatch) {
      const num = parseInt(numberMatch[0], 10);
      if (num >= 1 && num <= 10) {
        return num;
      }
    }

    return null;
  }, []);

  const startListening = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('common.permission_required', 'Permission Required'),
          t('quality.mic_permission', 'Microphone access is needed for voice rating.')
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
      setIsListening(true);
      setDetectedText('');
      Vibration.vibrate(50);

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
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
    } catch (err) {
      console.error('Failed to start voice recording:', err);
      Alert.alert(t('common.error', 'Error'), t('quality.recording_failed', 'Failed to start recording'));
    }
  }, [t, pulseAnim]);

  const stopListening = useCallback(async () => {
    if (!recordingRef.current) return;

    setIsListening(false);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    setIsUploading(true);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setIsUploading(false);
        return;
      }

      // Read audio as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Upload and transcribe
      const response = await getApiClient().post(
        '/api/voice/transcribe',
        {
          audio_base64: base64,
          file_name: 'rating_voice.m4a',
          file_type: 'audio/m4a',
          language: language,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000,
        }
      );

      const result = (response.data as any)?.data;
      const transcription = result?.en || result?.ar || '';
      setDetectedText(transcription);

      // Try to parse rating from voice
      const detectedRating = parseVoiceCommand(transcription);
      if (detectedRating) {
        Vibration.vibrate([0, 50, 50, 100]);
        setRating(detectedRating);
        onRatingChange(detectedRating);
      }

      // Store voice note if callback provided
      if (onVoiceNoteRecorded && result?.audio_file?.id) {
        setHasVoiceNote(true);
        onVoiceNoteRecorded(result.audio_file.id, transcription);
      }
    } catch (err: any) {
      console.error('Voice transcription failed:', err);
      Alert.alert(
        t('common.error', 'Error'),
        t('quality.transcription_failed', 'Voice processing failed. Please try again.')
      );
    } finally {
      setIsUploading(false);
    }
  }, [language, onRatingChange, onVoiceNoteRecorded, parseVoiceCommand, pulseAnim, t]);

  const ratingLabel = rating > 0 ? RATING_LABELS[rating] : null;
  const labelText = ratingLabel ? (language === 'ar' ? ratingLabel.ar : ratingLabel.en) : '';
  const isAr = language === 'ar';

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Voice Input Button */}
      <View style={styles.voiceSection}>
        <Animated.View
          style={[
            styles.micCircle,
            isListening && styles.micCircleActive,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <TouchableOpacity
            style={styles.micButton}
            onPressIn={startListening}
            onPressOut={stopListening}
            disabled={disabled || isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.micIcon}>
                {isListening ? '...' : hasVoiceNote ? '...' : '...'}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.micHint}>
          {isListening
            ? (isAr ? 'قل رقم 1-10...' : 'Say 1-10...')
            : (isAr ? 'اضغط للتقييم الصوتي' : 'Hold to voice rate')}
        </Text>
        {detectedText && !isListening && (
          <Text style={styles.detectedText}>"{detectedText}"</Text>
        )}
      </View>

      {/* Star/Number Rating Display */}
      <View style={[styles.ratingContainer, compact && styles.ratingContainerCompact]}>
        {compact ? (
          // Compact mode: Show only numbers in a row
          <View style={styles.numbersRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <TouchableOpacity
                key={num}
                style={[
                  styles.numberButton,
                  rating === num && styles.numberButtonActive,
                  rating === num && { backgroundColor: RATING_LABELS[num].color },
                ]}
                onPress={() => handleRatingPress(num)}
                disabled={disabled}
              >
                <Text
                  style={[
                    styles.numberText,
                    rating === num && styles.numberTextActive,
                  ]}
                >
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          // Full mode: Show stars with animation
          <View style={styles.starsContainer}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => handleRatingPress(num)}
                  disabled={disabled}
                >
                  <Animated.Text
                    style={[
                      styles.star,
                      {
                        transform: [
                          {
                            scale: starAnimations[num - 1].interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.2],
                            }),
                          },
                        ],
                        color: starAnimations[num - 1].interpolate({
                          inputRange: [0, 1],
                          outputRange: ['#d9d9d9', '#faad14'],
                        }),
                      },
                    ]}
                  >
                    {num <= rating ? '...' : '...'}
                  </Animated.Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.starsRow}>
              {[6, 7, 8, 9, 10].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => handleRatingPress(num)}
                  disabled={disabled}
                >
                  <Animated.Text
                    style={[
                      styles.star,
                      {
                        transform: [
                          {
                            scale: starAnimations[num - 1].interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.2],
                            }),
                          },
                        ],
                        color: starAnimations[num - 1].interpolate({
                          inputRange: [0, 1],
                          outputRange: ['#d9d9d9', '#faad14'],
                        }),
                      },
                    ]}
                  >
                    {num <= rating ? '...' : '...'}
                  </Animated.Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Current Rating Display */}
      {rating > 0 && (
        <View style={[styles.ratingDisplay, { backgroundColor: ratingLabel?.color + '20' }]}>
          <Text style={[styles.ratingNumber, { color: ratingLabel?.color }]}>
            {rating}
          </Text>
          <Text style={[styles.ratingLabel, { color: ratingLabel?.color }]}>
            {labelText}
          </Text>
        </View>
      )}

      {/* Voice Note Indicator */}
      {hasVoiceNote && (
        <View style={styles.voiceNoteIndicator}>
          <Text style={styles.voiceNoteIcon}>...</Text>
          <Text style={styles.voiceNoteText}>
            {isAr ? 'تم حفظ الملاحظة الصوتية' : 'Voice note attached'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  containerCompact: {
    padding: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
  },
  voiceSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  micCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.info,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  micCircleActive: {
    backgroundColor: COLORS.rejected,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    fontSize: 28,
    color: '#fff',
  },
  micHint: {
    fontSize: 13,
    color: '#8c8c8c',
    fontWeight: '500',
  },
  detectedText: {
    fontSize: 14,
    color: '#262626',
    fontWeight: '600',
    marginTop: 8,
    fontStyle: 'italic',
  },
  ratingContainer: {
    marginBottom: 12,
  },
  ratingContainerCompact: {
    marginBottom: 8,
  },
  starsContainer: {
    alignItems: 'center',
    gap: 8,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  star: {
    fontSize: 32,
  },
  numbersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  numberButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  numberButtonActive: {
    borderWidth: 0,
  },
  numberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8c8c8c',
  },
  numberTextActive: {
    color: '#fff',
  },
  ratingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  ratingNumber: {
    fontSize: 32,
    fontWeight: '700',
  },
  ratingLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  voiceNoteIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f6ffed',
    borderRadius: 6,
    gap: 6,
  },
  voiceNoteIcon: {
    fontSize: 16,
  },
  voiceNoteText: {
    fontSize: 13,
    color: COLORS.approved,
    fontWeight: '500',
  },
});

export default VoiceRating;
