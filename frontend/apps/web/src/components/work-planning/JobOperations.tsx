import React, { useRef, useState } from 'react';
import {
  Card, Button, Typography, Tag, Space, Input, InputNumber, Select, Progress,
  Popconfirm, Empty, Spin, Tooltip, message,
} from 'antd';
import {
  PlusOutlined, CameraOutlined, AudioOutlined, AudioMutedOutlined,
  DeleteOutlined, PictureOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobSubTasksApi, filesApi, type JobSubTask } from '@inspection/shared';
import { createRecorder, describeMicError } from '../../utils/audio-recording';
import { openCamera, openGallery } from '../../utils/file-picker';

const { Text } = Typography;

/**
 * The operations inside an order, on the planner's board.
 *
 * Ali, 2026-09-11: "how i can added or see operations?" — the honest answer at
 * the time was that the phone showed them and the web did not, and that nobody
 * could add one by hand. This is both halves.
 *
 * WHERE THEY COME FROM
 * ====================
 *
 * SAP's IW49, which the app has always read — parse_operation_hours summed the
 * hours per order and threw every row away. Ali's own operations sit in the same
 * list with source 'manual', and behave identically: their own number, hours,
 * trade, timer, and place in the order's progress. A re-sync never touches them,
 * because SAP does not know they exist.
 *
 * WHY MEDIA HANGS ON THE OPERATION
 * ================================
 *
 * Ali, 2026-09-11: "yes photo and voice too". A ten-hour refurbishment has one
 * photo of the whole machine and a different one of the cracked glass on 0020.
 * Hung at job level, both float in the same pile and lose which line they are
 * about. So these carry parent_task_id, and JobAttachments deliberately filters
 * them out of the job's own panel.
 */

interface JobOperationsProps {
  jobId: number;
  planId?: number;
  canEdit?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  in_progress: 'processing',
  paused: 'warning',
  completed: 'success',
  removed_in_sap: 'error',
};

export const JobOperations: React.FC<JobOperationsProps> = ({
  jobId, planId, canEdit = true,
}) => {
  const queryClient = useQueryClient();
  const queryKey = ['job-sub-tasks', jobId];

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ number: string; text: string; hours?: number; trade?: any }>(
    { number: '', text: '' },
  );
  const [busyOn, setBusyOn] = useState<number | null>(null);
  const [recordingFor, setRecordingFor] = useState<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await jobSubTasksApi.list(jobId)).data,
    enabled: !!jobId,
  });

  const all: JobSubTask[] = data?.tasks ?? [];
  const operations = all.filter((t) => !!t.operation_number);
  const progress = data?.operations_progress;

  const mediaFor = (operationId: number) =>
    all.filter((t) => t.parent_task_id === operationId && t.attachment_kind);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    if (planId) queryClient.invalidateQueries({ queryKey: ['plan-job-sub-tasks', planId] });
    queryClient.invalidateQueries({ queryKey: ['work-plans'] });
  };

  const addMutation = useMutation({
    mutationFn: () => jobSubTasksApi.addOperation(jobId, {
      content: draft.text.trim(),
      operation_number: draft.number.trim(),
      planned_hours: draft.hours,
      work_center: draft.trade,
    }),
    onSuccess: () => {
      setDraft({ number: '', text: '' });
      setAdding(false);
      refresh();
      message.success('Operation added');
    },
    onError: (err: any) =>
      message.error(err?.response?.data?.message || 'Could not add the operation'),
  });

  const removeMutation = useMutation({
    mutationFn: (taskId: number) => jobSubTasksApi.remove(jobId, taskId),
    onSuccess: refresh,
    onError: (err: any) => message.error(err?.response?.data?.message || 'Could not remove it'),
  });

  const attach = async (operationId: number, file: File, kind: 'photo' | 'voice') => {
    setBusyOn(operationId);
    try {
      const uploaded = await filesApi.upload(file, 'work_plan_job', jobId, 'work_plan');
      const fileId = (uploaded.data as any)?.data?.id;
      if (!fileId) throw new Error('upload returned no file');
      await jobSubTasksApi.addOperationMedia(jobId, operationId, fileId, kind);
      refresh();
      message.success(kind === 'photo' ? 'Photo added to the operation'
                                       : 'Voice note added to the operation');
    } catch (err: any) {
      message.error(err?.response?.data?.message || `Could not add the ${kind}`);
    } finally {
      setBusyOn(null);
    }
  };

  const toggleRecording = async (operationId: number) => {
    if (recordingFor === operationId) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Safari throws on a hard-coded 'audio/webm' — see utils/audio-recording.ts.
      const { recorder, format } = createRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());   // release the mic
        setRecordingFor(null);
        const blob = new Blob(chunksRef.current, { type: format.mimeType });
        if (blob.size < 100) {
          message.warning('Recording was too short — hold it a moment longer');
          return;
        }
        await attach(operationId,
                     new File([blob], `op-${operationId}.${format.extension}`,
                              { type: format.mimeType }), 'voice');
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordingFor(operationId);
    } catch (err) {
      message.error(describeMicError(err));
      setRecordingFor(null);
    }
  };

  const runTimer = useMutation({
    mutationFn: ({ taskId, action }: { taskId: number; action: any }) =>
      jobSubTasksApi.timer(jobId, taskId, action),
    onSuccess: refresh,
    onError: (err: any) => message.error(err?.response?.data?.message || 'Could not update'),
  });

  if (isLoading) {
    return <Card size="small" style={{ marginBottom: 16 }}><Spin size="small" /></Card>;
  }

  // Nothing to show and nothing to add: most orders have no operations until a
  // sync has run, and an empty card on a crowded modal is noise.
  if (operations.length === 0 && !canEdit) return null;

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={8}>
          <Text type="secondary">Operations</Text>
          {!!progress && (
            <Tag color={progress.all_done ? 'success' : 'blue'} style={{ margin: 0 }}>
              {progress.done}/{progress.total}
            </Tag>
          )}
        </Space>
        {canEdit && !adding && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
            Add operation
          </Button>
        )}
      </div>

      {!!progress && progress.total > 0 && (
        <div style={{ marginTop: 8 }}>
          <Progress
            percent={Math.round((progress.done / progress.total) * 100)}
            size="small"
            status={progress.all_done ? 'success' : 'active'}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {progress.remaining_hours.toFixed(1)}h left of {progress.planned_hours.toFixed(1)}h
            {progress.actual_hours > 0 && ` · ${progress.actual_hours.toFixed(1)}h worked`}
          </Text>
        </div>
      )}

      {adding && (
        <div style={{ marginTop: 10, padding: 8, background: '#fafafa', borderRadius: 4 }}>
          <Space.Compact style={{ width: '100%', marginBottom: 6 }}>
            <Input
              style={{ width: 90 }}
              placeholder="0900"
              value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })}
              maxLength={10}
            />
            <Input
              placeholder="What is this operation?"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              maxLength={500}
            />
          </Space.Compact>
          <Space size={6} wrap>
            <InputNumber
              size="small" min={0} max={999} step={0.5} style={{ width: 90 }}
              placeholder="hours"
              value={draft.hours}
              onChange={(v) => setDraft({ ...draft, hours: v ?? undefined })}
            />
            <Select
              size="small" style={{ width: 110 }} placeholder="trade" allowClear
              value={draft.trade}
              onChange={(v) => setDraft({ ...draft, trade: v })}
              options={[{ value: 'MECH', label: 'MECH' },
                        { value: 'ELEC', label: 'ELEC' },
                        { value: 'ELME', label: 'Both' }]}
            />
            <Button
              size="small" type="primary"
              disabled={!draft.number.trim() || !draft.text.trim()}
              loading={addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Add
            </Button>
            <Button size="small" onClick={() => { setAdding(false); setDraft({ number: '', text: '' }); }}>
              Cancel
            </Button>
          </Space>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {/* Explains the one rule that will otherwise bite silently. */}
              Use a number SAP does not use — 0900 upwards is safe. Yours is never
              touched by a SAP refresh.
            </Text>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {operations.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary" style={{ fontSize: 12 }}>
                No operations on this order. SAP's arrive with the nightly file;
                you can add your own above.
              </Text>
            }
            style={{ margin: '4px 0' }}
          />
        ) : operations.map((op) => {
          const status = op.status || (op.is_done ? 'completed' : 'pending');
          const media = mediaFor(op.id);
          const isRecording = recordingFor === op.id;
          return (
            <div
              key={op.id}
              style={{ padding: '8px 0', borderTop: '1px solid #f5f5f5' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Text strong style={{ fontSize: 12, width: 44, flexShrink: 0 }}>
                  {op.operation_number}
                </Text>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      textDecoration: status === 'completed' ? 'line-through' : undefined,
                      color: status === 'completed' ? '#8c8c8c' : undefined,
                    }}
                  >
                    {op.content}
                  </Text>
                  <div style={{ marginTop: 2 }}>
                    <Space size={4} wrap>
                      <Tag color={STATUS_COLOR[status]} style={{ margin: 0, fontSize: 10 }}>
                        {status.replace(/_/g, ' ')}
                      </Tag>
                      {op.source === 'manual' && (
                        <Tooltip title="Added by hand — a SAP refresh never touches it">
                          <Tag style={{ margin: 0, fontSize: 10 }}>✎ yours</Tag>
                        </Tooltip>
                      )}
                      {!!op.work_center && (
                        <Tag style={{ margin: 0, fontSize: 10 }}>{op.work_center}</Tag>
                      )}
                      {op.planned_hours != null && (
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          {op.planned_hours.toFixed(1)}h
                        </Text>
                      )}
                      {op.actual_hours != null && (
                        <Text style={{ fontSize: 10, color: '#237804' }}>
                          took {op.actual_hours.toFixed(1)}h
                        </Text>
                      )}
                      {!!op.done_by_name && (
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          · {op.done_by_name}
                        </Text>
                      )}
                    </Space>
                  </div>

                  {!!op.waiting_on_material && (
                    <div style={{ marginTop: 4, padding: '2px 6px', background: '#fffbe6',
                                  borderRadius: 3, display: 'inline-block' }}>
                      <Text style={{ fontSize: 11, color: '#ad6800' }}>
                        ⏳ Waiting for material · PR {op.purchase_requisition}
                        {op.material_text ? ` · ${op.material_text}` : ''}
                      </Text>
                    </div>
                  )}

                  {media.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {media.map((item) => (
                        <div key={item.id} style={{ width: item.attachment_kind === 'photo' ? 80 : 200 }}>
                          {item.attachment_kind === 'photo' ? (
                            <a href={item.attachment_url || undefined} target="_blank" rel="noreferrer">
                              <img
                                src={item.attachment_url || undefined}
                                alt={item.content}
                                style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 3 }}
                              />
                            </a>
                          ) : (
                            // controls only — a plan board must never start playing by itself
                            <audio src={item.attachment_url || undefined} controls preload="none"
                                   style={{ width: '100%', height: 28 }} />
                          )}
                          {canEdit && (
                            <Button type="text" size="small" danger
                                    icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                                    onClick={() => removeMutation.mutate(item.id)} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {canEdit && (
                    <Space size={4} style={{ marginTop: 6 }} wrap>
                      {status !== 'completed' && (
                        <>
                          {status === 'pending' && (
                            <Button size="small" onClick={() => runTimer.mutate({ taskId: op.id, action: 'start' })}>
                              Start
                            </Button>
                          )}
                          {status === 'in_progress' && (
                            <>
                              <Button size="small" onClick={() => runTimer.mutate({ taskId: op.id, action: 'pause' })}>
                                Pause
                              </Button>
                              <Button size="small" type="primary"
                                      onClick={() => runTimer.mutate({ taskId: op.id, action: 'finish' })}>
                                Finish
                              </Button>
                            </>
                          )}
                          {status === 'paused' && (
                            <>
                              <Button size="small" onClick={() => runTimer.mutate({ taskId: op.id, action: 'resume' })}>
                                Resume
                              </Button>
                              <Button size="small" type="primary"
                                      onClick={() => runTimer.mutate({ taskId: op.id, action: 'finish' })}>
                                Finish
                              </Button>
                            </>
                          )}
                        </>
                      )}
                      <Button size="small" icon={<CameraOutlined />} loading={busyOn === op.id && !isRecording}
                              onClick={() => openCamera((file) => attach(op.id, file, 'photo'))} />
                      <Button size="small" icon={<PictureOutlined />}
                              onClick={() => openGallery((file) => attach(op.id, file, 'photo'))} />
                      <Button size="small" danger={isRecording}
                              icon={isRecording ? <AudioMutedOutlined /> : <AudioOutlined />}
                              onClick={() => toggleRecording(op.id)} />
                      {op.source === 'manual' && (
                        <Popconfirm title="Remove this operation?"
                                    description="Its photos and voice notes go with it."
                                    okText="Remove" okButtonProps={{ danger: true }}
                                    onConfirm={() => removeMutation.mutate(op.id)}>
                          <Button type="text" size="small" danger
                                  icon={<DeleteOutlined style={{ fontSize: 11 }} />} />
                        </Popconfirm>
                      )}
                    </Space>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default JobOperations;
