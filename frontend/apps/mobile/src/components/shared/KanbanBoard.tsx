import React, { useState, useCallback, useMemo, ReactNode, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = SCREEN_WIDTH * 0.75;

// Generic job interface that works for specialist jobs, engineer jobs, etc.
export interface KanbanJob {
  id: number;
  job_id?: string;
  status: string;
  category?: string;
  priority?: string;
  planned_time_hours?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  time_rating?: number | null;
  description?: string;
  title?: string;
  assigned_to?: {
    id: number;
    full_name: string;
  } | null;
  specialist?: {
    id: number;
    full_name: string;
  } | null;
  engineer?: {
    id: number;
    full_name: string;
  } | null;
  defect?: {
    description?: string;
  } | null;
  equipment?: {
    name?: string;
    serial_number?: string;
  } | null;
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  icon?: string;
}

export interface KanbanBoardProps<T extends KanbanJob> {
  jobs: T[];
  columns?: KanbanColumn[];
  onJobClick?: (job: T) => void;
  onStatusChange?: (jobId: number, newStatus: string) => Promise<void>;
  loading?: boolean;
  renderCard?: (job: T) => ReactNode;
  getCategoryColor?: (category?: string) => string;
  groupByField?: keyof T;
  columnWidth?: number;
  enableDragDrop?: boolean;
  swipeActions?: {
    left?: { label: string; color: string; onPress: (job: T) => void };
    right?: { label: string; color: string; onPress: (job: T) => void };
  };
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'assigned', title: 'Assigned', color: '#1890ff', icon: '>' },
  { id: 'in_progress', title: 'In Progress', color: '#fa8c16', icon: '~' },
  { id: 'paused', title: 'Paused', color: '#722ed1', icon: '||' },
  { id: 'completed', title: 'Completed', color: '#52c41a', icon: 'v' },
];

interface JobCardProps<T extends KanbanJob> {
  job: T;
  onClick?: (job: T) => void;
  isDragging?: boolean;
  getCategoryColor?: (category?: string) => string;
  swipeActions?: KanbanBoardProps<T>['swipeActions'];
}

function DefaultJobCard<T extends KanbanJob>({
  job,
  onClick,
  isDragging,
  getCategoryColor,
  swipeActions,
}: JobCardProps<T>) {
  const { t } = useTranslation();
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeThreshold = 80;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderMove: (_, gestureState) => {
        if (swipeActions) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (swipeActions) {
          if (gestureState.dx > swipeThreshold && swipeActions.right) {
            swipeActions.right.onPress(job);
          } else if (gestureState.dx < -swipeThreshold && swipeActions.left) {
            swipeActions.left.onPress(job);
          }
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const isOverdue = job.started_at && !job.completed_at &&
    new Date(job.started_at).getTime() < Date.now() - 24 * 60 * 60 * 1000;

  const assignee = job.assigned_to || job.specialist || job.engineer;
  const categoryColor = getCategoryColor?.(job.category) ?? (job.category === 'major' ? '#f5222d' : '#faad14');

  const cardContent = (
    <View style={styles.cardContentInner}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {job.job_id || job.title || `#${job.id}`}
        </Text>
        {isOverdue && <Text style={styles.overdueIcon}>!</Text>}
      </View>

      {(job.defect?.description || job.description) && (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {job.defect?.description || job.description}
        </Text>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.cardTags}>
          {job.category && (
            <View style={[styles.tag, { backgroundColor: job.category === 'major' ? '#ffccc7' : '#fff7e6' }]}>
              <Text style={[styles.tagText, { color: job.category === 'major' ? '#cf1322' : '#d46b08' }]}>
                {job.category}
              </Text>
            </View>
          )}
          {job.priority && job.priority !== 'normal' && (
            <View style={[
              styles.tag,
              { backgroundColor: job.priority === 'critical' ? '#ffccc7' : job.priority === 'high' ? '#fff7e6' : '#e6f7ff' }
            ]}>
              <Text style={[
                styles.tagText,
                { color: job.priority === 'critical' ? '#cf1322' : job.priority === 'high' ? '#d46b08' : '#1890ff' }
              ]}>
                {job.priority}
              </Text>
            </View>
          )}
          {job.planned_time_hours && (
            <Text style={styles.timeText}>{job.planned_time_hours}h</Text>
          )}
        </View>
        <View style={styles.assigneeAvatar}>
          <Text style={styles.assigneeInitial}>
            {assignee?.full_name?.charAt(0) || '?'}
          </Text>
        </View>
      </View>

      {job.time_rating !== null && job.time_rating !== undefined && (
        <View style={styles.ratingRow}>
          <Text style={styles.ratingText}>
            {'*'.repeat(Math.min(Math.round(job.time_rating), 5))}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.swipeContainer}>
      {swipeActions?.left && (
        <View style={[styles.swipeAction, styles.swipeActionLeft, { backgroundColor: swipeActions.left.color }]}>
          <Text style={styles.swipeActionText}>{swipeActions.left.label}</Text>
        </View>
      )}
      {swipeActions?.right && (
        <View style={[styles.swipeAction, styles.swipeActionRight, { backgroundColor: swipeActions.right.color }]}>
          <Text style={styles.swipeActionText}>{swipeActions.right.label}</Text>
        </View>
      )}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.cardContainer,
          { borderLeftColor: categoryColor },
          isDragging && styles.cardDragging,
          { transform: [{ translateX }] },
        ]}
      >
        <TouchableOpacity onPress={() => onClick?.(job)} activeOpacity={0.7}>
          {cardContent}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

interface DraggableCardProps<T extends KanbanJob> {
  job: T;
  onClick?: (job: T) => void;
  renderCard?: (job: T) => ReactNode;
  getCategoryColor?: (category?: string) => string;
  swipeActions?: KanbanBoardProps<T>['swipeActions'];
  onLongPress?: (job: T) => void;
  onDragEnd?: (job: T, targetColumn: string) => void;
  columns: KanbanColumn[];
  enableDragDrop?: boolean;
}

function DraggableCard<T extends KanbanJob>({
  job,
  onClick,
  renderCard,
  getCategoryColor,
  swipeActions,
  onLongPress,
  enableDragDrop = true,
}: DraggableCardProps<T>) {
  const handleLongPress = () => {
    if (enableDragDrop && onLongPress) {
      onLongPress(job);
    }
  };

  if (renderCard) {
    return (
      <TouchableOpacity onLongPress={handleLongPress} delayLongPress={500}>
        {renderCard(job)}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onLongPress={handleLongPress} delayLongPress={500} activeOpacity={1}>
      <DefaultJobCard
        job={job}
        onClick={onClick}
        getCategoryColor={getCategoryColor}
        swipeActions={swipeActions}
      />
    </TouchableOpacity>
  );
}

interface KanbanColumnComponentProps<T extends KanbanJob> {
  column: KanbanColumn;
  jobs: T[];
  onJobClick?: (job: T) => void;
  renderCard?: (job: T) => ReactNode;
  getCategoryColor?: (category?: string) => string;
  swipeActions?: KanbanBoardProps<T>['swipeActions'];
  onLongPressJob?: (job: T) => void;
  onDragEnd?: (job: T, targetColumn: string) => void;
  columns: KanbanColumn[];
  columnWidth: number;
  enableDragDrop?: boolean;
}

function KanbanColumnComponent<T extends KanbanJob>({
  column,
  jobs,
  onJobClick,
  renderCard,
  getCategoryColor,
  swipeActions,
  onLongPressJob,
  onDragEnd,
  columns,
  columnWidth,
  enableDragDrop,
}: KanbanColumnComponentProps<T>) {
  const { t } = useTranslation();

  return (
    <View style={[styles.column, { width: columnWidth }]}>
      <View style={styles.columnHeader}>
        <View style={[styles.columnIcon, { backgroundColor: column.color }]}>
          <Text style={styles.columnIconText}>{column.icon || '*'}</Text>
        </View>
        <Text style={styles.columnTitle}>
          {t(`status.${column.id}`, column.title)}
        </Text>
        <View style={[styles.countBadge, { backgroundColor: column.color }]}>
          <Text style={styles.countBadgeText}>{jobs.length}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.columnContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {jobs.map((job) => (
          <DraggableCard
            key={job.id}
            job={job}
            onClick={onJobClick}
            renderCard={renderCard}
            getCategoryColor={getCategoryColor}
            swipeActions={swipeActions}
            onLongPress={onLongPressJob}
            onDragEnd={onDragEnd}
            columns={columns}
            enableDragDrop={enableDragDrop}
          />
        ))}

        {jobs.length === 0 && (
          <View style={styles.emptyColumn}>
            <Text style={styles.emptyColumnText}>
              {t('common.noData', 'No jobs')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export function KanbanBoard<T extends KanbanJob>({
  jobs,
  columns = DEFAULT_COLUMNS,
  onJobClick,
  onStatusChange,
  loading,
  renderCard,
  getCategoryColor,
  groupByField = 'status' as keyof T,
  columnWidth = COLUMN_WIDTH,
  enableDragDrop = true,
  swipeActions,
}: KanbanBoardProps<T>) {
  const { t } = useTranslation();
  const [selectedJob, setSelectedJob] = useState<T | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);

  const jobsByColumn = useMemo(() => {
    const grouped: Record<string, T[]> = {};
    columns.forEach((col) => {
      grouped[col.id] = [];
    });
    jobs.forEach((job) => {
      const columnId = String(job[groupByField]);
      if (grouped[columnId]) {
        grouped[columnId].push(job);
      }
    });
    return grouped;
  }, [jobs, columns, groupByField]);

  const handleLongPressJob = useCallback((job: T) => {
    if (enableDragDrop && onStatusChange) {
      setSelectedJob(job);
      setShowMoveModal(true);
    }
  }, [enableDragDrop, onStatusChange]);

  const handleMoveToColumn = useCallback(async (columnId: string) => {
    if (selectedJob && onStatusChange) {
      const currentStatus = String(selectedJob[groupByField]);
      if (columnId !== currentStatus) {
        try {
          await onStatusChange(selectedJob.id, columnId);
        } catch {
          Alert.alert(t('common.error'), t('common.operation_failed', 'Operation failed'));
        }
      }
    }
    setShowMoveModal(false);
    setSelectedJob(null);
  }, [selectedJob, onStatusChange, groupByField, t]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScroll}
        pagingEnabled={false}
        snapToInterval={columnWidth + 12}
        decelerationRate="fast"
      >
        {columns.map((column) => (
          <KanbanColumnComponent
            key={column.id}
            column={column}
            jobs={jobsByColumn[column.id] || []}
            onJobClick={onJobClick}
            renderCard={renderCard}
            getCategoryColor={getCategoryColor}
            swipeActions={swipeActions}
            onLongPressJob={handleLongPressJob}
            columns={columns}
            columnWidth={columnWidth}
            enableDragDrop={enableDragDrop}
          />
        ))}
      </ScrollView>

      {/* Move to Column Modal (simplified drag alternative) */}
      {showMoveModal && selectedJob && (
        <View style={styles.moveModalOverlay}>
          <TouchableOpacity
            style={styles.moveModalBackdrop}
            onPress={() => {
              setShowMoveModal(false);
              setSelectedJob(null);
            }}
          />
          <View style={styles.moveModalContent}>
            <Text style={styles.moveModalTitle}>
              {t('jobs.move_to', 'Move to')}
            </Text>
            <Text style={styles.moveModalSubtitle}>
              {selectedJob.job_id || selectedJob.title || `#${selectedJob.id}`}
            </Text>
            <View style={styles.moveModalColumns}>
              {columns.map((col) => {
                const isCurrentColumn = String(selectedJob[groupByField]) === col.id;
                return (
                  <TouchableOpacity
                    key={col.id}
                    style={[
                      styles.moveModalColumn,
                      { borderColor: col.color },
                      isCurrentColumn && styles.moveModalColumnCurrent,
                    ]}
                    onPress={() => handleMoveToColumn(col.id)}
                    disabled={isCurrentColumn}
                  >
                    <View style={[styles.moveModalColumnIcon, { backgroundColor: col.color }]}>
                      <Text style={styles.moveModalColumnIconText}>{col.icon || '*'}</Text>
                    </View>
                    <Text style={[
                      styles.moveModalColumnText,
                      isCurrentColumn && styles.moveModalColumnTextCurrent,
                    ]}>
                      {t(`status.${col.id}`, col.title)}
                    </Text>
                    {isCurrentColumn && (
                      <Text style={styles.moveModalCurrentLabel}>
                        {t('common.current', 'Current')}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.moveModalCancel}
              onPress={() => {
                setShowMoveModal(false);
                setSelectedJob(null);
              }}
            >
              <Text style={styles.moveModalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  horizontalScroll: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  column: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginHorizontal: 6,
    padding: 12,
    height: 400,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  columnIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  columnIconText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  columnContent: {
    flex: 1,
  },
  emptyColumn: {
    padding: 24,
    alignItems: 'center',
  },
  emptyColumnText: {
    color: '#999',
    fontSize: 14,
  },
  // Swipe container
  swipeContainer: {
    marginBottom: 8,
    position: 'relative',
  },
  swipeAction: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  swipeActionLeft: {
    right: 0,
  },
  swipeActionRight: {
    left: 0,
  },
  swipeActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  // Card styles
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderLeftWidth: 3,
    elevation: 2,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
  },
  cardDragging: {
    opacity: 0.5,
  },
  cardContentInner: {
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
  },
  overdueIcon: {
    color: '#f5222d',
    fontWeight: '700',
    marginLeft: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  cardTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  timeText: {
    fontSize: 10,
    color: '#757575',
  },
  assigneeAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assigneeInitial: {
    fontSize: 11,
    fontWeight: '600',
    color: '#616161',
  },
  ratingRow: {
    marginTop: 4,
  },
  ratingText: {
    fontSize: 10,
    color: '#faad14',
  },
  // Move Modal
  moveModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  moveModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  moveModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  moveModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
  },
  moveModalSubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  moveModalColumns: {
    gap: 8,
  },
  moveModalColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    gap: 12,
  },
  moveModalColumnCurrent: {
    backgroundColor: '#f5f5f5',
  },
  moveModalColumnIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moveModalColumnIconText: {
    color: '#fff',
    fontWeight: '700',
  },
  moveModalColumnText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
    flex: 1,
  },
  moveModalColumnTextCurrent: {
    color: '#999',
  },
  moveModalCurrentLabel: {
    fontSize: 12,
    color: '#999',
  },
  moveModalCancel: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  moveModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
  },
});

export default KanbanBoard;
