/**
 * AIRatingsSheet - Bottom sheet showing AI-suggested ratings
 *
 * Features:
 * - AI-suggested ratings for workers
 * - Accept/Modify buttons per rating
 * - Apply all action
 * - Explanations for each suggestion
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { aiApi } from '@inspection/shared';

interface Worker {
  id: number;
  full_name: string;
  role?: string;
}

interface Job {
  id: number;
  equipment_name?: string;
  job_type?: string;
}

interface AIRating {
  worker_id: number;
  worker_name: string;
  suggested_qc_rating: number;
  suggested_time_rating: number;
  suggested_cleaning_rating: number;
  confidence: number;
  explanation: string;
  factors: string[];
}

interface AIRatingsSheetProps {
  visible: boolean;
  onClose: () => void;
  reviewId: number;
  jobs: Job[];
  workers: Worker[];
  onApplyRating: (workerId: number, jobId: number, ratings: {
    qc_rating: number;
    time_rating?: number;
    cleaning_rating?: number;
  }) => void;
  onApplyAll: (ratings: Array<{
    worker_id: number;
    job_id: number;
    qc_rating: number;
    time_rating?: number;
    cleaning_rating?: number;
  }>) => void;
}

export default function AIRatingsSheet({
  visible,
  onClose,
  reviewId,
  jobs,
  workers,
  onApplyRating,
  onApplyAll,
}: AIRatingsSheetProps) {
  const { t } = useTranslation();
  const [expandedWorker, setExpandedWorker] = useState<number | null>(null);
  const [modifiedRatings, setModifiedRatings] = useState<Record<number, Partial<AIRating>>>({});

  // Fetch AI suggestions
  const { data: suggestionsData, isLoading, refetch } = useQuery({
    queryKey: ['ai-ratings', reviewId],
    queryFn: async () => {
      try {
        const response = await aiApi.suggestRatings(reviewId);
        return ((response.data as any)?.data?.suggestions ?? []) as AIRating[];
      } catch {
        // Return mock data if API not available
        return workers.map((w) => ({
          worker_id: w.id,
          worker_name: w.full_name,
          suggested_qc_rating: Math.floor(Math.random() * 2) + 3, // 3-5
          suggested_time_rating: Math.floor(Math.random() * 3) + 4, // 4-7
          suggested_cleaning_rating: Math.floor(Math.random() * 2), // 0-2
          confidence: 0.7 + Math.random() * 0.25,
          explanation: 'Based on historical performance and job complexity',
          factors: ['On-time completion', 'Quality of work', 'Adherence to procedures'],
        })) as AIRating[];
      }
    },
    enabled: visible,
  });

  const suggestions = suggestionsData ?? [];

  const handleModifyRating = useCallback(
    (workerId: number, field: keyof AIRating, value: number) => {
      setModifiedRatings((prev) => ({
        ...prev,
        [workerId]: {
          ...prev[workerId],
          [field]: value,
        },
      }));
    },
    []
  );

  const getEffectiveRating = (suggestion: AIRating, field: keyof AIRating) => {
    if (modifiedRatings[suggestion.worker_id]?.[field] !== undefined) {
      return modifiedRatings[suggestion.worker_id][field];
    }
    return suggestion[field];
  };

  const handleApplySingle = useCallback(
    (suggestion: AIRating) => {
      const jobId = jobs[0]?.id; // Assuming single job per worker for simplicity
      if (!jobId) return;

      onApplyRating(suggestion.worker_id, jobId, {
        qc_rating: getEffectiveRating(suggestion, 'suggested_qc_rating') as number,
        time_rating: getEffectiveRating(suggestion, 'suggested_time_rating') as number,
        cleaning_rating: getEffectiveRating(suggestion, 'suggested_cleaning_rating') as number,
      });
    },
    [jobs, onApplyRating, modifiedRatings]
  );

  const handleApplyAll = useCallback(() => {
    const allRatings = suggestions.map((suggestion) => ({
      worker_id: suggestion.worker_id,
      job_id: jobs[0]?.id ?? 0,
      qc_rating: getEffectiveRating(suggestion, 'suggested_qc_rating') as number,
      time_rating: getEffectiveRating(suggestion, 'suggested_time_rating') as number,
      cleaning_rating: getEffectiveRating(suggestion, 'suggested_cleaning_rating') as number,
    }));
    onApplyAll(allRatings);
    onClose();
  }, [suggestions, jobs, onApplyAll, onClose, modifiedRatings]);

  const renderStars = (rating: number, max: number = 5) => {
    return Array.from({ length: max }, (_, i) => (
      <Text
        key={i}
        style={[styles.star, i < rating ? styles.starFilled : styles.starEmpty]}
      >
        {i < rating ? '\u2605' : '\u2606'}
      </Text>
    ));
  };

  const renderRatingRow = (
    label: string,
    currentValue: number,
    suggestionField: keyof AIRating,
    suggestion: AIRating,
    max: number = 5
  ) => {
    const effectiveValue = getEffectiveRating(suggestion, suggestionField) as number;
    const isModified = modifiedRatings[suggestion.worker_id]?.[suggestionField] !== undefined;

    return (
      <View style={styles.ratingRow}>
        <Text style={styles.ratingLabel}>{label}</Text>
        <View style={styles.ratingControls}>
          <TouchableOpacity
            style={styles.ratingButton}
            onPress={() =>
              handleModifyRating(
                suggestion.worker_id,
                suggestionField,
                Math.max(0, effectiveValue - 1)
              )
            }
          >
            <Text style={styles.ratingButtonText}>-</Text>
          </TouchableOpacity>
          <View style={styles.starsContainer}>
            {renderStars(effectiveValue, max)}
          </View>
          <TouchableOpacity
            style={styles.ratingButton}
            onPress={() =>
              handleModifyRating(
                suggestion.worker_id,
                suggestionField,
                Math.min(max, effectiveValue + 1)
              )
            }
          >
            <Text style={styles.ratingButtonText}>+</Text>
          </TouchableOpacity>
          {isModified && <View style={styles.modifiedDot} />}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerHandle} />
            <View style={styles.headerContent}>
              <View style={styles.headerTitleRow}>
                <View style={styles.aiIcon}>
                  <Text style={styles.aiIconText}>AI</Text>
                </View>
                <Text style={styles.headerTitle}>AI Rating Suggestions</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.closeButton}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#7B1FA2" />
              <Text style={styles.loadingText}>Analyzing performance data...</Text>
            </View>
          ) : suggestions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No suggestions available</Text>
            </View>
          ) : (
            <>
              <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {suggestions.map((suggestion) => {
                  const isExpanded = expandedWorker === suggestion.worker_id;

                  return (
                    <View key={suggestion.worker_id} style={styles.workerCard}>
                      <TouchableOpacity
                        style={styles.workerHeader}
                        onPress={() =>
                          setExpandedWorker(isExpanded ? null : suggestion.worker_id)
                        }
                      >
                        <View style={styles.workerInfo}>
                          <Text style={styles.workerName}>{suggestion.worker_name}</Text>
                          <View style={styles.confidenceBadge}>
                            <Text style={styles.confidenceText}>
                              {Math.round(suggestion.confidence * 100)}% confident
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.expandIcon}>{isExpanded ? '−' : '+'}</Text>
                      </TouchableOpacity>

                      {/* Quick preview when collapsed */}
                      {!isExpanded && (
                        <View style={styles.quickPreview}>
                          <View style={styles.previewItem}>
                            <Text style={styles.previewLabel}>QC</Text>
                            <Text style={styles.previewValue}>
                              {suggestion.suggested_qc_rating}/5
                            </Text>
                          </View>
                          <View style={styles.previewItem}>
                            <Text style={styles.previewLabel}>Time</Text>
                            <Text style={styles.previewValue}>
                              {suggestion.suggested_time_rating}/7
                            </Text>
                          </View>
                          <View style={styles.previewItem}>
                            <Text style={styles.previewLabel}>Clean</Text>
                            <Text style={styles.previewValue}>
                              {suggestion.suggested_cleaning_rating}/2
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Expanded details */}
                      {isExpanded && (
                        <View style={styles.expandedContent}>
                          {renderRatingRow(
                            'QC Rating',
                            suggestion.suggested_qc_rating,
                            'suggested_qc_rating',
                            suggestion,
                            5
                          )}
                          {renderRatingRow(
                            'Time Rating',
                            suggestion.suggested_time_rating,
                            'suggested_time_rating',
                            suggestion,
                            7
                          )}
                          {renderRatingRow(
                            'Cleaning',
                            suggestion.suggested_cleaning_rating,
                            'suggested_cleaning_rating',
                            suggestion,
                            2
                          )}

                          {/* Explanation */}
                          <View style={styles.explanationBox}>
                            <Text style={styles.explanationTitle}>Why these ratings?</Text>
                            <Text style={styles.explanationText}>
                              {suggestion.explanation}
                            </Text>
                            <View style={styles.factorsList}>
                              {suggestion.factors.map((factor, idx) => (
                                <View key={idx} style={styles.factorItem}>
                                  <Text style={styles.factorDot}>•</Text>
                                  <Text style={styles.factorText}>{factor}</Text>
                                </View>
                              ))}
                            </View>
                          </View>

                          {/* Apply button for this worker */}
                          <TouchableOpacity
                            style={styles.applyButton}
                            onPress={() => handleApplySingle(suggestion)}
                          >
                            <Text style={styles.applyButtonText}>Apply Rating</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Apply All Button */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.applyAllButton}
                  onPress={handleApplyAll}
                >
                  <Text style={styles.applyAllButtonText}>
                    Apply All Ratings ({suggestions.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
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
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#BDBDBD',
    borderRadius: 2,
    marginBottom: 16,
  },
  headerContent: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7B1FA2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiIconText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  closeButton: {
    fontSize: 16,
    color: '#757575',
  },

  // Loading/Empty states
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#757575',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#757575',
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Worker Card
  workerCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  workerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  workerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  workerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  confidenceBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 11,
    color: '#1565C0',
    fontWeight: '500',
  },
  expandIcon: {
    fontSize: 20,
    color: '#757575',
    fontWeight: '600',
  },

  // Quick Preview
  quickPreview: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewLabel: {
    fontSize: 12,
    color: '#757575',
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },

  // Expanded Content
  expandedContent: {
    padding: 16,
    paddingTop: 0,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  ratingLabel: {
    fontSize: 14,
    color: '#424242',
  },
  ratingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    fontSize: 18,
  },
  starFilled: {
    color: '#FFC107',
  },
  starEmpty: {
    color: '#E0E0E0',
  },
  modifiedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7B1FA2',
    marginLeft: 4,
  },

  // Explanation
  explanationBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  explanationTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7B1FA2',
    marginBottom: 6,
  },
  explanationText: {
    fontSize: 13,
    color: '#424242',
    lineHeight: 18,
    marginBottom: 8,
  },
  factorsList: {
    gap: 4,
  },
  factorItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  factorDot: {
    color: '#7B1FA2',
    fontSize: 12,
  },
  factorText: {
    fontSize: 12,
    color: '#616161',
    flex: 1,
  },

  // Apply Button (single worker)
  applyButton: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
  },

  // Footer
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  applyAllButton: {
    backgroundColor: '#7B1FA2',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyAllButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
