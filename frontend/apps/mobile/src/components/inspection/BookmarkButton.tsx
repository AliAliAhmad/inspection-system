import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { ChecklistItem } from '@inspection/shared';

const BOOKMARK_STORAGE_KEY = 'inspection_bookmarks_';

export interface BookmarkButtonProps {
  inspectionId: number;
  questionId: number;
  isBookmarked?: boolean;
  onToggle?: (isBookmarked: boolean) => void;
  size?: 'small' | 'medium' | 'large';
}

export function BookmarkButton({
  inspectionId,
  questionId,
  isBookmarked: externalBookmarked,
  onToggle,
  size = 'medium',
}: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(externalBookmarked ?? false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (externalBookmarked !== undefined) {
      setIsBookmarked(externalBookmarked);
    }
  }, [externalBookmarked]);

  const handleToggle = useCallback(async () => {
    const newValue = !isBookmarked;

    // Animate
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();

    Haptics.impactAsync(
      newValue ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );

    setIsBookmarked(newValue);
    onToggle?.(newValue);

    // Persist to storage
    try {
      const key = `${BOOKMARK_STORAGE_KEY}${inspectionId}`;
      const stored = await AsyncStorage.getItem(key);
      const bookmarks: number[] = stored ? JSON.parse(stored) : [];

      if (newValue) {
        if (!bookmarks.includes(questionId)) {
          bookmarks.push(questionId);
        }
      } else {
        const idx = bookmarks.indexOf(questionId);
        if (idx > -1) {
          bookmarks.splice(idx, 1);
        }
      }

      await AsyncStorage.setItem(key, JSON.stringify(bookmarks));
    } catch (error) {
      console.error('Failed to save bookmark:', error);
    }
  }, [isBookmarked, inspectionId, questionId, onToggle, scaleAnim]);

  const iconSize = size === 'small' ? 16 : size === 'large' ? 28 : 22;
  const buttonSize = size === 'small' ? 28 : size === 'large' ? 44 : 36;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { width: buttonSize, height: buttonSize },
        isBookmarked && styles.buttonActive,
      ]}
      onPress={handleToggle}
      activeOpacity={0.7}
    >
      <Animated.Text
        style={[
          styles.icon,
          { fontSize: iconSize },
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {isBookmarked ? '\u2605' : '\u2606'}
      </Animated.Text>
    </TouchableOpacity>
  );
}

// Hook to manage bookmarks
export function useBookmarks(inspectionId: number) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const key = `${BOOKMARK_STORAGE_KEY}${inspectionId}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          setBookmarks(new Set(JSON.parse(stored)));
        }
      } catch (error) {
        console.error('Failed to load bookmarks:', error);
      }
      setIsLoaded(true);
    };
    loadBookmarks();
  }, [inspectionId]);

  const toggleBookmark = useCallback(async (questionId: number) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      // Persist
      AsyncStorage.setItem(
        `${BOOKMARK_STORAGE_KEY}${inspectionId}`,
        JSON.stringify(Array.from(next))
      ).catch(console.error);
      return next;
    });
  }, [inspectionId]);

  const isBookmarked = useCallback(
    (questionId: number) => bookmarks.has(questionId),
    [bookmarks]
  );

  const clearAllBookmarks = useCallback(async () => {
    setBookmarks(new Set());
    try {
      await AsyncStorage.removeItem(`${BOOKMARK_STORAGE_KEY}${inspectionId}`);
    } catch (error) {
      console.error('Failed to clear bookmarks:', error);
    }
  }, [inspectionId]);

  return {
    bookmarks,
    bookmarksArray: Array.from(bookmarks),
    bookmarkCount: bookmarks.size,
    isLoaded,
    toggleBookmark,
    isBookmarked,
    clearAllBookmarks,
  };
}

// Bookmarked Questions List Modal
export interface BookmarkedQuestionsListProps {
  visible: boolean;
  onClose: () => void;
  onSelectQuestion: (index: number) => void;
  questions: ChecklistItem[];
  bookmarkedIds: number[];
  isArabic?: boolean;
}

export function BookmarkedQuestionsList({
  visible,
  onClose,
  onSelectQuestion,
  questions,
  bookmarkedIds,
  isArabic = false,
}: BookmarkedQuestionsListProps) {
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  const bookmarkedQuestions = questions
    .map((q, index) => ({ question: q, index }))
    .filter((item) => bookmarkedIds.includes(item.question.id));

  const handleSelect = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectQuestion(index);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalContainer, { opacity: fadeAnim }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {'\u2605'} {t('inspection.bookmarkedQuestions', 'Bookmarked Questions')}
            </Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <Text style={styles.modalCloseButtonText}>X</Text>
            </TouchableOpacity>
          </View>

          {bookmarkedQuestions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{'\u2606'}</Text>
              <Text style={styles.emptyText}>
                {t('inspection.noBookmarks', 'No bookmarked questions')}
              </Text>
              <Text style={styles.emptyHint}>
                {t('inspection.tapStarToBookmark', 'Tap the star icon to bookmark questions')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={bookmarkedQuestions}
              renderItem={({ item }) => {
                const text = isArabic && item.question.question_text_ar
                  ? item.question.question_text_ar
                  : item.question.question_text;

                return (
                  <TouchableOpacity
                    style={styles.bookmarkItem}
                    onPress={() => handleSelect(item.index)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.bookmarkItemLeft}>
                      <Text style={styles.bookmarkStar}>{'\u2605'}</Text>
                      <Text style={styles.bookmarkNumber}>#{item.index + 1}</Text>
                    </View>
                    <Text style={styles.bookmarkText} numberOfLines={2}>
                      {text}
                    </Text>
                    <Text style={styles.bookmarkArrow}>&gt;</Text>
                  </TouchableOpacity>
                );
              }}
              keyExtractor={(item) => String(item.question.id)}
              style={styles.bookmarkList}
              contentContainerStyle={styles.bookmarkListContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          <Text style={styles.bookmarkCount}>
            {bookmarkedQuestions.length} {t('inspection.bookmarked', 'bookmarked')}
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  buttonActive: {
    backgroundColor: '#FFF8E1',
  },
  icon: {
    color: '#FFB300',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#757575',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    color: '#E0E0E0',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  bookmarkList: {
    flex: 1,
  },
  bookmarkListContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  bookmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  bookmarkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  bookmarkStar: {
    fontSize: 16,
    color: '#FFB300',
    marginRight: 8,
  },
  bookmarkNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#757575',
    minWidth: 36,
  },
  bookmarkText: {
    flex: 1,
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
  },
  bookmarkArrow: {
    fontSize: 16,
    color: '#9E9E9E',
    marginLeft: 8,
  },
  bookmarkCount: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    paddingTop: 12,
  },
});

export default BookmarkButton;
