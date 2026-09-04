/**
 * The job's sub-task / note list, on the worker's phone.
 *
 * The planner writes these on the web board; the worker can TICK them and
 * nothing else. That split is enforced by the server too (only engineers and
 * admins may add, edit or delete) — this component just doesn't draw controls
 * the worker cannot use.
 *
 * The list belongs to the JOB, not to its slot in the week: send the job back
 * to the pool and plan it again next month and the same lines come back. See
 * app/models/work_plan_job_task.py.
 *
 * Ticking is OPTIMISTIC. A man standing under a reach stacker on yard wifi
 * should see the box fill instantly; if the request then fails we put it back
 * and tell him, rather than leaving him tapping a box that never moves.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { jobSubTasksApi } from '@inspection/shared';
import type { JobSubTask, JobSubTaskList } from '@inspection/shared';

interface Props {
  jobId: number;
}

export default function JobSubTasksCard({ jobId }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const queryClient = useQueryClient();
  const queryKey = ['job-sub-tasks', jobId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<JobSubTaskList> => (await jobSubTasksApi.list(jobId)).data,
    enabled: !!jobId,
  });

  const toggle = useMutation({
    mutationFn: ({ taskId, isDone }: { taskId: number; isDone: boolean }) =>
      jobSubTasksApi.update(jobId, taskId, { is_done: isDone }),

    // Paint the tick before the server answers.
    onMutate: async ({ taskId, isDone }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<JobSubTaskList>(queryKey);
      if (previous) {
        const tasks = previous.tasks.map((task) =>
          task.id === taskId ? { ...task, is_done: isDone } : task,
        );
        queryClient.setQueryData<JobSubTaskList>(queryKey, {
          ...previous,
          tasks,
          done: tasks.filter((task) => task.is_done).length,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Put it back exactly as it was, so the screen never lies about progress.
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      // The plan card shows the same counts.
      queryClient.invalidateQueries({ queryKey: ['my-work-plan'] });
    },
  });

  const onToggle = useCallback(
    (task: JobSubTask) => {
      if (toggle.isPending) return;
      toggle.mutate({ taskId: task.id, isDone: !task.is_done });
    },
    [toggle],
  );

  const tasks = data?.tasks ?? [];

  // Nothing to say when the planner left no list — no empty card on the screen.
  if (isLoading || tasks.length === 0) return null;

  const done = tasks.filter((task) => task.is_done).length;
  const allDone = done === tasks.length;

  return (
    <View style={styles.card}>
      <View style={[styles.titleRow, isAr && styles.rowRtl]}>
        <Text style={[styles.cardTitle, isAr && styles.textRtl]}>
          {t('job_sub_tasks.title', 'Sub-tasks & notes')}
        </Text>
        <View style={[styles.progressChip, allDone && styles.progressChipDone]}>
          <Text style={[styles.progressText, allDone && styles.progressTextDone]}>
            {done}/{tasks.length}
          </Text>
        </View>
      </View>

      {tasks.map((task) => (
        <TouchableOpacity
          key={task.id}
          testID={`job-sub-task-${task.id}`}
          activeOpacity={0.6}
          onPress={() => onToggle(task)}
          style={[styles.taskRow, isAr && styles.rowRtl]}
        >
          <View style={[styles.checkbox, task.is_done && styles.checkboxDone]}>
            {task.is_done ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <View style={styles.taskBody}>
            <Text
              style={[
                styles.taskText,
                task.is_done && styles.taskTextDone,
                isAr && styles.textRtl,
              ]}
            >
              {task.content}
            </Text>
            {task.is_done && !!task.done_by_name && (
              <Text style={[styles.doneBy, isAr && styles.textRtl]}>
                {t('job_sub_tasks.done_by', 'done by {{name}}', { name: task.done_by_name })}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      ))}

      {toggle.isPending ? (
        <ActivityIndicator size="small" color="#1976D2" style={styles.spinner} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rowRtl: { flexDirection: 'row-reverse' },
  textRtl: { textAlign: 'right', writingDirection: 'rtl' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#212121' },
  progressChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#E3F2FD',
  },
  progressChipDone: { backgroundColor: '#E8F5E9' },
  progressText: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  progressTextDone: { color: '#2E7D32' },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    marginTop: 1,
  },
  checkboxDone: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  taskBody: { flex: 1 },
  taskText: { fontSize: 14, color: '#212121', lineHeight: 20 },
  taskTextDone: { color: '#9E9E9E', textDecorationLine: 'line-through' },
  doneBy: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  spinner: { marginTop: 8 },
});
