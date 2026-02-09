import { useState, useRef, useEffect, useCallback } from 'react';
import { Modal, Button, Space, Typography, message, Input, Card, Spin, Alert } from 'antd';
import {
  ScanOutlined,
  CameraOutlined,
  CloseOutlined,
  CheckOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, Material } from '@inspection/shared';

const { Text, Title } = Typography;

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onMaterialFound: (material: Material) => void;
  title?: string;
}

export function BarcodeScanner({
  open,
  onClose,
  onMaterialFound,
  title,
}: BarcodeScannerProps) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Search for material by code
  const { data: materialData, isLoading: searching, refetch } = useQuery({
    queryKey: ['material-by-code', scannedCode || manualCode],
    queryFn: async () => {
      const code = scannedCode || manualCode;
      if (!code) return null;
      const result = await materialsApi.list({ search: code });
      const materials = result.data?.materials || [];
      return materials.find((m) => m.code.toLowerCase() === code.toLowerCase());
    },
    enabled: !!(scannedCode || manualCode),
  });

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setScanning(true);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? t('materials.camera_permission_denied', 'Camera permission denied')
          : t('materials.camera_not_available', 'Camera not available')
      );
    }
  }, [t]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setScannedCode(null);
      setManualCode('');
    }
  }, [open, stopCamera]);

  // Simple barcode detection (in real app, use a library like quagga or zxing)
  useEffect(() => {
    if (!scanning || !videoRef.current) return;

    // Note: For production, integrate a proper barcode scanning library
    // This is a placeholder that would need BarcodeDetector API or external library
    const checkForBarcode = async () => {
      // @ts-ignore - BarcodeDetector may not be available in all browsers
      if (typeof BarcodeDetector !== 'undefined') {
        try {
          // @ts-ignore
          const barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'qr_code'] });
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            setScannedCode(code);
            stopCamera();
            message.success(`${t('materials.code_detected', 'Code detected')}: ${code}`);
          }
        } catch (err) {
          // Barcode detection not supported or failed
        }
      }
    };

    const interval = setInterval(checkForBarcode, 500);
    return () => clearInterval(interval);
  }, [scanning, stopCamera, t]);

  const handleManualSearch = () => {
    if (manualCode.trim()) {
      refetch();
    }
  };

  const handleSelectMaterial = () => {
    if (materialData) {
      onMaterialFound(materialData);
      onClose();
    }
  };

  return (
    <Modal
      title={
        <Space>
          <ScanOutlined style={{ color: '#1890ff' }} />
          {title || t('materials.scan_barcode', 'Scan Barcode')}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={500}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Camera View */}
        <Card
          size="small"
          style={{
            background: '#000',
            minHeight: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {scanning ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{ width: '100%', maxHeight: 250 }}
            />
          ) : cameraError ? (
            <Alert
              message={cameraError}
              type="error"
              showIcon
              style={{ margin: 16 }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#fff' }}>
              <CameraOutlined style={{ fontSize: 48, marginBottom: 16 }} />
              <div>
                <Button
                  type="primary"
                  icon={<CameraOutlined />}
                  onClick={startCamera}
                  size="large"
                >
                  {t('materials.start_camera', 'Start Camera')}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {scanning && (
          <Button
            icon={<CloseOutlined />}
            onClick={stopCamera}
            block
            danger
          >
            {t('materials.stop_scanning', 'Stop Scanning')}
          </Button>
        )}

        {/* Manual Entry */}
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            {t('materials.or_enter_manually', 'Or enter code manually')}:
          </Text>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder={t('materials.enter_material_code', 'Enter material code')}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onPressEnter={handleManualSearch}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleManualSearch}
              loading={searching}
            >
              {t('common.search', 'Search')}
            </Button>
          </Space.Compact>
        </div>

        {/* Search Result */}
        {(scannedCode || manualCode) && (
          <div>
            {searching ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Spin />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">{t('materials.searching', 'Searching...')}</Text>
                </div>
              </div>
            ) : materialData ? (
              <Card
                size="small"
                style={{ borderColor: '#52c41a' }}
                actions={[
                  <Button
                    key="select"
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={handleSelectMaterial}
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  >
                    {t('materials.select_material', 'Select Material')}
                  </Button>,
                ]}
              >
                <Space direction="vertical" size={0}>
                  <Title level={5} style={{ margin: 0 }}>{materialData.name}</Title>
                  <Text type="secondary">{materialData.code}</Text>
                  <Space style={{ marginTop: 8 }}>
                    <Text>
                      {t('materials.stock', 'Stock')}: <Text strong>{materialData.current_stock}</Text> {materialData.unit}
                    </Text>
                    <Text type="secondary">|</Text>
                    <Text>
                      {t('materials.category', 'Category')}: <Text strong>{materialData.category}</Text>
                    </Text>
                  </Space>
                </Space>
              </Card>
            ) : (
              <Alert
                message={t('materials.material_not_found', 'Material not found')}
                description={t('materials.check_code_try_again', 'Please check the code and try again.')}
                type="warning"
                showIcon
              />
            )}
          </div>
        )}
      </Space>
    </Modal>
  );
}

export default BarcodeScanner;
