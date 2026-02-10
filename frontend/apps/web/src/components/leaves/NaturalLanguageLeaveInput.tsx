import { useState, useCallback, useMemo } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  Typography,
  Tag,
  Row,
  Col,
  DatePicker,
  Select,
  Form,
  Alert,
  Spin,
  Tooltip,
  Progress,
  Divider,
} from 'antd';
import {
  MessageOutlined,
  SendOutlined,
  EditOutlined,
  CheckOutlined,
  ReloadOutlined,
  BulbOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import { leavesApi, LeaveRequestPayload, LegacyLeaveType } from '@inspection/shared';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface ParsedLeaveRequest {
  leave_type: LegacyLeaveType;
  date_from: string;
  date_to: string;
  reason: string;
  confidence: number;
  parsed_entities: {
    type: string;
    value: string;
    confidence: number;
  }[];
}

interface NaturalLanguageLeaveInputProps {
  userId?: number;
  onSubmit?: (payload: LeaveRequestPayload) => void;
  onParsed?: (parsed: ParsedLeaveRequest) => void;
}

const LEAVE_TYPE_OPTIONS: { value: LegacyLeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'emergency', label: 'Emergency Leave' },
  { value: 'training', label: 'Training Leave' },
  { value: 'other', label: 'Other' },
];

const EXAMPLE_INPUTS = [
  'I need 3 days off next week for a family vacation',
  'Taking sick leave tomorrow due to fever',
  'Request annual leave from March 15 to March 20 for vacation',
  'Emergency leave today - family emergency',
  'Training leave next Monday for certification course',
];

export function NaturalLanguageLeaveInput({
  userId,
  onSubmit,
  onParsed,
}: NaturalLanguageLeaveInputProps) {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [parsedRequest, setParsedRequest] = useState<ParsedLeaveRequest | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();

  // Parse natural language mutation
  const parseMutation = useMutation({
    mutationFn: (text: string) => leavesApi.parseNaturalLanguage(text),
    onSuccess: (response) => {
      const parsed = response.data?.data?.parsed as ParsedLeaveRequest;
      if (parsed) {
        setParsedRequest(parsed);
        onParsed?.(parsed);

        // Set form values
        form.setFieldsValue({
          leave_type: parsed.leave_type,
          dates: [
            dayjs(parsed.date_from),
            dayjs(parsed.date_to),
          ],
          reason: parsed.reason,
        });
      }
    },
    onError: (err: any) => {
      console.error('Failed to parse:', err);
    },
  });

  const handleParse = () => {
    if (inputText.trim()) {
      parseMutation.mutate(inputText);
    }
  };

  const handleReset = () => {
    setInputText('');
    setParsedRequest(null);
    setIsEditing(false);
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: LeaveRequestPayload = {
        user_id: userId,
        leave_type: values.leave_type,
        date_from: values.dates[0].format('YYYY-MM-DD'),
        date_to: values.dates[1].format('YYYY-MM-DD'),
        reason: values.reason,
        coverage_user_id: 0, // Will be set by the submit handler
      };
      onSubmit?.(payload);
    } catch {
      // Validation failed
    }
  };

  const handleExampleClick = (example: string) => {
    setInputText(example);
    parseMutation.mutate(example);
  };

  const confidenceColor = useMemo(() => {
    if (!parsedRequest) return '#8c8c8c';
    if (parsedRequest.confidence >= 0.8) return '#52c41a';
    if (parsedRequest.confidence >= 0.5) return '#faad14';
    return '#ff4d4f';
  }, [parsedRequest]);

  return (
    <Card
      title={
        <Space>
          <MessageOutlined style={{ color: '#722ed1' }} />
          {t('leaves.naturalLanguageInput', 'Natural Language Leave Request')}
        </Space>
      }
      style={{ borderLeft: '4px solid #722ed1' }}
    >
      <Alert
        message={t('leaves.nlpTip', 'Just describe your leave request in plain language')}
        description={t(
          'leaves.nlpDescription',
          'Our AI will understand and fill in the details for you. You can review and edit before submitting.'
        )}
        type="info"
        showIcon
        icon={<BulbOutlined />}
        style={{ marginBottom: 24 }}
      />

      {/* Input Section */}
      {!parsedRequest && (
        <>
          <TextArea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t(
              'leaves.nlpPlaceholder',
              'e.g., "I need 3 days off next week for a family vacation" or "Sick leave tomorrow"'
            )}
            rows={3}
            style={{ marginBottom: 16 }}
            disabled={parseMutation.isPending}
          />

          <Row justify="space-between" align="middle">
            <Col>
              <Space wrap>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('leaves.tryExamples', 'Try:')}
                </Text>
                {EXAMPLE_INPUTS.slice(0, 3).map((example, idx) => (
                  <Button
                    key={idx}
                    type="link"
                    size="small"
                    onClick={() => handleExampleClick(example)}
                    disabled={parseMutation.isPending}
                    style={{ padding: 0, fontSize: 12 }}
                  >
                    "{example.substring(0, 30)}..."
                  </Button>
                ))}
              </Space>
            </Col>
            <Col>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleParse}
                loading={parseMutation.isPending}
                disabled={!inputText.trim()}
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
              >
                {t('leaves.parse', 'Parse Request')}
              </Button>
            </Col>
          </Row>
        </>
      )}

      {/* Parsing Indicator */}
      {parseMutation.isPending && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">{t('leaves.analyzing', 'Analyzing your request...')}</Text>
          </div>
        </div>
      )}

      {/* Parsed Result */}
      {parsedRequest && !parseMutation.isPending && (
        <>
          {/* Confidence Indicator */}
          <div
            style={{
              padding: 12,
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <Row align="middle" gutter={16}>
              <Col flex={1}>
                <Text type="secondary">{t('leaves.confidence', 'Parsing Confidence')}</Text>
                <Progress
                  percent={Math.round(parsedRequest.confidence * 100)}
                  strokeColor={confidenceColor}
                  size="small"
                />
              </Col>
              <Col>
                <Tag color={confidenceColor}>
                  {parsedRequest.confidence >= 0.8
                    ? t('leaves.highConfidence', 'High')
                    : parsedRequest.confidence >= 0.5
                    ? t('leaves.mediumConfidence', 'Medium')
                    : t('leaves.lowConfidence', 'Low')}
                </Tag>
              </Col>
            </Row>

            {parsedRequest.confidence < 0.7 && (
              <Alert
                type="warning"
                message={t(
                  'leaves.lowConfidenceWarning',
                  'Please verify the parsed values below and make corrections if needed.'
                )}
                showIcon
                style={{ marginTop: 8 }}
              />
            )}
          </div>

          {/* Parsed Entities Preview */}
          {parsedRequest.parsed_entities.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <InfoCircleOutlined style={{ marginRight: 4 }} />
                {t('leaves.parsedEntities', 'Detected entities:')}
              </Text>
              <div style={{ marginTop: 8 }}>
                <Space wrap>
                  {parsedRequest.parsed_entities.map((entity, idx) => (
                    <Tooltip
                      key={idx}
                      title={`${t('leaves.confidence', 'Confidence')}: ${Math.round(entity.confidence * 100)}%`}
                    >
                      <Tag
                        color={entity.confidence >= 0.8 ? 'blue' : 'default'}
                      >
                        <strong>{entity.type}:</strong> {entity.value}
                      </Tag>
                    </Tooltip>
                  ))}
                </Space>
              </div>
            </div>
          )}

          <Divider />

          {/* Editable Form */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Title level={5} style={{ margin: 0 }}>
              <CalendarOutlined style={{ marginRight: 8 }} />
              {t('leaves.reviewRequest', 'Review Leave Request')}
            </Title>
            <Button
              type="text"
              icon={isEditing ? <CheckOutlined /> : <EditOutlined />}
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing
                ? t('common.done', 'Done')
                : t('leaves.editValues', 'Edit Values')}
            </Button>
          </div>

          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="leave_type"
                  label={t('leaves.leaveType', 'Leave Type')}
                  rules={[{ required: true }]}
                >
                  <Select options={LEAVE_TYPE_OPTIONS} disabled={!isEditing} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="dates"
                  label={t('leaves.dates', 'Dates')}
                  rules={[{ required: true }]}
                >
                  <RangePicker
                    style={{ width: '100%' }}
                    disabled={!isEditing}
                    disabledDate={(current) => current && current.isBefore(dayjs(), 'day')}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="reason"
              label={t('leaves.reason', 'Reason')}
              rules={[{ required: true }]}
            >
              <TextArea
                rows={2}
                disabled={!isEditing}
                placeholder={t('leaves.reasonPlaceholder', 'Enter reason for leave')}
              />
            </Form.Item>
          </Form>

          {/* Actions */}
          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common.reset', 'Reset')}
              </Button>
            </Col>
            <Col>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleSubmit}
                style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
              >
                {t('leaves.proceedToSubmit', 'Proceed to Submit')}
              </Button>
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
}

export default NaturalLanguageLeaveInput;
