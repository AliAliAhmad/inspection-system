import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  AudioOutlined,
  SoundOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  inspectionsApi,
  voiceApi,
  aiApi,
  Inspection,
  InspectionAnswer,
  ChecklistItem,
  InspectionProgress,
} from '@inspection/shared';

/**
 * Convert Cloudinary audio URL to MP3 format for better iOS compatibility
 */
function getAudioMp3Url(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_mp3/');
}

/**
 * Generate waveform image URL from Cloudinary audio URL
 */
function getWaveformUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return '';
  return url
    .replace('/upload/', '/upload/fl_waveform,co_rgb:25D366,b_rgb:DCF8C6,w_200,h_32/')
    .replace(/\.[^.]+$/, '.png');
}

/**
 * Optimize Cloudinary video URL with auto-format and auto-quality
 * - f_auto: Picks best format for viewer's browser (MP4, WebM, etc.)
 * - q_auto: Automatic quality optimization (reduces file size 40-60%)
 */
function getOptimizedVideoUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}

/**
 * Generate video thumbnail/poster image from Cloudinary video URL
 * Extracts frame at 1 second as a JPG thumbnail
 */
function getVideoThumbnailUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return '';
  return url
    .replace('/upload/', '/upload/so_1,w_310,h_220,c_fill,q_auto/')
    .replace(/\.[^.]+$/, '.jpg');
}

/**
 * Optimize Cloudinary image URL with auto-format, auto-quality, and enhancement
 * - f_auto: Best format for browser (WebP, AVIF, JPEG)
 * - q_auto: Smart compression (30-50% smaller)
 * - e_improve: Auto-enhance colors/contrast for poorly lit photos
 */
function getOptimizedPhotoUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,e_improve/');
}

/**
 * Generate photo thumbnail for WhatsApp-style bubbles
 * - Optimized size for quick loading
 * - c_fill with g_auto for smart cropping
 */
function getPhotoThumbnailUrl(url: string, width = 240, height = 180): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},h_${height},c_fill,g_auto/`);
}

// Simple Voice Player using native <audio> element — most reliable cross-browser
function VoicePlayer({ url, onDelete, isDeleting }: { url: string; onDelete?: () => void; isDeleting?: boolean }) {
  if (!url) {
    return null;
  }

  return (
    <div style={{
      background: '#DCF8C6',
      borderRadius: 8,
      padding: '8px 12px',
      maxWidth: 320,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <audio controls preload="metadata" style={{ flex: 1, height: 36 }}>
          <source src={url} />
        </audio>
        {onDelete && (
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={onDelete}
            loading={isDeleting}
          />
        )}
      </div>
    </div>
  );
}

// Keep this for backward compat reference but unused

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
    const errorMessage =
      (error as any)?.response?.data?.message ||
      (error as any)?.response?.data?.error ||
      (error as any)?.message ||
      t('common.error');
    return (
      <Alert
        type="error"
        message={t('common.error')}
        description={errorMessage}
        showIcon
        action={
          <Button size="small" onClick={() => navigate('/inspector/assignments')}>
            {t('common.back', 'Back')}
          </Button>
        }
      />
    );
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

// Helper to extract analysis from comment
function extractAnalysisFromComment(comment: string | null | undefined): {
  photoAnalysis: { en: string; ar: string } | null;
  videoAnalysis: { en: string; ar: string } | null;
  voiceTranscription: { en: string; ar: string } | null;
  otherComment: string;
} {
  if (!comment) return { photoAnalysis: null, videoAnalysis: null, voiceTranscription: null, otherComment: '' };

  let photoAnalysis: { en: string; ar: string } | null = null;
  let videoAnalysis: { en: string; ar: string } | null = null;
  let voiceTranscription: { en: string; ar: string } | null = null;
  const otherParts: string[] = [];

  const lines = comment.split('\n');
  let currentSection = '';
  let enContent = '';
  let arContent = '';

  for (const line of lines) {
    // Check for AI Analysis sections (photo or video)
    if (line.includes('🔍 AI Analysis (EN)') || line.includes('🔍 Photo Analysis (EN)')) {
      if (currentSection && (enContent || arContent)) {
        if (currentSection === 'photo') photoAnalysis = { en: enContent.trim(), ar: arContent.trim() };
        else if (currentSection === 'video') videoAnalysis = { en: enContent.trim(), ar: arContent.trim() };
        else if (currentSection === 'voice') voiceTranscription = { en: enContent.trim(), ar: arContent.trim() };
      }
      currentSection = 'photo';
      enContent = line + '\n';
      arContent = '';
    } else if (line.includes('🔍 Video Analysis (EN)')) {
      if (currentSection && (enContent || arContent)) {
        if (currentSection === 'photo') photoAnalysis = { en: enContent.trim(), ar: arContent.trim() };
        else if (currentSection === 'video') videoAnalysis = { en: enContent.trim(), ar: arContent.trim() };
        else if (currentSection === 'voice') voiceTranscription = { en: enContent.trim(), ar: arContent.trim() };
      }
      currentSection = 'video';
      enContent = line + '\n';
      arContent = '';
    } else if (line.includes('🔍 تحليل الذكاء الاصطناعي (AR)') || line.includes('🔍 Photo Analysis (AR)') || line.includes('🔍 Video Analysis (AR)')) {
      arContent = line + '\n';
    } else if (line.startsWith('EN:') && !currentSection) {
      // Voice transcription format
      currentSection = 'voice';
      enContent = line.replace('EN:', '').trim();
    } else if (line.startsWith('AR:') && currentSection === 'voice') {
      arContent = line.replace('AR:', '').trim();
    } else if (currentSection) {
      if (arContent) {
        arContent += line + '\n';
      } else {
        enContent += line + '\n';
      }
    } else if (line.trim()) {
      otherParts.push(line);
    }
  }

  // Handle last section
  if (currentSection && (enContent || arContent)) {
    if (currentSection === 'photo') photoAnalysis = { en: enContent.trim(), ar: arContent.trim() };
    else if (currentSection === 'video') videoAnalysis = { en: enContent.trim(), ar: arContent.trim() };
    else if (currentSection === 'voice') voiceTranscription = { en: enContent.trim(), ar: arContent.trim() };
  }

  return { photoAnalysis, videoAnalysis, voiceTranscription, otherComment: otherParts.join('\n') };
}

// Analysis display box component
function AnalysisBox({ title, titleAr, icon, enContent, arContent, color }: {
  title: string;
  titleAr: string;
  icon: React.ReactNode;
  enContent: string;
  arContent: string;
  color: string;
}) {
  return (
    <div style={{
      background: '#f6ffed',
      border: `1px solid ${color}`,
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <Typography.Text strong style={{ color }}>{title}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>/ {titleAr}</Typography.Text>
      </div>
      {enContent && (
        <div style={{ marginBottom: 8 }}>
          <Tag color="blue" style={{ marginBottom: 4 }}>EN</Tag>
          <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, display: 'block' }}>
            {enContent.replace(/^🔍.*\n?/, '').trim()}
          </Typography.Text>
        </div>
      )}
      {arContent && (
        <div style={{ direction: 'rtl', textAlign: 'right' }}>
          <Tag color="green" style={{ marginBottom: 4 }}>AR</Tag>
          <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, display: 'block' }}>
            {arContent.replace(/^🔍.*\n?/, '').trim()}
          </Typography.Text>
        </div>
      )}
    </div>
  );
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
  const voiceNoteIdRef = useRef(voiceNoteId);
  const [currentValue, setCurrentValue] = useState(existingAnswer?.answer_value ?? '');
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  // WhatsApp-style voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);

  // Separate state for each analysis type - use refs to track if we've set from local action
  const [photoAnalysis, setPhotoAnalysis] = useState<{ en: string; ar: string } | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<{ en: string; ar: string } | null>(null);
  const [voiceTranscription, setVoiceTranscription] = useState<{ en: string; ar: string } | null>(null);
  const localAnalysisSetRef = useRef(false); // Track if analysis was set locally (not from server)

  // Extract analysis from existing comment on mount - but don't overwrite local state
  useEffect(() => {
    // Only extract from server if we haven't set analysis locally
    if (existingAnswer?.comment && !localAnalysisSetRef.current) {
      const extracted = extractAnalysisFromComment(existingAnswer.comment);
      if (extracted.photoAnalysis) setPhotoAnalysis(extracted.photoAnalysis);
      if (extracted.videoAnalysis) setVideoAnalysis(extracted.videoAnalysis);
      if (extracted.voiceTranscription) setVoiceTranscription(extracted.voiceTranscription);
    }
  }, [existingAnswer?.comment]);

  // Reset local flag when component unmounts or item changes
  useEffect(() => {
    localAnalysisSetRef.current = false;
  }, [item.id]);

  // Debug: log media data when component mounts or answer changes
  useEffect(() => {
    if (existingAnswer) {
      const pf = existingAnswer.photo_file;
      const vf = existingAnswer.video_file;
      const vn = existingAnswer.voice_note;
      if (pf || vf || vn) {
        console.log(`[Media Debug] Item ${item.id}:`, {
          photo_file: pf ? { id: pf.id, url: pf.url } : null,
          video_file: vf ? { id: vf.id, url: vf.url } : null,
          voice_note: vn ? { id: vn.id, url: vn.url } : null,
          photo_path: existingAnswer.photo_path,
          video_path: existingAnswer.video_path,
          voice_note_id: existingAnswer.voice_note_id,
        });
      }
    }
  }, [existingAnswer, item.id]);

  // Read question aloud using TTS
  const readAloud = async () => {
    if (isReadingAloud) return;
    setIsReadingAloud(true);
    try {
      const questionText = getQuestionText(item);
      const audioBlob = await aiApi.readChecklistItem(questionText, i18n.language);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsReadingAloud(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsReadingAloud(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.play();
    } catch (err) {
      console.warn('TTS failed:', err);
      setIsReadingAloud(false);
    }
  };
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const isFailed = currentValue === 'fail' || currentValue === 'no';
  const hasExistingVoice = !!(existingAnswer?.voice_note_id || voiceNoteId);
  const [showComment, setShowComment] = useState(isFailed || hasExistingVoice || !!existingAnswer?.comment);

  useEffect(() => {
    if (isFailed) setShowComment(true);
  }, [isFailed]);

  useEffect(() => {
    if (existingAnswer?.voice_note_id) {
      setVoiceNoteId(existingAnswer.voice_note_id);
    }
  }, [existingAnswer?.voice_note_id]);

  // Cloudinary URLs - direct access, no token needed
  const voiceUrl = localBlobUrl || existingAnswer?.voice_note?.url || null;
  const photoUrl = localPhotoUrl || existingAnswer?.photo_file?.url || null;
  const videoUrl = localVideoUrl || existingAnswer?.video_file?.url || null;

  // Build combined comment from all analysis sources for persistence
  const buildAnalysisComment = useCallback(() => {
    const parts: string[] = [];
    if (photoAnalysis?.en || photoAnalysis?.ar) {
      if (photoAnalysis.en) parts.push(photoAnalysis.en);
      if (photoAnalysis.ar) parts.push(photoAnalysis.ar);
    }
    if (videoAnalysis?.en || videoAnalysis?.ar) {
      if (videoAnalysis.en) parts.push(videoAnalysis.en);
      if (videoAnalysis.ar) parts.push(videoAnalysis.ar);
    }
    if (voiceTranscription?.en || voiceTranscription?.ar) {
      const voiceParts: string[] = [];
      if (voiceTranscription?.en) voiceParts.push(`EN: ${voiceTranscription.en}`);
      if (voiceTranscription?.ar) voiceParts.push(`AR: ${voiceTranscription.ar}`);
      if (voiceParts.length > 0) parts.push(voiceParts.join('\n'));
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }, [photoAnalysis, videoAnalysis, voiceTranscription]);

  // Auto-save analysis comment when any analysis state changes
  // This runs AFTER React commits the new state, so buildAnalysisComment reads correct values
  useEffect(() => {
    if (!localAnalysisSetRef.current) return;
    const comment = buildAnalysisComment();
    if (comment) {
      const answerValue = currentValue || existingAnswer?.answer_value || '';
      onAnswer(item.id, answerValue, comment, voiceNoteId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildAnalysisComment]);

  const handleAnswerChange = (value: string) => {
    setCurrentValue(value);
    // Include any AI analysis/transcription in the comment for persistence
    const analysisComment = buildAnalysisComment();
    onAnswer(item.id, value, analysisComment, voiceNoteId);
  };

  // WhatsApp-style hold to record
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      message.error(t('inspection.mic_denied', 'Microphone access denied'));
    }
  }, [t]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        const stream = mediaRecorderRef.current!.stream;
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setIsRecording(false);

        if (blob.size < 100) {
          message.warning(t('inspection.recording_too_short', 'Recording too short'));
          resolve();
          return;
        }

        // Create local preview
        const blobUrl = URL.createObjectURL(blob);
        setLocalBlobUrl(blobUrl);

        // Upload and transcribe
        setIsTranscribing(true);
        try {
          const result = await voiceApi.transcribe(blob, undefined, undefined, i18n.language);

          if (result.audio_file?.id) {
            setVoiceNoteId(result.audio_file.id);
            voiceNoteIdRef.current = result.audio_file.id;
            // Save voice_note_id association (answer_value can be empty - backend handles it)
            onAnswer(item.id, currentValue || '', undefined, result.audio_file.id);
          }

          if (!result.transcription_failed && (result.en || result.ar)) {
            // Store transcription in state for display
            setVoiceTranscription({ en: result.en || '', ar: result.ar || '' });
            localAnalysisSetRef.current = true; // Mark that we set this locally
            // Transcription will be auto-saved by the useEffect that watches buildAnalysisComment
          }

          // Delay refetch to allow server to save
          setTimeout(() => refetchInspection(), 1000);
        } catch {
          message.warning(t('inspection.voice_upload_failed', 'Voice upload failed'));
        } finally {
          setIsTranscribing(false);
        }

        resolve();
      };

      mediaRecorderRef.current!.stop();
    });
  }, [currentValue, i18n.language, item.id, onAnswer, refetchInspection, t]);

  // Upload media mutation with AI analysis
  const uploadMediaMutation = useMutation({
    mutationFn: async (file: File) => {
      const blobUrl = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      if (isVideo) {
        setLocalVideoUrl(blobUrl);
      } else {
        setLocalPhotoUrl(blobUrl);
        setPhotoLoadError(false);
      }
      const response = await inspectionsApi.uploadMedia(inspectionId, item.id, file);
      return { response, isVideo };
    },
    onSuccess: async ({ response, isVideo }) => {
      message.success(t('inspection.mediaUploaded', 'Media uploaded'));
      refetchInspection();

      // Get the Cloudinary URL from response
      const data = (response.data as any)?.data;
      const mediaUrl = isVideo
        ? data?.video_file?.url || data?.url
        : data?.photo_file?.url || data?.url;

      if (mediaUrl && mediaUrl.includes('cloudinary.com')) {
        // Auto-analyze with AI
        if (isVideo) {
          setIsAnalyzingVideo(true);
        } else {
          setIsAnalyzing(true);
        }
        try {
          // For videos, use thumbnail URL for analysis
          // Cloudinary video thumbnail: so_auto (auto select best frame), f_jpg (force JPG output)
          let analyzeUrl = mediaUrl;
          if (isVideo) {
            // Extract thumbnail from video - use auto frame selection and explicit format
            analyzeUrl = mediaUrl
              .replace('/upload/', '/upload/so_auto,w_640,h_480,c_fill,f_jpg/')
              .replace(/\.(mp4|mov|webm|avi|mkv)$/i, '.jpg');
            console.log('Video thumbnail URL for analysis:', analyzeUrl);
          }

          // Get analysis in both languages
          const [enResult, arResult] = await Promise.all([
            aiApi.analyzeDefect(analyzeUrl, 'en').catch(err => {
              console.error('EN analysis failed:', err);
              return { data: { data: { success: false } } };
            }),
            aiApi.analyzeDefect(analyzeUrl, 'ar').catch(err => {
              console.error('AR analysis failed:', err);
              return { data: { data: { success: false } } };
            }),
          ]);

          const enData = (enResult.data as any)?.data;
          const arData = (arResult.data as any)?.data;

          if (enData?.success || arData?.success) {
            // Format analysis as bilingual comment
            const typeLabel = isVideo ? 'Video' : 'Photo';
            const typeLabelAr = isVideo ? 'فيديو' : 'صورة';
            const formatAnalysis = (data: any, lang: string) => {
              if (!data || !data.success) return '';
              const prefix = lang === 'en' ? `🔍 ${typeLabel} Analysis (EN)` : `🔍 تحليل ${typeLabelAr} (AR)`;
              const lines = [prefix];
              if (data.description) lines.push(`• ${lang === 'en' ? 'Issue' : 'المشكلة'}: ${data.description}`);
              if (data.severity) lines.push(`• ${lang === 'en' ? 'Severity' : 'الخطورة'}: ${data.severity}`);
              if (data.cause) lines.push(`• ${lang === 'en' ? 'Cause' : 'السبب'}: ${data.cause}`);
              if (data.recommendation) lines.push(`• ${lang === 'en' ? 'Action' : 'الإجراء'}: ${data.recommendation}`);
              if (data.safety_risk) lines.push(`• ${lang === 'en' ? 'Safety' : 'السلامة'}: ${data.safety_risk}`);
              return lines.join('\n');
            };

            const enAnalysis = formatAnalysis(enData, 'en');
            const arAnalysis = formatAnalysis(arData, 'ar');

            // Store in state for separate display
            if (isVideo) {
              setVideoAnalysis({ en: enAnalysis, ar: arAnalysis });
            } else {
              setPhotoAnalysis({ en: enAnalysis, ar: arAnalysis });
            }
            localAnalysisSetRef.current = true; // Mark that we set this locally
            // Analysis will be auto-saved by the useEffect that watches buildAnalysisComment
            setShowComment(true);
            message.success(t('inspection.aiAnalysisComplete', 'AI analysis complete'));
          }
        } catch (err) {
          console.warn('AI analysis failed:', err);
          message.warning(isVideo
            ? t('inspection.videoAnalysisFailed', 'Video analysis failed')
            : t('inspection.photoAnalysisFailed', 'Photo analysis failed')
          );
        } finally {
          if (isVideo) {
            setIsAnalyzingVideo(false);
          } else {
            setIsAnalyzing(false);
          }
          // Delay refetch to allow server to save the comment
          setTimeout(() => refetchInspection(), 1500);
        }
      }
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
      setVoiceTranscription(null);
      message.success(t('inspection.voiceDeleted', 'Voice note deleted'));
      refetchInspection();
    },
    onError: () => message.error(t('common.error')),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: () => inspectionsApi.deletePhoto(inspectionId, item.id),
    onSuccess: () => {
      setLocalPhotoUrl(null);
      message.success(t('inspection.photoDeleted', 'Photo deleted'));
      refetchInspection();
    },
    onError: () => message.error(t('common.error')),
  });

  const deleteVideoMutation = useMutation({
    mutationFn: () => inspectionsApi.deleteVideo(inspectionId, item.id),
    onSuccess: () => {
      setLocalVideoUrl(null);
      message.success(t('inspection.videoDeleted', 'Video deleted'));
      refetchInspection();
    },
    onError: () => message.error(t('common.error')),
  });

  // Camera button - opens camera directly
  const openCamera = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) uploadMediaMutation.mutate(file);
    };
    input.click();
  };

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
          <InputNumber
            defaultValue={currentValue ? Number(currentValue) : undefined}
            placeholder={t('inspection.answer', 'Enter value')}
            disabled={disabled}
            onBlur={(e) => {
              const val = e.target.value;
              if (val && val !== currentValue) {
                handleAnswerChange(val);
              }
            }}
            style={{ width: '100%' }}
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
                handleAnswerChange(val);
              }
            }}
            style={{ width: 200 }}
          />
        );
      default:
        return null;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card
      style={{ marginBottom: 12 }}
      size="small"
      title={
        <Space wrap>
          <Typography.Text strong>{getQuestionText(item)}</Typography.Text>
          <Button
            type="text"
            size="small"
            icon={<SoundOutlined />}
            loading={isReadingAloud}
            onClick={readAloud}
            title={t('inspection.readAloud', 'Read aloud')}
            style={{ color: isReadingAloud ? '#1677ff' : '#999' }}
          />
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

        {/* Action buttons */}
        {!isSubmitted && (
          <Space wrap>
            {!showComment && (
              <Button size="small" type="link" onClick={() => setShowComment(true)}>
                {t('inspection.comment', 'Comment')}
              </Button>
            )}

            {/* Camera button - opens camera directly */}
            <Button
              size="small"
              type="primary"
              icon={<CameraOutlined />}
              loading={uploadMediaMutation.isPending}
              onClick={openCamera}
              style={{ background: '#25D366', borderColor: '#25D366' }}
            >
              {t('inspection.camera', 'Camera')}
            </Button>

            {/* Gallery button */}
            <Upload
              accept="image/*,video/*"
              showUploadList={false}
              beforeUpload={(file) => { uploadMediaMutation.mutate(file); return false; }}
            >
              <Button size="small" icon={<PictureOutlined />} loading={uploadMediaMutation.isPending}>
                {t('inspection.gallery', 'Gallery')}
              </Button>
            </Upload>
          </Space>
        )}

        {/* Photo preview - WhatsApp style bubble */}
        {photoUrl && (
          <div style={{
            position: 'relative',
            display: 'inline-block',
            background: '#DCF8C6',
            borderRadius: 8,
            padding: 4,
            maxWidth: 250,
          }}>
            <a href={photoUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={photoLoadError ? photoUrl : getPhotoThumbnailUrl(photoUrl)}
                alt="Inspection photo"
                style={{ maxWidth: 240, maxHeight: 180, objectFit: 'contain', borderRadius: 6, display: 'block', cursor: 'pointer' }}
                onError={(e) => {
                  if (!photoLoadError) {
                    // Thumbnail transformation failed — try raw URL
                    setPhotoLoadError(true);
                  }
                }}
                title={t('inspection.clickToEnlarge', 'Click to view full size')}
              />
            </a>
            {/* AI Analyzing indicator */}
            {isAnalyzing && (
              <div style={{
                position: 'absolute', bottom: 8, left: 8, right: 8,
                background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '4px 8px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Spin size="small" />
                <Typography.Text style={{ color: '#fff', fontSize: 11 }}>
                  {t('inspection.aiAnalyzing', 'AI Analyzing...')}
                </Typography.Text>
              </div>
            )}
            {!isSubmitted && (
              <Button
                type="primary"
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={deletePhotoMutation.isPending}
                onClick={() => {
                  deletePhotoMutation.mutate();
                  setLocalPhotoUrl(null);
                  setPhotoLoadError(false);
                  setPhotoAnalysis(null);
                }}
                style={{ position: 'absolute', top: 8, right: 8 }}
              />
            )}
          </div>
        )}

        {/* Video preview - WhatsApp style bubble with Cloudinary optimizations */}
        {videoUrl && (
          <div style={{
            position: 'relative',
            display: 'inline-block',
            background: '#DCF8C6',
            borderRadius: 8,
            padding: 4,
            maxWidth: 320,
          }}>
            <video
              controls
              src={videoUrl}
              style={{ maxWidth: 310, maxHeight: 220, borderRadius: 6, display: 'block', background: '#000' }}
              preload="metadata"
            />
            {/* AI Analyzing indicator for video */}
            {isAnalyzingVideo && (
              <div style={{
                position: 'absolute', bottom: 8, left: 8, right: 8,
                background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '4px 8px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Spin size="small" />
                <Typography.Text style={{ color: '#fff', fontSize: 11 }}>
                  {t('inspection.aiAnalyzingVideo', 'AI Analyzing Video...')}
                </Typography.Text>
              </div>
            )}
            {!isSubmitted && (
              <Button
                type="primary"
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={deleteVideoMutation.isPending}
                onClick={() => {
                  deleteVideoMutation.mutate();
                  setLocalVideoUrl(null);
                  setVideoAnalysis(null);
                }}
                style={{ position: 'absolute', top: 8, right: 8 }}
              />
            )}
          </div>
        )}

        {/* Voice recording area - compact design */}
        {showComment && !isSubmitted && (
          <div style={{
            background: '#f0f2f5',
            borderRadius: 16,
            padding: '4px 12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {/* Hold to record button - smaller */}
            <Button
              type={isRecording ? 'primary' : 'default'}
              danger={isRecording}
              shape="circle"
              size="small"
              icon={<AudioOutlined style={{ fontSize: 12 }} />}
              loading={isTranscribing}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={() => isRecording && stopRecording()}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              style={{
                background: isRecording ? '#ff4d4f' : '#25D366',
                borderColor: isRecording ? '#ff4d4f' : '#25D366',
                color: '#fff',
                width: 28,
                height: 28,
                minWidth: 28,
              }}
            />

            {isRecording ? (
              <Typography.Text style={{ color: '#ff4d4f', fontWeight: 500, fontSize: 12 }}>
                {formatTime(recordingTime)}
              </Typography.Text>
            ) : isTranscribing ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('inspection.transcribing', 'Transcribing...')}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {t('inspection.hold_mic', 'Hold 🎙️')}
              </Typography.Text>
            )}
          </div>
        )}

        {/* Voice playback - WhatsApp style bubble with custom player */}
        {voiceUrl && (
          <VoicePlayer
            url={voiceUrl}
            onDelete={!isSubmitted ? () => deleteVoiceMutation.mutate() : undefined}
            isDeleting={deleteVoiceMutation.isPending}
          />
        )}

        {/* Voice Transcription Box */}
        {voiceTranscription && (voiceTranscription.en || voiceTranscription.ar) && (
          <AnalysisBox
            title="Voice Transcription"
            titleAr="النص الصوتي"
            icon={<AudioOutlined style={{ color: '#722ed1' }} />}
            enContent={voiceTranscription.en}
            arContent={voiceTranscription.ar}
            color="#722ed1"
          />
        )}

        {/* Photo Analysis Box */}
        {photoAnalysis && (photoAnalysis.en || photoAnalysis.ar) && (
          <AnalysisBox
            title="Photo Analysis"
            titleAr="تحليل الصورة"
            icon={<PictureOutlined style={{ color: '#52c41a' }} />}
            enContent={photoAnalysis.en}
            arContent={photoAnalysis.ar}
            color="#52c41a"
          />
        )}

        {/* Video Analysis Box */}
        {videoAnalysis && (videoAnalysis.en || videoAnalysis.ar) && (
          <AnalysisBox
            title="Video Analysis"
            titleAr="تحليل الفيديو"
            icon={<VideoCameraOutlined style={{ color: '#1890ff' }} />}
            enContent={videoAnalysis.en}
            arContent={videoAnalysis.ar}
            color="#1890ff"
          />
        )}

        {/* Validation warnings */}
        {isFailed && !hasExistingVoice && !isSubmitted && (
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            {t('inspection.fail_requires_voice', 'Voice recording is required for failed items')}
          </Typography.Text>
        )}
        {isFailed && !existingAnswer?.photo_path && !existingAnswer?.video_path && !existingAnswer?.photo_file && !existingAnswer?.video_file && !photoUrl && !videoUrl && !isSubmitted && (
          <Typography.Text type="warning" style={{ fontSize: 12 }}>
            {t('inspection.fail_requires_media', 'Photo or video is required for failed items')}
          </Typography.Text>
        )}
      </Space>
    </Card>
  );
}
