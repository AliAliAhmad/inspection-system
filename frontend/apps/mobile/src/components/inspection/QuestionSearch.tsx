import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Animated,
  Keyboard,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { ChecklistItem } from '@inspection/shared';

export type QuestionStatus = 'all' | 'pass' | 'fail' | 'unanswered';

export interface QuestionSearchProps {
  visible: boolean;
  onClose: () => void;
  onSelectQuestion: (index: number) => void;
  questions: ChecklistItem[];
  currentIndex: number;
  getQuestionStatus: (itemId: number) => 'pass' | 'fail' | 'unanswered';
  isArabic?: boolean;
}

// Simple fuzzy match - returns score (higher is better)
function fuzzyMatch(text: string, query: string): number {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match
  if (textLower.includes(queryLower)) {
    return 100 + (queryLower.length / textLower.length) * 50;
  }

  // Fuzzy match - check if all query chars appear in order
  let textIdx = 0;
  let matchCount = 0;
  let consecutiveBonus = 0;
  let lastMatchIdx = -2;

  for (let i = 0; i < queryLower.length; i++) {
    const char = queryLower[i];
    let found = false;

    while (textIdx < textLower.length) {
      if (textLower[textIdx] === char) {
        matchCount++;
        if (textIdx === lastMatchIdx + 1) {
          consecutiveBonus += 5;
        }
        lastMatchIdx = textIdx;
        textIdx++;
        found = true;
        break;
      }
      textIdx++;
    }

    if (!found) {
      return 0;
    }
  }

  return matchCount * 10 + consecutiveBonus;
}

export function QuestionSearch({
  visible,
  onClose,
  onSelectQuestion,
  questions,
  currentIndex,
  getQuestionStatus,
  isArabic = false,
}: QuestionSearchProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuestionStatus>('all');
  const inputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(-400)).current;

  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setStatusFilter('all');
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 10,
        tension: 80,
        useNativeDriver: true,
      }).start();
      setTimeout(() => inputRef.current?.focus(), 200);
    } else {
      Animated.timing(slideAnim, {
        toValue: -400,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const filteredQuestions = useMemo(() => {
    let results = questions.map((q, index) => ({
      question: q,
      index,
      status: getQuestionStatus(q.id),
      score: 0,
    }));

    // Filter by status
    if (statusFilter !== 'all') {
      results = results.filter((r) => r.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      results = results
        .map((r) => {
          const text = isArabic && r.question.question_text_ar
            ? r.question.question_text_ar
            : r.question.question_text;
          const score = fuzzyMatch(text, searchQuery);
          return { ...r, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);
    }

    return results;
  }, [questions, searchQuery, statusFilter, getQuestionStatus, isArabic]);

  const handleSelect = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onSelectQuestion(index);
    onClose();
  }, [onSelectQuestion, onClose]);

  const getStatusColor = (status: 'pass' | 'fail' | 'unanswered') => {
    switch (status) {
      case 'pass': return '#4CAF50';
      case 'fail': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: 'pass' | 'fail' | 'unanswered') => {
    switch (status) {
      case 'pass': return 'P';
      case 'fail': return 'F';
      default: return '?';
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return <Text>{text}</Text>;

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    const startIdx = textLower.indexOf(queryLower);

    if (startIdx === -1) return <Text>{text}</Text>;

    return (
      <Text>
        {text.substring(0, startIdx)}
        <Text style={styles.highlightText}>
          {text.substring(startIdx, startIdx + query.length)}
        </Text>
        {text.substring(startIdx + query.length)}
      </Text>
    );
  };

  const renderItem = useCallback(({ item }: { item: typeof filteredQuestions[0] }) => {
    const text = isArabic && item.question.question_text_ar
      ? item.question.question_text_ar
      : item.question.question_text;
    const isCurrent = item.index === currentIndex;

    return (
      <TouchableOpacity
        style={[styles.resultItem, isCurrent && styles.resultItemCurrent]}
        onPress={() => handleSelect(item.index)}
        activeOpacity={0.7}
      >
        <View style={styles.resultLeft}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusBadgeText}>{getStatusIcon(item.status)}</Text>
          </View>
          <Text style={styles.questionNumber}>#{item.index + 1}</Text>
        </View>
        <View style={styles.resultContent}>
          <Text style={styles.resultText} numberOfLines={2}>
            {highlightText(text, searchQuery)}
          </Text>
          {item.question.critical_failure && (
            <View style={styles.criticalTag}>
              <Text style={styles.criticalTagText}>CRITICAL</Text>
            </View>
          )}
        </View>
        {isCurrent && (
          <View style={styles.currentIndicator}>
            <Text style={styles.currentIndicatorText}>
              {t('inspection.current', 'Current')}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [isArabic, currentIndex, searchQuery, handleSelect, t]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>S</Text>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('inspection.searchQuestions', 'Search questions...')}
            placeholderTextColor="#9E9E9E"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setSearchQuery('')}
            >
              <Text style={styles.clearButtonText}>X</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>X</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'pass', 'fail', 'unanswered'] as QuestionStatus[]).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterChip,
              statusFilter === status && styles.filterChipActive,
              status === 'pass' && statusFilter === status && styles.filterChipPass,
              status === 'fail' && statusFilter === status && styles.filterChipFail,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setStatusFilter(status);
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === status && styles.filterChipTextActive,
              ]}
            >
              {status === 'all'
                ? t('common.all', 'All')
                : status === 'pass'
                ? t('common.pass', 'Pass')
                : status === 'fail'
                ? t('common.fail', 'Fail')
                : t('inspection.unanswered', 'Unanswered')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.resultCount}>
        {filteredQuestions.length} {t('inspection.questionsFound', 'questions found')}
      </Text>

      <FlatList
        data={filteredQuestions}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.question.id)}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery
                ? t('inspection.noMatchingQuestions', 'No matching questions')
                : t('inspection.noQuestions', 'No questions')}
            </Text>
          </View>
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingTop: 50,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 16,
    color: '#9E9E9E',
    fontWeight: '700',
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#212121',
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#757575',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#757575',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  filterChipActive: {
    backgroundColor: '#1976D2',
  },
  filterChipPass: {
    backgroundColor: '#4CAF50',
  },
  filterChipFail: {
    backgroundColor: '#F44336',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  resultCount: {
    fontSize: 12,
    color: '#9E9E9E',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  resultItemCurrent: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#1976D2',
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  statusBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  questionNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#757575',
    minWidth: 32,
  },
  resultContent: {
    flex: 1,
  },
  resultText: {
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
  },
  highlightText: {
    backgroundColor: '#FFEB3B',
    fontWeight: '700',
  },
  criticalTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  criticalTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D32F2F',
  },
  currentIndicator: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  currentIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
  },
});

export default QuestionSearch;
