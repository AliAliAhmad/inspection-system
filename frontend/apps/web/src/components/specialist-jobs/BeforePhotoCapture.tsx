import { useState, useCallback, useRef } from 'react';
import { Modal, Button, Upload, Typography, Space, Image, Alert, Spin, message } from 'antd';
import {
  CameraOutlined,
  PictureOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { filesApi } from '@inspection/shared';

const { Text, Title } = Typography;

interface BeforePhotoCaptureProps {
  open: boolean;
  onClose: () => void;
  onPhotoCaptured: (photoPath: string) => void;
  jobId: number;
  jobTitle: string;
  loading?: boolean;
}

function openCameraInput(accept: string, onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.capture = 'environment';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

export function BeforePhotoCapture({
  open,
  onClose,
  onPhotoCaptured,
  jobId,
  jobTitle,
  loading = false,
}: BeforePhotoCaptureProps) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      // Create local preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhoto(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to server
      const res = await filesApi.upload(file, 'specialist_job', jobId, 'before_photo');
      const fileData = res.data?.data;
      const filePath = fileData?.filename ? `/uploads/${fileData.filename}` : `/uploads/${file.name}`;
      setPhotoPath(filePath);
      message.success(t('common.save', 'Photo saved'));
    } catch (err) {
      message.error(t('common.error', 'Upload failed'));
      setPhoto(null);
    } finally {
      setUploading(false);
    }
    return false;
  }, [jobId, t]);

  const handleConfirm = () => {
    if (photoPath) {
      onPhotoCaptured(photoPath);
      handleReset();
    }
  };

  const handleReset = () => {
    setPhoto(null);
    setPhotoPath(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <CameraOutlined />
          {t('jobs.before_photo', 'Before Photo')}
        </Space>
      }
      open={open}
      onCancel={handleClose}
      width={520}
      footer={null}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Alert
          type="info"
          message={t('jobs.before_photo_required', 'Photo Required')}
          description={t(
            'jobs.before_photo_description',
            'Please take a photo of the equipment BEFORE starting work. This helps document the initial condition.'
          )}
          showIcon
        />

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">{jobTitle}</Text>
        </div>

        {/* Photo Preview */}
        {photo ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Image
                src={photo}
                alt="Before photo"
                style={{ maxHeight: 300, borderRadius: 8 }}
                preview={false}
              />
              <Button
                icon={<DeleteOutlined />}
                danger
                size="small"
                style={{ position: 'absolute', top: 8, right: 8 }}
                onClick={handleReset}
              />
            </div>
            {uploading && (
              <div style={{ marginTop: 8 }}>
                <Spin size="small" /> {t('common.uploading', 'Uploading...')}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              border: '2px dashed #d9d9d9',
              borderRadius: 8,
              padding: 40,
              textAlign: 'center',
              backgroundColor: '#fafafa',
            }}
          >
            <CameraOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
            <Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>
              {t('jobs.capture_before_photo', 'Capture Before Photo')}
            </Title>
            <Text type="secondary">
              {t('jobs.photo_equipment_condition', 'Take a clear photo showing the current equipment condition')}
            </Text>

            <div style={{ marginTop: 24 }}>
              <Space size="middle">
                <Button
                  type="primary"
                  icon={<CameraOutlined />}
                  size="large"
                  onClick={() => openCameraInput('image/*', handleFileUpload)}
                  loading={uploading}
                >
                  {t('inspection.take_photo', 'Take Photo')}
                </Button>
                <Upload
                  beforeUpload={(file) => {
                    handleFileUpload(file as File);
                    return false;
                  }}
                  maxCount={1}
                  accept="image/*"
                  showUploadList={false}
                >
                  <Button icon={<PictureOutlined />} size="large" loading={uploading}>
                    {t('inspection.from_gallery', 'From Gallery')}
                  </Button>
                </Upload>
              </Space>
            </div>
          </div>
        )}

        {/* Actions */}
        {photo && photoPath && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button onClick={handleReset} disabled={loading}>
              {t('jobs.retake', 'Retake')}
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleConfirm}
              loading={loading}
            >
              {t('jobs.confirm_and_start', 'Confirm & Start')}
            </Button>
          </div>
        )}
      </Space>
    </Modal>
  );
}

export default BeforePhotoCapture;
