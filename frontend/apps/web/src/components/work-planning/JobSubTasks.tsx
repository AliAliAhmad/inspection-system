import React, { useRef, useState } from 'react';
import { Popover, Checkbox, Input, Button, Tooltip, Spin, Empty, Typography, message } from 'antd';
import { PlusOutlined, DeleteOutlined, CameraOutlined, AudioOutlined,
         AudioMutedOutlined, PictureOutlined, SoundOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobSubTasksApi, filesApi, type JobSubTask } from '@inspection/shared';

const { Text } = Typography;

/**
 * The "+" on a planned job: sub-tasks and team notes.
 *
 * These stick to the JOB, not to its place in the week. Send the job back to
 * the pool and pull it out again three weeks later — the list comes back with
 * it. The backend does that by anchoring on the SAP order number rather than
 * the plan row (see app/models/work_plan_job_task.py); the client only ever
 * passes a job id.
 *
 * Everything here calls stopPropagation aggressively. The job row it sits in is
 * BOTH a dnd-kit drag source and a click target that opens the job modal, so a
 * bare click on a checkbox would drag the job to another day or open a dialog
 * over the list.
 */

export const subTaskQueryKey = (jobId: number) => ['job-sub-tasks', jobId] as const;

interface JobSubTasksProps {
  jobId: number;
  /** Count shown before the popover is ever opened, from the plan-wide fetch. */
  total?: number;
  done?: number;
  /** Plan id, so the plan-wide badge cache is refreshed after every change. */
  planId?: number;
  /** Engineers and admins manage the list; everyone else only reads it. */
  canEdit?: boolean;
}

/** Swallow drag + click so the row underneath does not react. */
const stop = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

const JobSubTasksInner: React.FC<JobSubTasksProps> = ({
  jobId,
  total = 0,
  done = 0,
  planId,
  canEdit = true,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();

  // Only fetched once the popover is opened — the board draws ~100 of these.
  const { data, isLoading } = useQuery({
    queryKey: subTaskQueryKey(jobId),
    queryFn: async () => (await jobSubTasksApi.list(jobId)).data,
    enabled: open,
  });

  const tasks: JobSubTask[] = data?.tasks ?? [];
  const shownTotal = data?.total ?? total;
  const shownDone = data?.done ?? done;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: subTaskQueryKey(jobId) });
    if (planId) queryClient.invalidateQueries({ queryKey: ['plan-job-sub-tasks', planId] });
  };

  const addMutation = useMutation({
    mutationFn: ({ content, attachment }:
                 { content: string; attachment?: { fileId: number; kind: 'photo' | 'voice' } }) =>
      jobSubTasksApi.add(jobId, content, attachment),
    onSuccess: () => {
      setDraft('');
      refresh();
    },
    onError: (err: any) =>
      message.error(err?.response?.data?.message || 'Could not add the sub-task'),
  });

  // A photo and a voice note on the job itself.
  //
  // Ali, 2026-09-09: "when i drop a job to a day, i can add a photo, a voice so
  // it can be clear for the team. the finding coming from the inspection
  // already has them, but other jobs do not."
  //
  // A defect raised by an inspection carries the inspector's photo and voice
  // recording. A SAP order and a hand-typed job carry a line of text and
  // nothing else, so the crew arrives at the machine knowing less. These hang
  // on the job's own list, which is the one thing that already survives the job
  // going back to the pool.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const attach = async (file: File, kind: 'photo' | 'voice') => {
    try {
      const uploaded = await filesApi.upload(file, 'work_plan_job', jobId, 'work_plan');
      const fileId = (uploaded.data as any)?.data?.id;
      if (!fileId) throw new Error('upload returned no file');
      await addMutation.mutateAsync({ content: draft.trim(), attachment: { fileId, kind } });
    } catch (err: any) {
      message.error(err?.response?.data?.message || `Could not attach the ${kind}`);
    }
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';                       // so the same file can be picked twice
    if (file) await attach(file, 'photo');
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());   // release the microphone
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          await attach(new File([blob], `job-${jobId}-note.webm`, { type: 'audio/webm' }), 'voice');
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      message.error('No microphone available');
    }
  };

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, isDone }: { taskId: number; isDone: boolean }) =>
      jobSubTasksApi.update(jobId, taskId, { is_done: isDone }),
    onSuccess: refresh,
    onError: (err: any) =>
      message.error(err?.response?.data?.message || 'Could not update the sub-task'),
  });

  const removeMutation = useMutation({
    mutationFn: (taskId: number) => jobSubTasksApi.remove(jobId, taskId),
    onSuccess: refresh,
    onError: (err: any) =>
      message.error(err?.response?.data?.message || 'Could not remove the sub-task'),
  });

  const submitDraft = () => {
    const content = draft.trim();
    if (!content) return;
    addMutation.mutate({ content });
  };

  const content = (
    <div style={{ width: 300 }} onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin size="small" />
        </div>
      ) : tasks.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text style={{ fontSize: 12 }}>No sub-tasks yet</Text>}
          style={{ margin: '8px 0' }}
        />
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 8 }}>
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                padding: '4px 2px',
                borderBottom: '1px solid #f5f5f5',
              }}
            >
              <Checkbox
                checked={task.is_done}
                disabled={toggleMutation.isPending}
                onChange={(e) =>
                  toggleMutation.mutate({ taskId: task.id, isDone: e.target.checked })
                }
                style={{ marginTop: 2 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 12,
                    wordBreak: 'break-word',
                    textDecoration: task.is_done ? 'line-through' : undefined,
                    color: task.is_done ? '#8c8c8c' : '#262626',
                  }}
                >
                  {task.attachment_kind === 'photo' ? <PictureOutlined /> : null}
                  {task.attachment_kind === 'voice' ? <SoundOutlined /> : null}
                  {task.attachment_kind ? ' ' : null}
                  {task.content}
                </Text>
                {task.attachment_url && task.attachment_kind === 'photo' && (
                  <a href={task.attachment_url} target="_blank" rel="noreferrer">
                    <img
                      src={task.attachment_url}
                      alt={task.content}
                      style={{ marginTop: 4, maxWidth: '100%', maxHeight: 120,
                               borderRadius: 4, display: 'block' }}
                    />
                  </a>
                )}
                {task.attachment_url && task.attachment_kind === 'voice' && (
                  // controls only — a plan board must never start playing by itself
                  <audio src={task.attachment_url} controls preload="none"
                         style={{ marginTop: 4, width: '100%', height: 30 }} />
                )}
                {task.is_done && task.done_by_name ? (
                  <div>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      done by {task.done_by_name}
                    </Text>
                  </div>
                ) : null}
              </div>
              {canEdit ? (
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(task.id)}
                  style={{ flexShrink: 0, color: '#bfbfbf' }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canEdit ? (
        <>
          <Input.Search
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onSearch={submitDraft}
            placeholder="Add a sub-task or note"
            maxLength={500}
            size="small"
            enterButton={<PlusOutlined />}
            loading={addMutation.isPending}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onPickPhoto}
            />
            <Button
              size="small"
              icon={<CameraOutlined />}
              onClick={() => fileInputRef.current?.click()}
              loading={addMutation.isPending}
              style={{ flex: 1 }}
            >
              Photo
            </Button>
            <Button
              size="small"
              danger={recording}
              icon={recording ? <AudioMutedOutlined /> : <AudioOutlined />}
              onClick={toggleRecording}
              style={{ flex: 1 }}
            >
              {recording ? 'Stop' : 'Voice'}
            </Button>
          </div>
          <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
            Anything typed above is used as the caption.
          </Text>
        </>
      ) : null}
    </div>
  );

  const hasAny = shownTotal > 0;

  return (
    <span onClick={stop} onPointerDown={stop} style={{ flexShrink: 0, display: 'inline-flex' }}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="rightTop"
        title={<span style={{ fontSize: 12 }}>Sub-tasks &amp; notes</span>}
        content={content}
        destroyOnHidden
      >
        <Tooltip title={hasAny ? `${shownDone}/${shownTotal} sub-tasks done` : 'Add a sub-task or note'}>
          <span
            role="button"
            tabIndex={0}
            style={{
              fontSize: 9,
              fontWeight: 700,
              lineHeight: '14px',
              padding: '0 5px',
              borderRadius: 8,
              cursor: 'pointer',
              userSelect: 'none',
              // Green once every line is ticked — readable at a glance across
              // a whole day column without opening anything.
              color: hasAny ? (shownDone === shownTotal ? '#237804' : '#0958d9') : '#8c8c8c',
              background: hasAny ? (shownDone === shownTotal ? '#f6ffed' : '#e6f4ff') : 'transparent',
              border: `1px dashed ${hasAny ? 'transparent' : '#d9d9d9'}`,
            }}
          >
            {hasAny ? `☑ ${shownDone}/${shownTotal}` : '+'}
          </span>
        </Tooltip>
      </Popover>
    </span>
  );
};

export const JobSubTasks = React.memo(JobSubTasksInner);

export default JobSubTasks;
