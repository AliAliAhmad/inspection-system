import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Typography,
  Progress,
  Button,
  Radio,
  InputNumber,
  Upload,
  Tag,
  Space,
  Spin,
  Alert,
  List,
  Badge,
  Image,
  message,
  Popconfirm,
  Descriptions,
} from 'antd';
import {
  CameraOutlined,
  PictureOutlined,
  DeleteOutlined,
  StarFilled,
  CheckCircleOutlined,
  ArrowLeftOutlined,
  SendOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  inspectionsApi,
  Inspection,
  InspectionAnswer,
  ChecklistItem,
  InspectionProgress,
} from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function InspectionChecklistPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const assignmentId = Number(id);
  const isArabic = i18n.language === 'ar';

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const {
    data: inspection,
    isLoading,
    error,
    refetch: refetchInspection,
  } = useQuery({
    queryKey: ['inspection', 'by-assignment', assignmentId],
    queryFn: () =>
      inspectionsApi.getByAssignment(assignmentId).then((r) => (r.data as any).data as Inspection),
  });

  const inspectionId = inspection?.id;

  const { data: progress, refetch: refetchProgress } = useQuery({
    queryKey: ['inspection-progress', inspectionId],
    queryFn: () =>
      inspectionsApi
        .getProgress(inspectionId!)
        .then((r) => {
          const raw = (r.data as any).data ?? (r.data as any).progress;
          return {
            total_items: raw.total_items,
            answered_items: raw.answered_items,
            percentage: raw.percentage ?? raw.progress_percentage ?? 0,
          } as InspectionProgress;
        }),
    enabled: !!inspectionId,
  });

  const answerMutation = useMutation({
    mutationFn: (payload: {
      checklist_item_id: number;
      answer_value: string;
      comment?: string;
      voice_note_id?: number;
    }) => inspectionsApi.answerQuestion(inspectionId!, payload),
    onSuccess: () => {
      refetchProgress();
      refetchInspection();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || err?.response?.data?.error || t('common.error'));
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => inspectionsApi.submit(inspectionId!),
    onSuccess: () => {
      message.success(t('inspection.submit'));
      navigate('/inspector/assignments');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || err?.response?.data?.error || t('common.error'));
    },
  });

  const handleAnswer = useCallback(
    (checklistItemId: number, value: string, comment?: string, voiceNoteId?: number) => {
      answerMutation.mutate({
        checklist_item_id: checklistItemId,
        answer_value: value,
        comment,
        voice_note_id: voiceNoteId,
      });
    },
    [answerMutation],
  );

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={t('common.error')} showIcon />;
  }

  if (!inspection) {
    return <Alert type="warning" message={t('common.noData')} showIcon />;
  }

  const answers = inspection.answers ?? [];
  const answeredMap = new Map<number, InspectionAnswer>();
  answers.forEach((a) => answeredMap.set(a.checklist_item_id, a));

  const rawChecklistItems: ChecklistItem[] = (inspection as any).checklist_items ?? [];
  const itemsFromAnswers: ChecklistItem[] = answers
    .filter((a) => a.checklist_item !== null)
    .map((a) => a.checklist_item as ChecklistItem);

  const allItems = [...rawChecklistItems, ...itemsFromAnswers];
  const uniqueItems = Array.from(
    new Map(allItems.map((item) => [item.id, item])).values(),
  ).sort((a, b) => a.order_index - b.order_index);

  const canSubmit =
    progress &&
    progress.answered_items >= progress.total_items &&
    inspection.status === 'draft';

  const getQuestionText = (item: ChecklistItem) => {
    if (isArabic && item.question_text_ar) {
      return item.question_text_ar;
    }
    return item.question_text;
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/inspector/assignments')}
        >
          {t('common.back')}
        </Button>
      </Space>

      <Typography.Title level={4}>{t('inspection.checklist')}</Typography.Title>

      {inspection.equipment && (
        <Card style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label={t('equipment.name')}>
              {inspection.equipment.name}
            </Descriptions.Item>
            <Descriptions.Item label={t('equipment.type')}>
              {inspection.equipment.equipment_type}
            </Descriptions.Item>
            <Descriptions.Item label={t('equipment.location')}>
              {inspection.equipment.location ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('equipment.berth')}>
              {inspection.equipment.berth ?? '-'}
            </Descriptions.Item>
            {inspection.inspection_code && (
              <Descriptions.Item label={t('inspection.code', 'Inspection Code')}>
                <Tag color="blue">{inspection.inspection_code}</Tag>
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('common.status')}>
              <Tag color={inspection.status === 'draft' ? 'blue' : 'green'}>
                {t(`status.${inspection.status}`, inspection.status)}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {progress && (
        <Card style={{ marginBottom: 16 }}>
          <Typography.Text strong>{t('inspection.progress')}</Typography.Text>
          <Progress
            percent={Math.round(progress.percentage)}
            status={progress.percentage >= 100 ? 'success' : 'active'}
            format={() =>
              `${progress.answered_items} / ${progress.total_items}`
            }
          />
        </Card>
      )}

      <List
        dataSource={uniqueItems}
        locale={{ emptyText: t('common.noData') }}
        renderItem={(item) => {
          const existingAnswer = answeredMap.get(item.id);
          return (
            <ChecklistItemCard
              key={item.id}
              item={item}
              existingAnswer={existingAnswer}
              getQuestionText={getQuestionText}
              onAnswer={handleAnswer}
              inspectionId={inspectionId!}
              refetchInspection={refetchInspection}
              isSubmitted={inspection.status !== 'draft'}
            />
          );
        }}
      />

      {inspection.status === 'draft' && (
        <Card style={{ marginTop: 16, textAlign: 'center' }}>
          <Popconfirm
            title={t('common.confirm')}
            onConfirm={() => submitMutation.mutate()}
            okText={t('common.submit')}
            cancelText={t('common.cancel')}
          >
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              loading={submitMutation.isPending}
              disabled={!canSubmit}
            >
              {t('inspection.submit')}
            </Button>
          </Popconfirm>
          {!canSubmit && progress && progress.total_items > 0 && (
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginTop: 8 }}
            >
              {t('inspection.progress')}: {progress.answered_items} /{' '}
              {progress.total_items}
            </Typography.Text>
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Checklist Item Sub-Component                                       */
/* ------------------------------------------------------------------ */

interface ChecklistItemCardProps {
  item: ChecklistItem;
  existingAnswer?: InspectionAnswer;
  getQuestionText: (item: ChecklistItem) => string;
  onAnswer: (id: number, value: string, comment?: string, voiceNoteId?: number) => void;
  inspectionId: number;
  refetchInspection: () => void;
  isSubmitted: boolean;
}

function openFileInput(accept: string, capture: boolean, onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  if (capture) input.capture = 'environment';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

function ChecklistItemCard({
  item,
  existingAnswer,
  getQuestionText,
  onAnswer,
  inspectionId,
  refetchInspection,
  isSubmitted,
}: ChecklistItemCardProps) {
  const { t, i18n } = useTranslation();
  const [voiceNoteId, setVoiceNoteId] = useState<number | undefined>(
    existingAnswer?.voice_note_id ?? undefined,
  );
  const [currentValue, setCurrentValue] = useState(existingAnswer?.answer_value ?? '');
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);

  const isFailed = currentValue === 'fail' || currentValue === 'no';
  const hasExistingVoice = !!(existingAnswer?.voice_note_id || voiceNoteId);
  const [showComment, setShowComment] = useState(isFailed || hasExistingVoice || !!existingAnswer?.comment);

  useEffect(() => {
    if (isFailed) setShowComment(true);
  }, [isFailed]);

  // Sync voiceNoteId with existingAnswer updates
  useEffect(() => {
    if (existingAnswer?.voice_note_id) {
      setVoiceNoteId(existingAnswer.voice_note_id);
    }
  }, [existingAnswer?.voice_note_id]);

  const token = localStorage.getItem('access_token') || '';

  // Single voice player: use local blob if just recorded, else server stream
  const voiceStreamUrl = localBlobUrl
    ? null
    : (existingAnswer?.voice_note_id
      ? `${API_BASE}/api/files/${existingAnswer.voice_note_id}/stream?token=${token}`
      : null);

  const audioSrc = localBlobUrl || voiceStreamUrl;

  // Photo preview
  const photoStreamUrl = existingAnswer?.photo_file
    ? `${API_BASE}/api/files/${existingAnswer.photo_file.id}/stream?token=${token}`
    : null;

  // Video preview
  const videoStreamUrl = existingAnswer?.video_file
    ? `${API_BASE}/api/files/${existingAnswer.video_file.id}/stream?token=${token}`
    : null;

  const handleAnswerChange = (value: string) => {
    setCurrentValue(value);
    onAnswer(item.id, value, undefined, voiceNoteId);
  };

  // Upload media mutation (auto-detects photo vs video on backend)
  const uploadMediaMutation = useMutation({
    mutationFn: (file: File) => inspectionsApi.uploadMedia(inspectionId, item.id, file),
    onSuccess: () => {
      message.success(t('inspection.mediaUploaded', 'Media uploaded'));
      refetchInspection();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || t('common.error'));
    },
  });

  // Delete mutations
  const deleteVoiceMutation = useMutation({
    mutationFn: () => inspectionsApi.deleteVoice(inspectionId, item.id),
    onSuccess: () => {
      setVoiceNoteId(undefined);
      setLocalBlobUrl(null);
      message.success(t('inspection.voiceDeleted', 'Voice note deleted'));
      refetchInspection();
    },
    onError: () => message.error(t('common.error')),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: () => inspectionsApi.deletePhoto(inspectionId, item.id),
    onSuccess: () => {
      message.success(t('inspection.photoDeleted', 'Photo deleted'));
      refetchInspection();
    },
    onError: () => message.error(t('common.error')),
  });

  const deleteVideoMutation = useMutation({
    mutationFn: () => inspectionsApi.deleteVideo(inspectionId, item.id),
    onSuccess: () => {
      message.success(t('inspection.videoDeleted', 'Video deleted'));
      refetchInspection();
    },
    onError: () => message.error(t('common.error')),
  });

  const renderAnswerInput = () => {
    const disabled = isSubmitted;

    switch (item.answer_type) {
      case 'yes_no':
        return (
          <Radio.Group
            value={currentValue || undefined}
            onChange={(e) => handleAnswerChange(e.target.value)}
            disabled={disabled}
          >
            <Radio.Button value="yes">Yes</Radio.Button>
            <Radio.Button value="no">No</Radio.Button>
          </Radio.Group>
        );
      case 'pass_fail':
        return (
          <Radio.Group
            value={currentValue || undefined}
            onChange={(e) => handleAnswerChange(e.target.value)}
            disabled={disabled}
          >
            <Radio.Button value="pass">Pass</Radio.Button>
            <Radio.Button value="fail">Fail</Radio.Button>
          </Radio.Group>
        );
      case 'text':
        return (
          <VoiceTextArea
            defaultValue={currentValue}
            rows={2}
            placeholder={t('inspection.answer', 'Enter answer')}
            disabled={disabled}
            language={i18n.language}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== (existingAnswer?.answer_value ?? '')) {
                onAnswer(item.id, e.target.value, undefined, voiceNoteId);
              }
            }}
          />
        );
      case 'numeric':
        return (
          <InputNumber
            defaultValue={currentValue ? Number(currentValue) : undefined}
            placeholder={t('inspection.answer', 'Enter value')}
            disabled={disabled}
            onBlur={(e) => {
              const val = e.target.value;
              if (val && val !== currentValue) {
                onAnswer(item.id, val, undefined, voiceNoteId);
              }
            }}
            style={{ width: 200 }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card
      style={{ marginBottom: 12 }}
      size="small"
      title={
        <Space wrap>
          <Typography.Text strong>{getQuestionText(item)}</Typography.Text>
          {item.category && (
            <Tag color={item.category === 'mechanical' ? 'blue' : 'gold'}>
              {item.category}
            </Tag>
          )}
          {item.critical_failure && (
            <Badge
              count={
                <StarFilled style={{ color: '#f5222d', fontSize: 14 }} />
              }
            />
          )}
          {existingAnswer && (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          )}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {renderAnswerInput()}

        {/* Action buttons: comment toggle + photo/video upload */}
        <Space wrap>
          {!showComment && !isSubmitted && (
            <Button size="small" type="link" onClick={() => setShowComment(true)}>
              {t('inspection.comment', 'Comment')}
            </Button>
          )}

          {!isSubmitted && (
            <>
              <Button
                size="small"
                type="link"
                icon={<CameraOutlined />}
                loading={uploadMediaMutation.isPending}
                onClick={() => openFileInput('image/*,video/*', true, (file) => uploadMediaMutation.mutate(file))}
              >
                {t('inspection.camera', 'Camera')}
              </Button>
              <Upload
                accept="image/*,video/*"
                showUploadList={false}
                beforeUpload={(file) => { uploadMediaMutation.mutate(file); return false; }}
              >
                <Button size="small" type="link" icon={<PictureOutlined />} loading={uploadMediaMutation.isPending}>
                  {t('inspection.gallery', 'Gallery')}
                </Button>
              </Upload>
            </>
          )}
        </Space>

        {/* Photo preview */}
        {photoStreamUrl && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <Image
              src={photoStreamUrl}
              alt="Inspection photo"
              style={{ maxWidth: 200, maxHeight: 150, objectFit: 'contain', borderRadius: 4 }}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPk4kCKjgAAAABJRU5ErkJggg=="
            />
            {!isSubmitted && (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={deletePhotoMutation.isPending}
                onClick={() => deletePhotoMutation.mutate()}
                style={{ position: 'absolute', top: 0, right: 0 }}
              />
            )}
          </div>
        )}

        {/* Video preview */}
        {videoStreamUrl && (
          <div style={{ position: 'relative' }}>
            <video
              controls
              src={videoStreamUrl}
              style={{ maxWidth: 300, maxHeight: 200, borderRadius: 4 }}
              preload="metadata"
            />
            {!isSubmitted && (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={deleteVideoMutation.isPending}
                onClick={() => deleteVideoMutation.mutate()}
                style={{ position: 'absolute', top: 0, right: 0 }}
              />
            )}
          </div>
        )}

        {/* Voice recording area — always visible on fail/no */}
        {showComment && (
          <div>
            {!isSubmitted && (
              <VoiceTextArea
                value={existingAnswer?.comment ?? ''}
                rows={2}
                placeholder={
                  isFailed
                    ? t('inspection.fail_comment', 'Record a voice note for failed items...')
                    : t('inspection.comment', 'Record a voice note...')
                }
                disabled={true}
                language={i18n.language}
                onVoiceRecorded={(audioFileId) => {
                  setVoiceNoteId(audioFileId);
                  if (currentValue) {
                    onAnswer(item.id, currentValue, undefined, audioFileId);
                  }
                }}
                onTranscribed={(en, ar) => {
                  const parts: string[] = [];
                  if (en) parts.push(`EN: ${en}`);
                  if (ar) parts.push(`AR: ${ar}`);
                  const combined = parts.join('\n');
                  if (currentValue) {
                    onAnswer(item.id, currentValue, combined, voiceNoteId);
                  }
                }}
                onLocalBlobUrl={(url) => setLocalBlobUrl(url)}
              />
            )}

            {/* Single audio player — blob or server stream */}
            {audioSrc && !isSubmitted && (
              <div
                style={{
                  marginTop: 6,
                  padding: '6px 10px',
                  background: '#f0f5ff',
                  borderRadius: 4,
                  border: '1px solid #d6e4ff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <SoundOutlined style={{ color: '#1677ff', fontSize: 14 }} />
                <audio controls src={audioSrc} style={{ height: 32, flex: 1 }} preload="auto" />
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={deleteVoiceMutation.isPending}
                  onClick={() => deleteVoiceMutation.mutate()}
                />
              </div>
            )}

            {/* Read-only: show existing comment text */}
            {existingAnswer?.comment && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: '#f9f9f9', borderRadius: 4, border: '1px solid #e8e8e8', fontSize: 12 }}>
                <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{existingAnswer.comment}</Typography.Text>
              </div>
            )}

            {/* Validation warning */}
            {isFailed && !hasExistingVoice && !isSubmitted && (
              <Typography.Text type="warning" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                {t('inspection.fail_requires_voice', 'Voice recording is required for failed items')}
              </Typography.Text>
            )}
            {isFailed && !existingAnswer?.photo_path && !existingAnswer?.video_path && !isSubmitted && (
              <Typography.Text type="warning" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                {t('inspection.fail_requires_media', 'Photo or video is required for failed items')}
              </Typography.Text>
            )}
          </div>
        )}
      </Space>
    </Card>
  );
}
