import { useState } from 'react';
import { Upload, Avatar, Button, message, Modal, Slider, Space, Typography } from 'antd';
import {
  UserOutlined,
  CameraOutlined,
  LoadingOutlined,
  DeleteOutlined,
  ZoomInOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';

const { Text } = Typography;

interface AvatarUploadProps {
  value?: string;
  onChange?: (url: string | null) => void;
  size?: number;
  maxSize?: number; // in MB
  onUpload?: (file: File) => Promise<string>;
  disabled?: boolean;
  showRemove?: boolean;
  shape?: 'circle' | 'square';
}

export function AvatarUpload({
  value,
  onChange,
  size = 100,
  maxSize = 5,
  onUpload,
  disabled = false,
  showRemove = true,
  shape = 'circle',
}: AvatarUploadProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const beforeUpload = (file: RcFile): boolean => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error(t('upload.imageOnly', 'You can only upload image files!'));
      return false;
    }

    const isLtMax = file.size / 1024 / 1024 < maxSize;
    if (!isLtMax) {
      message.error(t('upload.sizeLimit', `Image must be smaller than ${maxSize}MB!`));
      return false;
    }

    return true;
  };

  const handleUpload = async (file: RcFile) => {
    setLoading(true);

    try {
      let imageUrl: string;

      if (onUpload) {
        // Custom upload handler
        imageUrl = await onUpload(file);
      } else {
        // Default: convert to base64
        imageUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      onChange?.(imageUrl);
      message.success(t('upload.success', 'Avatar uploaded successfully'));
    } catch (error) {
      message.error(t('upload.failed', 'Upload failed'));
      console.error('Avatar upload error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    Modal.confirm({
      title: t('profile.removeAvatar', 'Remove Avatar'),
      content: t('profile.removeAvatarConfirm', 'Are you sure you want to remove your avatar?'),
      okText: t('common.yes', 'Yes'),
      cancelText: t('common.no', 'No'),
      onOk: () => {
        onChange?.(null);
        message.success(t('profile.avatarRemoved', 'Avatar removed'));
      },
    });
  };

  const handlePreview = () => {
    if (value) {
      setPreviewImage(value);
      setPreviewOpen(true);
      setZoom(1);
      setRotation(0);
    }
  };

  const uploadButton = (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? '50%' : 8,
        backgroundColor: '#fafafa',
        border: '2px dashed #d9d9d9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.3s',
      }}
    >
      {loading ? (
        <LoadingOutlined style={{ fontSize: 24, color: '#1890ff' }} />
      ) : (
        <>
          <CameraOutlined style={{ fontSize: 24, color: '#999' }} />
          <Text type="secondary" style={{ fontSize: 11, marginTop: 4 }}>
            {t('profile.uploadPhoto', 'Upload')}
          </Text>
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: 'inline-block', textAlign: 'center' }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {value ? (
          <div style={{ position: 'relative' }}>
            <Avatar
              src={value}
              size={size}
              shape={shape}
              icon={<UserOutlined />}
              style={{ cursor: 'pointer' }}
              onClick={handlePreview}
            />

            {!disabled && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  display: 'flex',
                  gap: 4,
                }}
              >
                <Upload
                  showUploadList={false}
                  beforeUpload={beforeUpload}
                  customRequest={({ file }) => handleUpload(file as RcFile)}
                  accept="image/*"
                  disabled={disabled || loading}
                >
                  <Button
                    type="primary"
                    size="small"
                    shape="circle"
                    icon={loading ? <LoadingOutlined /> : <CameraOutlined />}
                    style={{
                      width: 28,
                      height: 28,
                      minWidth: 28,
                    }}
                  />
                </Upload>

                {showRemove && (
                  <Button
                    danger
                    size="small"
                    shape="circle"
                    icon={<DeleteOutlined />}
                    onClick={handleRemove}
                    style={{
                      width: 28,
                      height: 28,
                      minWidth: 28,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          <Upload
            showUploadList={false}
            beforeUpload={beforeUpload}
            customRequest={({ file }) => handleUpload(file as RcFile)}
            accept="image/*"
            disabled={disabled || loading}
          >
            {uploadButton}
          </Upload>
        )}
      </div>

      <Modal
        open={previewOpen}
        title={t('profile.avatarPreview', 'Avatar Preview')}
        footer={null}
        onCancel={() => setPreviewOpen(false)}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              overflow: 'hidden',
              borderRadius: shape === 'circle' ? '50%' : 8,
              width: 250,
              height: 250,
              margin: '0 auto 16px',
            }}
          >
            <img
              alt="avatar"
              src={previewImage}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: 'transform 0.3s',
              }}
            />
          </div>

          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <ZoomInOutlined />
              <Slider
                min={0.5}
                max={2}
                step={0.1}
                value={zoom}
                onChange={setZoom}
                style={{ width: 150 }}
              />
              <Text type="secondary">{Math.round(zoom * 100)}%</Text>
            </Space>

            <Space>
              <Button
                icon={<RotateLeftOutlined />}
                onClick={() => setRotation(rotation - 90)}
              >
                {t('common.rotateLeft', 'Rotate Left')}
              </Button>
              <Button
                icon={<RotateRightOutlined />}
                onClick={() => setRotation(rotation + 90)}
              >
                {t('common.rotateRight', 'Rotate Right')}
              </Button>
            </Space>
          </Space>
        </div>
      </Modal>
    </div>
  );
}

export default AvatarUpload;
