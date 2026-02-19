import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// Question status types
export type QuestionStatus = 'pass' | 'fail' | 'needs_review' | 'unanswered' | 'skipped';

// Status configuration with colors and icons
export const STATUS_CONFIG: Record<QuestionStatus, {
  backgroundColor: string;
  borderColor: string;
  icon: string;
  label: string;
  labelAr: string;
}> = {
  pass: {
    backgroundColor: '#f6ffed',
    borderColor: '#52c41a',
    icon: '\u2713', // Checkmark
    label: 'PASS',
    labelAr: '\u0646\u062c\u062d',
  },
  fail: {
    backgroundColor: '#fff2f0',
    borderColor: '#f5222d',
    icon: '\u2717', // X mark
    label: 'FAIL',
    labelAr: '\u0641\u0634\u0644',
  },
  needs_review: {
    backgroundColor: '#fffbe6',
    borderColor: '#faad14',
    icon: '\u26a0', // Warning
    label: 'REVIEW',
    labelAr: '\u0645\u0631\u0627\u062c\u0639\u0629',
  },
  unanswered: {
    backgroundColor: '#e6f7ff',
    borderColor: '#1677ff',
    icon: '?',
    label: 'PENDING',
    labelAr: '\u0645\u0639\u0644\u0642',
  },
  skipped: {
    backgroundColor: '#fafafa',
    borderColor: '#d9d9d9',
    icon: '\u2192', // Arrow
    label: 'SKIPPED',
    labelAr: '\u062a\u062e\u0637\u0649',
  },
};

export interface QuestionCardProps {
  status: QuestionStatus;
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  category?: 'mechanical' | 'electrical' | null;
  isCritical?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  showStatusBadge?: boolean;
  showProgress?: boolean;
  compact?: boolean;
  isActive?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export function QuestionCard({
  status,
  questionNumber,
  totalQuestions,
  questionText,
  category,
  isCritical = false,
  onPress,
  onLongPress,
  showStatusBadge = true,
  showProgress = true,
  compact = false,
  isActive = false,
  style,
  children,
}: QuestionCardProps) {
  const config = STATUS_CONFIG[status];

  // Animation values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const colorAnim = useRef(new Animated.Value(0)).current;
  const prevStatus = useRef(status);

  // Animate color transition when status changes
  useEffect(() => {
    if (prevStatus.current !== status) {
      // Trigger haptic feedback on status change
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Animate color transition
      colorAnim.setValue(0);
      Animated.timing(colorAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();

      prevStatus.current = status;
    }
  }, [status, colorAnim]);

  // Handle press in/out for scale animation
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress?.();
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.();
  };

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    return ((questionNumber) / totalQuestions) * 100;
  }, [questionNumber, totalQuestions]);

  const content = (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
          transform: [{ scale: scaleAnim }],
        },
        isActive && styles.activeContainer,
        compact && styles.compactContainer,
        style,
      ]}
    >
      {/* Status badge in corner */}
      {showStatusBadge && (
        <View style={[styles.statusBadge, { backgroundColor: config.borderColor }]}>
          <Text style={styles.statusIcon}>{config.icon}</Text>
        </View>
      )}

      {/* Question number indicator */}
      <View style={styles.header}>
        <View style={styles.questionNumberContainer}>
          <Text style={[styles.questionNumber, { color: config.borderColor }]}>
            Q{questionNumber}
          </Text>
          <Text style={styles.totalQuestions}>/ {totalQuestions}</Text>
        </View>

        {/* Category and critical badges */}
        <View style={styles.badgeRow}>
          {category && (
            <View style={[
              styles.categoryBadge,
              category === 'mechanical' ? styles.mechanicalBadge : styles.electricalBadge,
            ]}>
              <Text style={styles.categoryText}>
                {category === 'mechanical' ? 'M' : 'E'}
              </Text>
            </View>
          )}
          {isCritical && (
            <View style={styles.criticalBadge}>
              <Text style={styles.criticalText}>!</Text>
            </View>
          )}
        </View>
      </View>

      {/* Progress bar per card */}
      {showProgress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBackground}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercentage}%`,
                  backgroundColor: config.borderColor,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Question text */}
      {!compact && (
        <Text style={styles.questionText} numberOfLines={compact ? 2 : undefined}>
          {questionText}
        </Text>
      )}

      {/* Status label */}
      <View style={[styles.statusLabelContainer, { borderTopColor: config.borderColor }]}>
        <Text style={[styles.statusLabel, { color: config.borderColor }]}>
          {config.label}
        </Text>
      </View>

      {/* Children content (answer inputs, etc.) */}
      {children}
    </Animated.View>
  );

  if (onPress || onLongPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// Thumbnail version for grid view
export interface QuestionThumbnailProps {
  status: QuestionStatus;
  questionNumber: number;
  isActive?: boolean;
  onPress?: () => void;
}

export function QuestionThumbnail({
  status,
  questionNumber,
  isActive = false,
  onPress,
}: QuestionThumbnailProps) {
  const config = STATUS_CONFIG[status];
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        Haptics.selectionAsync();
        onPress?.();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.thumbnail,
          {
            backgroundColor: config.backgroundColor,
            borderColor: config.borderColor,
            transform: [{ scale: scaleAnim }],
          },
          isActive && styles.thumbnailActive,
        ]}
      >
        <Text style={[styles.thumbnailNumber, { color: config.borderColor }]}>
          {questionNumber}
        </Text>
        <Text style={styles.thumbnailIcon}>{config.icon}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Dot version for overview strip
export interface QuestionDotProps {
  status: QuestionStatus;
  isActive?: boolean;
  onPress?: () => void;
}

export function QuestionDot({
  status,
  isActive = false,
  onPress,
}: QuestionDotProps) {
  const config = STATUS_CONFIG[status];

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        Haptics.selectionAsync();
        onPress?.();
      }}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor: config.borderColor,
          },
          isActive && styles.dotActive,
        ]}
      >
        {isActive && <View style={styles.dotInner} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 12,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  activeContainer: {
    borderWidth: 3,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.2)',
    elevation: 5,
  },
  compactContainer: {
    padding: 12,
    marginVertical: 4,
  },
  statusBadge: {
    position: 'absolute',
    top: -8,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.2)',
    elevation: 2,
  },
  statusIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  questionNumberContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  questionNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  totalQuestions: {
    fontSize: 12,
    color: '#999',
    marginLeft: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  categoryBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mechanicalBadge: {
    backgroundColor: '#E3F2FD',
  },
  electricalBadge: {
    backgroundColor: '#FFF3E0',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#424242',
  },
  criticalBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  criticalText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D32F2F',
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBackground: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
    lineHeight: 24,
    marginBottom: 12,
  },
  statusLabelContainer: {
    borderTopWidth: 1,
    paddingTop: 8,
    alignItems: 'flex-start',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Thumbnail styles
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
  },
  thumbnailActive: {
    borderWidth: 3,
    transform: [{ scale: 1.1 }],
  },
  thumbnailNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  thumbnailIcon: {
    fontSize: 10,
    marginTop: 2,
  },

  // Dot styles
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
});

export default QuestionCard;
