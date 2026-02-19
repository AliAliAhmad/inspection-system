/**
 * GoalsScreen - Goal management screen
 *
 * Features:
 * - List of goals with status
 * - Create new goal button
 * - Swipe to edit/delete
 * - Goal progress tracking
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Animated,
  PanResponder,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { performanceApi } from '@inspection/shared';

import ProgressRing from '../../components/ProgressRing';

interface Goal {
  id: number;
  title: string;
  description?: string;
  target: number;
  current: number;
  unit: string;
  deadline: string;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
  goal_type: string;
  created_at: string;
}

type FilterType = 'all' | 'active' | 'completed';

const GOAL_TYPES = [
  { key: 'jobs_completed', label: 'Jobs Completed', unit: 'jobs' },
  { key: 'qc_rating', label: 'QC Rating', unit: 'stars' },
  { key: 'completion_rate', label: 'Completion Rate', unit: '%' },
  { key: 'on_time_rate', label: 'On-Time Rate', unit: '%' },
  { key: 'streak', label: 'Streak Days', unit: 'days' },
  { key: 'custom', label: 'Custom Goal', unit: '' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  on_track: { bg: '#E8F5E9', text: '#2E7D32' },
  at_risk: { bg: '#FFF8E1', text: '#F57F17' },
  behind: { bg: '#FFEBEE', text: '#C62828' },
  completed: { bg: '#E3F2FD', text: '#1565C0' },
};

function SwipeableGoalCard({
  goal,
  onEdit,
  onDelete,
  onPress,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  onPress: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(-120, gestureState.dx));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) {
          Animated.spring(translateX, {
            toValue: -120,
            useNativeDriver: true,
          }).start();
          setSwiped(true);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          setSwiped(false);
        }
      },
    })
  ).current;

  const resetSwipe = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
    setSwiped(false);
  }, [translateX]);

  const progress = Math.min(100, (goal.current / goal.target) * 100);
  const statusStyle = STATUS_COLORS[goal.status] ?? STATUS_COLORS.on_track;

  return (
    <View style={styles.swipeContainer}>
      {/* Actions revealed on swipe */}
      <View style={styles.swipeActions}>
        <TouchableOpacity
          style={[styles.swipeAction, styles.editAction]}
          onPress={() => {
            resetSwipe();
            onEdit();
          }}
        >
          <Text style={styles.swipeActionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeAction, styles.deleteAction]}
          onPress={() => {
            resetSwipe();
            onDelete();
          }}
        >
          <Text style={styles.swipeActionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Main card */}
      <Animated.View
        style={[
          styles.goalCard,
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            if (swiped) {
              resetSwipe();
            } else {
              onPress();
            }
          }}
        >
          <View style={styles.goalHeader}>
            <View style={styles.goalTitleRow}>
              <Text style={styles.goalTitle} numberOfLines={1}>
                {goal.title}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>
                  {goal.status.replace('_', ' ')}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.goalBody}>
            <ProgressRing
              progress={progress}
              size={56}
              strokeWidth={5}
              color={statusStyle.text}
            />

            <View style={styles.goalInfo}>
              <Text style={styles.goalProgress}>
                {goal.current} / {goal.target} {goal.unit}
              </Text>
              <Text style={styles.goalDeadline}>
                Due: {new Date(goal.deadline).toLocaleDateString()}
              </Text>
              {goal.description && (
                <Text style={styles.goalDescription} numberOfLines={1}>
                  {goal.description}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%`, backgroundColor: statusStyle.text },
              ]}
            />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function GoalsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterType>('active');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // Form state
  const [goalTitle, setGoalTitle] = useState('');
  const [goalType, setGoalType] = useState('jobs_completed');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalDescription, setGoalDescription] = useState('');

  // Fetch goals
  const { data: goalsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-goals', filter],
    queryFn: async () => {
      try {
        const response = await performanceApi.getMyGoals({ status: filter === 'all' ? undefined : filter });
        return ((response.data as any)?.data ?? response.data ?? []) as Goal[];
      } catch {
        return [] as Goal[];
      }
    },
  });

  const goals = goalsData ?? [];

  // Create goal mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return performanceApi.createGoal(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      resetForm();
      setModalVisible(false);
      Alert.alert(t('common.success'), 'Goal created successfully');
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.response?.data?.message || 'Failed to create goal');
    },
  });

  // Update goal mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return performanceApi.updateGoal(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      resetForm();
      setModalVisible(false);
      setEditingGoal(null);
      Alert.alert(t('common.success'), 'Goal updated successfully');
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.response?.data?.message || 'Failed to update goal');
    },
  });

  // Delete goal mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return performanceApi.deleteGoal(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      Alert.alert(t('common.success'), 'Goal deleted');
    },
    onError: (err: any) => {
      Alert.alert(t('common.error'), err?.response?.data?.message || 'Failed to delete goal');
    },
  });

  const resetForm = useCallback(() => {
    setGoalTitle('');
    setGoalType('jobs_completed');
    setGoalTarget('');
    setGoalDeadline('');
    setGoalDescription('');
  }, []);

  const handleCreatePress = useCallback(() => {
    setEditingGoal(null);
    resetForm();
    setModalVisible(true);
  }, [resetForm]);

  const handleEditPress = useCallback((goal: Goal) => {
    setEditingGoal(goal);
    setGoalTitle(goal.title);
    setGoalType(goal.goal_type);
    setGoalTarget(String(goal.target));
    setGoalDeadline(goal.deadline.split('T')[0]);
    setGoalDescription(goal.description || '');
    setModalVisible(true);
  }, []);

  const handleDeletePress = useCallback(
    (goal: Goal) => {
      Alert.alert(
        'Delete Goal',
        `Are you sure you want to delete "${goal.title}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteMutation.mutate(goal.id),
          },
        ]
      );
    },
    [deleteMutation]
  );

  const handleSubmit = useCallback(() => {
    if (!goalTitle.trim()) {
      Alert.alert(t('common.error'), 'Please enter a goal title');
      return;
    }
    if (!goalTarget || isNaN(Number(goalTarget))) {
      Alert.alert(t('common.error'), 'Please enter a valid target');
      return;
    }
    if (!goalDeadline) {
      Alert.alert(t('common.error'), 'Please enter a deadline');
      return;
    }

    const selectedType = GOAL_TYPES.find((t) => t.key === goalType);
    const data = {
      title: goalTitle.trim(),
      goal_type: goalType,
      target: Number(goalTarget),
      deadline: goalDeadline,
      unit: selectedType?.unit || 'units',
      description: goalDescription.trim() || undefined,
    };

    if (editingGoal) {
      updateMutation.mutate({ id: editingGoal.id, data });
    } else {
      createMutation.mutate(data);
    }
  }, [
    goalTitle,
    goalType,
    goalTarget,
    goalDeadline,
    goalDescription,
    editingGoal,
    createMutation,
    updateMutation,
    t,
  ]);

  const filterOptions: { key: FilterType; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'all', label: 'All' },
  ];

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {filterOptions.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[styles.filterTab, filter === option.key && styles.filterTabActive]}
            onPress={() => setFilter(option.key)}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === option.key && styles.filterTabTextActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Goals List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={goals.length === 0 ? styles.emptyContent : styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {goals.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Goals Yet</Text>
            <Text style={styles.emptySubtitle}>
              Set goals to track your performance and stay motivated
            </Text>
          </View>
        ) : (
          goals.map((goal) => (
            <SwipeableGoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => handleEditPress(goal)}
              onDelete={() => handleDeletePress(goal)}
              onPress={() => {}}
            />
          ))
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Create Button */}
      <TouchableOpacity style={styles.fab} onPress={handleCreatePress}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingGoal ? 'Edit Goal' : 'Create Goal'}
            </Text>

            <Text style={styles.modalLabel}>Goal Title *</Text>
            <TextInput
              style={styles.modalInput}
              value={goalTitle}
              onChangeText={setGoalTitle}
              placeholder="e.g., Complete 50 jobs this month"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.modalLabel}>Goal Type</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeOptions}
            >
              {GOAL_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.key}
                  style={[
                    styles.typeChip,
                    goalType === type.key && styles.typeChipActive,
                  ]}
                  onPress={() => setGoalType(type.key)}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      goalType === type.key && styles.typeChipTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.modalLabel}>Target *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  placeholder="e.g., 50"
                  placeholderTextColor="#9E9E9E"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.modalLabel}>Deadline *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={goalDeadline}
                  onChangeText={setGoalDeadline}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9E9E9E"
                />
              </View>
            </View>

            <Text style={styles.modalLabel}>Description (Optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.textArea]}
              value={goalDescription}
              onChangeText={setGoalDescription}
              placeholder="Add notes about this goal..."
              placeholderTextColor="#9E9E9E"
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setModalVisible(false);
                  setEditingGoal(null);
                  resetForm();
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  (createMutation.isPending || updateMutation.isPending) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>
                    {editingGoal ? 'Update' : 'Create'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },

  // Filter
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterTabActive: { backgroundColor: '#1976D2' },
  filterTabText: { fontSize: 14, fontWeight: '500', color: '#757575' },
  filterTabTextActive: { color: '#fff', fontWeight: '600' },

  // List
  list: { flex: 1 },
  listContent: { padding: 16 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },

  // Swipeable Card
  swipeContainer: {
    marginBottom: 12,
    position: 'relative',
  },
  swipeActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
  },
  swipeAction: {
    width: 60,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAction: { backgroundColor: '#1976D2' },
  deleteAction: { backgroundColor: '#E53935' },
  swipeActionText: { color: '#fff', fontWeight: '600', fontSize: 12 },

  // Goal Card
  goalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  goalHeader: { marginBottom: 12 },
  goalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalTitle: { fontSize: 16, fontWeight: '600', color: '#212121', flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  goalBody: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
  goalInfo: { flex: 1 },
  goalProgress: { fontSize: 15, fontWeight: '700', color: '#212121' },
  goalDeadline: { fontSize: 12, color: '#757575', marginTop: 4 },
  goalDescription: { fontSize: 12, color: '#9E9E9E', marginTop: 4 },
  progressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  fabText: { fontSize: 28, color: '#fff', marginTop: -2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#212121', marginBottom: 20, textAlign: 'center' },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#212121',
    marginBottom: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  typeOptions: { gap: 8, marginBottom: 16, paddingVertical: 4 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  typeChipActive: { borderColor: '#1976D2', backgroundColor: '#E3F2FD' },
  typeChipText: { fontSize: 13, color: '#616161' },
  typeChipTextActive: { color: '#1976D2', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelButton: { flex: 1, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#BDBDBD', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#757575' },
  modalSubmitButton: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#1976D2', alignItems: 'center' },
  modalSubmitText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  buttonDisabled: { opacity: 0.6 },

  bottomSpacer: { height: 80 },
});
