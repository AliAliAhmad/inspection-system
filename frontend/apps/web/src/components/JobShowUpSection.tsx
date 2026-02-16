/**
 * JobShowUpSection — Show Up Photo + Challenge Voice Notes + Star/Point Review Marks
 * Used in Specialist and Engineer job detail pages.
 *
 * - Specialist/Engineer: can upload show-up photo + record challenge voice
 * - Admin/Engineer/Specialist Lead: can mark star (show up) or point (challenge)
 * - Everyone: can view all data
 */
import { useState, useRef, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Image,
  Tag,
  Empty,
  Upload,
  Input,
  Tooltip,
  Popconfirm,
  message,
  Divider,
} from 'antd';
import {
  CameraOutlined,
  PictureOutlined,
  AudioOutlined,
  StarOutlined,
  StarFilled,
  WarningOutlined,
  DeleteOutlined,
  SoundOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  UserOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { jobShowUpApi, ShowUpSummary } from '@inspection/shared';
import { useAuth } from '../providers/AuthProvider';

interface Props {
  jobType: 'specialist' | 'engineer';
  jobId: number;
  jobOwnerId: number; // specialist_id or engineer_id
  jobStatus: string;
}

export default function JobShowUpSection({ jobType, jobId, jobOwnerId, jobStatus }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [markNote, setMarkNote] = useState('');
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isOwner = user?.id === jobOwnerId;
  const isAdmin = user?.role === 'admin';
  const isEngineer = user?.role === 'engineer';
  const isSpecialistLead = user?.role === 'specialist' && (
    (user as any)?.minor_role === 'specialist_lead' ||
    (user as any)?.minor_role === 'lead' ||
    (user as any)?.is_lead
  );
  const canMark = isAdmin || isEngineer || isSpecialistLead;
  const canUpload = isOwner || isAdmin;
  const jobActive = ['assigned', 'in_progress', 'paused'].includes(jobStatus);

  // Query
  const summaryQuery = useQuery({
    queryKey: ['job-showup', jobType, jobId],
    queryFn: () => jobShowUpApi.getShowUpSummary(jobType, jobId),
    select: (res) => (res.data?.data ?? res.data) as ShowUpSummary,
    enabled: !!jobId,
  });

  const summary = summaryQuery.data;

  // Mutations
  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => jobShowUpApi.uploadShowUpPhoto(jobType, jobId, file),
    onSuccess: () => {
      message.success('Show-up photo uploaded');
      queryClient.invalidateQueries({ queryKey: ['job-showup', jobType, jobId] });
    },
    onError: () => message.error('Failed to upload photo'),
  });

  const uploadVoiceMutation = useMutation({
    mutationFn: (file: File) => jobShowUpApi.uploadChallengeVoice(jobType, jobId, file),
    onSuccess: () => {
      message.success('Challenge voice uploaded');
      queryClient.invalidateQueries({ queryKey: ['job-showup', jobType, jobId] });
    },
    onError: () => message.error('Failed to upload voice'),
  });

  const addMarkMutation = useMutation({
    mutationFn: (markType: 'star' | 'point') =>
      jobShowUpApi.addReviewMark(jobType, jobId, markType, markNote.trim() || undefined),
    onSuccess: (_, markType) => {
      message.success(markType === 'star' ? 'Marked as Show Up' : 'Marked as Challenge');
      setMarkNote('');
      queryClient.invalidateQueries({ queryKey: ['job-showup', jobType, jobId] });
    },
    onError: () => message.error('Failed to add mark'),
  });

  const removeMarkMutation = useMutation({
    mutationFn: (markId: number) => jobShowUpApi.removeReviewMark(jobType, jobId, markId),
    onSuccess: () => {
      message.success('Mark removed');
      queryClient.invalidateQueries({ queryKey: ['job-showup', jobType, jobId] });
    },
    onError: () => message.error('Failed to remove mark'),
  });

  // Handlers
  const handleCameraCapture = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) uploadPhotoMutation.mutate(file);
    };
    input.click();
  }, [uploadPhotoMutation]);

  const handleVoiceCapture = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) uploadVoiceMutation.mutate(file);
    };
    input.click();
  }, [uploadVoiceMutation]);

  const handlePlayAudio = useCallback((audioUrl: string, voiceId: number) => {
    if (playingAudioId === voiceId) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(audioUrl);
    audio.onended = () => setPlayingAudioId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingAudioId(voiceId);
  }, [playingAudioId]);

  if (summaryQuery.isLoading) return null;

  return (
    <Card
      title={
        <Space>
          <CameraOutlined />
          <span>Show Up & Challenges</span>
          {summary?.review_marks.star_count ? (
            <Tag color="gold" icon={<StarFilled />}>{summary.review_marks.star_count}</Tag>
          ) : null}
          {summary?.review_marks.point_count ? (
            <Tag color="red" icon={<WarningOutlined />}>{summary.review_marks.point_count}</Tag>
          ) : null}
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {/* ========== SHOW-UP PHOTOS ========== */}
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        <CameraOutlined /> Show Up Photo
      </Typography.Title>

      {summary?.showup_photos && summary.showup_photos.length > 0 ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {summary.showup_photos.map((photo) => (
            <div key={photo.id} style={{ textAlign: 'center' }}>
              <Image
                src={photo.file?.file_path}
                alt="Show-up photo"
                width={160}
                height={120}
                style={{ objectFit: 'cover', borderRadius: 8 }}
                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg=="
              />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                <UserOutlined /> {photo.uploader_name}
                <br />
                <ClockCircleOutlined /> {new Date(photo.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty description="No show-up photo yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      {canUpload && (
        <Space style={{ marginBottom: 16 }}>
          <Button
            icon={<CameraOutlined />}
            onClick={handleCameraCapture}
            loading={uploadPhotoMutation.isPending}
          >
            Take Photo
          </Button>
          <Upload
            beforeUpload={(file) => {
              uploadPhotoMutation.mutate(file as File);
              return false;
            }}
            maxCount={1}
            accept="image/*"
            showUploadList={false}
          >
            <Button
              icon={<PictureOutlined />}
              loading={uploadPhotoMutation.isPending}
            >
              From Gallery
            </Button>
          </Upload>
        </Space>
      )}

      <Divider />

      {/* ========== CHALLENGE VOICES ========== */}
      <Typography.Title level={5}>
        <AudioOutlined /> Challenges
      </Typography.Title>

      {summary?.challenge_voices && summary.challenge_voices.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          {summary.challenge_voices.map((voice, index) => (
            <Card
              key={voice.id}
              size="small"
              style={{ background: '#fafafa' }}
            >
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space>
                  <Typography.Text strong>Challenge {index + 1}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined /> {new Date(voice.created_at).toLocaleString()}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <UserOutlined /> {voice.recorder_name}
                  </Typography.Text>
                  {voice.duration_seconds && (
                    <Tag>{Math.floor(voice.duration_seconds / 60)}:{String(voice.duration_seconds % 60).padStart(2, '0')}</Tag>
                  )}
                </Space>

                {voice.file?.file_path && (
                  <Button
                    type="text"
                    icon={playingAudioId === voice.id ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    onClick={() => handlePlayAudio(voice.file!.file_path, voice.id)}
                    style={{ color: '#1677ff' }}
                  >
                    {playingAudioId === voice.id ? 'Pause' : 'Play Audio'}
                  </Button>
                )}

                {voice.transcription_en && (
                  <div style={{ padding: '4px 8px', background: '#f0f5ff', borderRadius: 4, borderLeft: '3px solid #1677ff' }}>
                    <Typography.Text style={{ fontSize: 12, color: '#888' }}>EN:</Typography.Text>{' '}
                    <Typography.Text>{voice.transcription_en}</Typography.Text>
                  </div>
                )}
                {voice.transcription_ar && (
                  <div style={{ padding: '4px 8px', background: '#fff7e6', borderRadius: 4, borderLeft: '3px solid #fa8c16', direction: 'rtl' }}>
                    <Typography.Text style={{ fontSize: 12, color: '#888' }}>AR:</Typography.Text>{' '}
                    <Typography.Text>{voice.transcription_ar}</Typography.Text>
                  </div>
                )}
              </Space>
            </Card>
          ))}
        </div>
      ) : (
        <Empty description="No challenges recorded" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      {canUpload && (
        <Space style={{ marginBottom: 16 }}>
          <Button
            icon={<SoundOutlined />}
            onClick={handleVoiceCapture}
            loading={uploadVoiceMutation.isPending}
          >
            Record Challenge Voice
          </Button>
          <Upload
            beforeUpload={(file) => {
              uploadVoiceMutation.mutate(file as File);
              return false;
            }}
            maxCount={1}
            accept="audio/*"
            showUploadList={false}
          >
            <Button
              icon={<AudioOutlined />}
              loading={uploadVoiceMutation.isPending}
            >
              Upload Audio
            </Button>
          </Upload>
        </Space>
      )}

      <Divider />

      {/* ========== REVIEW MARKS (STAR / POINT) ========== */}
      <Typography.Title level={5}>
        <StarOutlined /> Review Marks
      </Typography.Title>

      {/* Existing marks */}
      {summary?.review_marks && (summary.review_marks.stars.length > 0 || summary.review_marks.points.length > 0) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {summary.review_marks.stars.map((mark) => (
            <div key={mark.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color="gold" icon={<StarFilled />}>Show Up</Tag>
              <Typography.Text type="secondary">{mark.marker_name}</Typography.Text>
              {mark.note && <Typography.Text>— {mark.note}</Typography.Text>}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(mark.created_at).toLocaleString()}
              </Typography.Text>
              {(isAdmin || isEngineer) && (
                <Popconfirm
                  title="Remove this mark?"
                  onConfirm={() => removeMarkMutation.mutate(mark.id)}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </div>
          ))}
          {summary.review_marks.points.map((mark) => (
            <div key={mark.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color="red" icon={<WarningOutlined />}>Challenge</Tag>
              <Typography.Text type="secondary">{mark.marker_name}</Typography.Text>
              {mark.note && <Typography.Text>— {mark.note}</Typography.Text>}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(mark.created_at).toLocaleString()}
              </Typography.Text>
              {(isAdmin || isEngineer) && (
                <Popconfirm
                  title="Remove this mark?"
                  onConfirm={() => removeMarkMutation.mutate(mark.id)}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty description="No review marks yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      {/* Add mark buttons — admin, engineer, specialist lead only */}
      {canMark && (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Input
            placeholder="Optional note for the mark..."
            value={markNote}
            onChange={(e) => setMarkNote(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          <Space>
            <Tooltip title="Mark as Show Up (good work to showcase)">
              <Button
                icon={<StarFilled style={{ color: '#faad14' }} />}
                onClick={() => addMarkMutation.mutate('star')}
                loading={addMarkMutation.isPending}
              >
                Star — Show Up
              </Button>
            </Tooltip>
            <Tooltip title="Mark as Challenge (issue to discuss)">
              <Button
                icon={<WarningOutlined style={{ color: '#f5222d' }} />}
                onClick={() => addMarkMutation.mutate('point')}
                loading={addMarkMutation.isPending}
                danger
              >
                Point — Challenge
              </Button>
            </Tooltip>
          </Space>
        </Space>
      )}
    </Card>
  );
}
