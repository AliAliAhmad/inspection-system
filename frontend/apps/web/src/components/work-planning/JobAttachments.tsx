import React, { useRef, useState } from 'react';
import { Card, Button, Typography, Empty, Spin, Popconfirm, message } from 'antd';
import { CameraOutlined, AudioOutlined, AudioMutedOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobSubTasksApi, filesApi, type JobSubTask } from '@inspection/shared';

const { Text } = Typography;

/**
 * Photos and voice notes on a job, inside the Job Details window.
 *
 * Ali, 2026-09-09: "i need to be able to add them in the job details when i
 * press on the job and the job details popup come, also the pic and voice they
 * should be stick with the job, if drag drop or anywhere."
 *
 * A defect raised by an inspection arrives carrying the inspector's photo and
 * voice note. A SAP order arrives as one line of text, and a hand-typed job as
 * whatever fitted in the box — so the crew reaches the machine knowing least
 * about the jobs that were placed by hand.
 *
 * STICKING IS NOT A FEATURE HERE, IT IS THE STORAGE CHOICE
 *
 * These do not belong to the job's row in the week. They hang on the job's
 * durable identity — its SAP order number — which is what
 * app/models/work_plan_job_task.py exists to do. So dragging the job to another
 * day keeps them (same row), sending it back to the pool keeps them (the row is
 * DELETED and they are not on it), and pulling the same order out again next
 * month brings them back. There is nothing to remember to carry: they were
 * never attached to the week in the first place.
 */

interface JobAttachmentsProps {
  jobId: number;
  planId?: number;
  /** Engineers and admins manage these; the assigned crew may add evidence. */
  canEdit?: boolean;
}

export const JobAttachments: React.FC<JobAttachmentsProps> = ({ jobId, planId, canEdit = true }) => {
  const queryClient = useQueryClient();
  const queryKey = ['job-sub-tasks', jobId];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await jobSubTasksApi.list(jobId)).data,
    enabled: !!jobId,
  });

  // The same list holds the planner's written sub-tasks; this panel shows only
  // the lines that carry a photo or a recording.
  const media: JobSubTask[] = (data?.tasks ?? []).filter((t) => t.attachment_kind);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    if (planId) queryClient.invalidateQueries({ queryKey: ['plan-job-sub-tasks', planId] });
  };

  const removeMutation = useMutation({
    mutationFn: (taskId: number) => jobSubTasksApi.remove(jobId, taskId),
    onSuccess: refresh,
    onError: (err: any) => message.error(err?.response?.data?.message || 'Could not remove it'),
  });

  const attach = async (file: File, kind: 'photo' | 'voice') => {
    setBusy(true);
    try {
      // Uploaded first, then named to the job. The server checks that the file
      // is one THIS user uploaded before it will publish it onto a job a whole
      // crew can read — an id off the wire is a request, not a fact.
      const uploaded = await filesApi.upload(file, 'work_plan_job', jobId, 'work_plan');
      const fileId = (uploaded.data as any)?.data?.id;
      if (!fileId) throw new Error('upload returned no file');
      await jobSubTasksApi.add(jobId, '', { fileId, kind });
      refresh();
      message.success(kind === 'photo' ? 'Photo added to the job' : 'Voice note added to the job');
    } catch (err: any) {
      message.error(err?.response?.data?.message || `Could not add the ${kind}`);
    } finally {
      setBusy(false);
    }
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';                        // so the same file can be picked twice
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

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text type="secondary">Photos &amp; Voice Notes</Text>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
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
              loading={busy && !recording}
            >
              Add Photo
            </Button>
            <Button
              size="small"
              danger={recording}
              icon={recording ? <AudioMutedOutlined /> : <AudioOutlined />}
              onClick={toggleRecording}
            >
              {recording ? 'Stop Recording' : 'Record Voice'}
            </Button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
        ) : media.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Nothing yet. A photo or a spoken note here stays with the job —
                move it to another day or send it back to the pool and it comes back with it.
              </Text>
            }
            style={{ margin: '4px 0' }}
          />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {media.map((item) => (
              <div
                key={item.id}
                style={{
                  border: '1px solid #f0f0f0', borderRadius: 6, padding: 8,
                  width: item.attachment_kind === 'photo' ? 150 : 240,
                }}
              >
                {item.attachment_kind === 'photo' ? (
                  <a href={item.attachment_url || undefined} target="_blank" rel="noreferrer">
                    <img
                      src={item.attachment_url || undefined}
                      alt={item.content}
                      style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 4 }}
                    />
                  </a>
                ) : (
                  // controls only — a plan board must never start playing by itself
                  <audio src={item.attachment_url || undefined} controls preload="none"
                         style={{ width: '100%', height: 32 }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {item.created_by_name || ''}
                  </Text>
                  {canEdit && (
                    <Popconfirm
                      title="Remove this?"
                      okText="Remove"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => removeMutation.mutate(item.id)}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} />
                    </Popconfirm>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default JobAttachments;
