import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  Text,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { QuestionDot, QuestionStatus, STATUS_CONFIG } from './QuestionCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DOT_SIZE = 14;
const DOT_MARGIN = 4;
const DOT_WIDTH = DOT_SIZE + (DOT_MARGIN * 2);
const VISIBLE_DOTS = Math.floor(SCREEN_WIDTH / DOT_WIDTH);

// Enhanced color mapping for clear visual distinction
const ENHANCED_COLORS: Record<QuestionStatus, string> = {
  pass: '#4CAF50', // Green
  fail: '#F44336', // Red
  needs_review: '#FF9800', // Orange
  unanswered: '#BDBDBD', // Gray
  skipped: '#9E9E9E', // Darker gray
};

export interface QuestionOverviewStripProps {
  questions: {
    id: number;
    status: QuestionStatus;
  }[];
  currentIndex: number;
  onJumpToQuestion: (index: number) => void;
}

export function QuestionOverviewStrip({
  questions,
  currentIndex,
  onJumpToQuestion,
}: QuestionOverviewStripProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const highlightAnim = useRef(new Animated.Value(1)).current;

  // Auto-scroll to keep current question visible
  useEffect(() => {
    if (scrollViewRef.current) {
      const scrollX = Math.max(0, (currentIndex * DOT_WIDTH) - (SCREEN_WIDTH / 2) + DOT_WIDTH);
      scrollViewRef.current.scrollTo({ x: scrollX, animated: true });
    }

    // Pulse animation for current dot
    highlightAnim.setValue(1);
    Animated.sequence([
      Animated.timing(highlightAnim, {
        toValue: 1.3,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(highlightAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentIndex, highlightAnim]);

  const handleJump = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onJumpToQuestion(index);
  }, [onJumpToQuestion]);

  // Count statuses for summary
  const statusCounts = questions.reduce((acc, q) => {
    acc[q.status] = (acc[q.status] || 0) + 1;
    return acc;
  }, {} as Record<QuestionStatus, number>);

  // Calculate summary legend items
  const legendItems = [
    { status: 'pass' as QuestionStatus, label: 'Pass', count: statusCounts.pass || 0 },
    { status: 'fail' as QuestionStatus, label: 'Fail', count: statusCounts.fail || 0 },
    { status: 'unanswered' as QuestionStatus, label: 'Pending', count: statusCounts.unanswered || 0 },
  ].filter(item => item.count > 0);

  return (
    <View style={styles.container}>
      {/* Status summary with color legend */}
      <View style={styles.summaryRow}>
        {legendItems.map((item) => (
          <View
            key={item.status}
            style={[styles.summaryBadge, { backgroundColor: ENHANCED_COLORS[item.status] }]}
          >
            <Text style={styles.summaryCount}>{item.count}</Text>
          </View>
        ))}
        <View style={styles.positionBadge}>
          <Text style={styles.positionBadgeText}>
            {currentIndex + 1}/{questions.length}
          </Text>
        </View>
      </View>

      {/* Enhanced dots strip with squares for better tap targets */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dotsContainer}
        style={styles.scrollView}
      >
        {questions.map((question, index) => {
          const isActive = index === currentIndex;
          const dotColor = ENHANCED_COLORS[question.status];

          return (
            <TouchableOpacity
              key={question.id}
              onPress={() => handleJump(index)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            >
              <Animated.View
                style={[
                  styles.enhancedDot,
                  { backgroundColor: dotColor },
                  isActive && styles.enhancedDotActive,
                  isActive && { transform: [{ scale: highlightAnim }] },
                ]}
              >
                {isActive && <View style={styles.activeIndicator} />}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
    paddingHorizontal: 16,
  },
  summaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 28,
    alignItems: 'center',
  },
  summaryCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  positionBadge: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  positionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  scrollView: {
    maxHeight: 28,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minWidth: SCREEN_WIDTH,
    justifyContent: 'center',
    gap: DOT_MARGIN,
  },
  enhancedDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: 3, // Slightly rounded squares for better tap
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhancedDotActive: {
    width: DOT_SIZE + 4,
    height: DOT_SIZE + 4,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#1976D2',
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
});

export default QuestionOverviewStrip;
