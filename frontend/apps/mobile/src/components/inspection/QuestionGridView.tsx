import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { QuestionThumbnail, QuestionStatus, STATUS_CONFIG } from './QuestionCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 16;
const THUMBNAIL_SIZE = 56;
const THUMBNAIL_MARGIN = 8;
const COLUMNS = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2) / (THUMBNAIL_SIZE + THUMBNAIL_MARGIN));

export interface QuestionGridItem {
  id: number;
  questionNumber: number;
  questionText: string;
  status: QuestionStatus;
  category?: 'mechanical' | 'electrical' | null;
  isCritical?: boolean;
  assembly?: string;
}

export interface QuestionGridViewProps {
  questions: QuestionGridItem[];
  currentIndex: number;
  onSelectQuestion: (index: number) => void;
  visible: boolean;
  onClose: () => void;
}

type FilterStatus = QuestionStatus | 'all';

export function QuestionGridView({
  questions,
  currentIndex,
  onSelectQuestion,
  visible,
  onClose,
}: QuestionGridViewProps) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  // Filter questions based on selected status
  const filteredQuestions = useMemo(() => {
    if (filterStatus === 'all') return questions;
    return questions.filter(q => q.status === filterStatus);
  }, [questions, filterStatus]);

  // Group by assembly if available
  const groupedQuestions = useMemo(() => {
    const groups: { assembly: string; items: { question: QuestionGridItem; originalIndex: number }[] }[] = [];
    let currentAssembly = '';

    questions.forEach((q, idx) => {
      if (filterStatus !== 'all' && q.status !== filterStatus) return;

      const assembly = q.assembly || 'General';
      if (assembly !== currentAssembly) {
        groups.push({ assembly, items: [] });
        currentAssembly = assembly;
      }
      groups[groups.length - 1]?.items.push({ question: q, originalIndex: idx });
    });

    return groups;
  }, [questions, filterStatus]);

  // Count by status for filter buttons
  const statusCounts = useMemo(() => {
    const counts: Record<FilterStatus, number> = {
      all: questions.length,
      pass: 0,
      fail: 0,
      needs_review: 0,
      unanswered: 0,
      skipped: 0,
    };
    questions.forEach(q => {
      counts[q.status]++;
    });
    return counts;
  }, [questions]);

  const handleSelect = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectQuestion(index);
    onClose();
  }, [onSelectQuestion, onClose]);

  const handleFilterPress = useCallback((status: FilterStatus) => {
    Haptics.selectionAsync();
    setFilterStatus(status);
  }, []);

  // Filter buttons configuration
  const filterButtons: { status: FilterStatus; label: string }[] = [
    { status: 'all', label: 'All' },
    { status: 'pass', label: 'Pass' },
    { status: 'fail', label: 'Fail' },
    { status: 'needs_review', label: 'Review' },
    { status: 'unanswered', label: 'Pending' },
    { status: 'skipped', label: 'Skipped' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Question Overview</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>

        {/* Legend */}
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>Legend:</Text>
          <View style={styles.legendRow}>
            {(Object.keys(STATUS_CONFIG) as QuestionStatus[]).map(status => {
              const config = STATUS_CONFIG[status];
              return (
                <View key={status} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: config.borderColor }]} />
                  <Text style={styles.legendText}>{config.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Filter buttons */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterRow}>
              {filterButtons.map(({ status, label }) => {
                const isActive = filterStatus === status;
                const count = statusCounts[status];
                const config = status === 'all' ? null : STATUS_CONFIG[status];

                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.filterButton,
                      isActive && styles.filterButtonActive,
                      config && isActive && { backgroundColor: config.borderColor },
                    ]}
                    onPress={() => handleFilterPress(status)}
                  >
                    <Text
                      style={[
                        styles.filterButtonText,
                        isActive && styles.filterButtonTextActive,
                      ]}
                    >
                      {label} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Grid view */}
        <ScrollView style={styles.gridScrollView} contentContainerStyle={styles.gridContent}>
          {groupedQuestions.map((group, groupIndex) => (
            <View key={`${group.assembly}-${groupIndex}`} style={styles.assemblyGroup}>
              <Text style={styles.assemblyTitle}>{group.assembly}</Text>
              <View style={styles.grid}>
                {group.items.map(({ question, originalIndex }) => (
                  <QuestionThumbnail
                    key={question.id}
                    status={question.status}
                    questionNumber={question.questionNumber}
                    isActive={originalIndex === currentIndex}
                    onPress={() => handleSelect(originalIndex)}
                  />
                ))}
              </View>
            </View>
          ))}

          {filteredQuestions.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>
                {filterStatus === 'pass' ? '\u2713' :
                 filterStatus === 'fail' ? '\u2717' :
                 filterStatus === 'needs_review' ? '\u26a0' :
                 filterStatus === 'skipped' ? '\u2192' : '?'}
              </Text>
              <Text style={styles.emptyStateText}>
                No questions with this status
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Quick stats footer */}
        <View style={styles.statsFooter}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: STATUS_CONFIG.pass.borderColor }]}>
              {statusCounts.pass}
            </Text>
            <Text style={styles.statLabel}>Pass</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: STATUS_CONFIG.fail.borderColor }]}>
              {statusCounts.fail}
            </Text>
            <Text style={styles.statLabel}>Fail</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: STATUS_CONFIG.unanswered.borderColor }]}>
              {statusCounts.unanswered}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#212121' }]}>
              {Math.round(((statusCounts.pass + statusCounts.fail + statusCounts.needs_review) / questions.length) * 100)}%
            </Text>
            <Text style={styles.statLabel}>Complete</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#1976D2',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  legendContainer: {
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: '#666',
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  filterButtonActive: {
    backgroundColor: '#1976D2',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  gridScrollView: {
    flex: 1,
  },
  gridContent: {
    padding: GRID_PADDING,
  },
  assemblyGroup: {
    marginBottom: 16,
  },
  assemblyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
    paddingLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
    opacity: 0.3,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
  },
  statsFooter: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    justifyContent: 'space-around',
    paddingBottom: 30,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
});

export default QuestionGridView;
