import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Image,
  InputNumber,
  Modal,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileImageOutlined,
  ReloadOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  dataCleanupApi,
  type SuspiciousReadingRow,
  type CleanupConfidence,
} from '@inspection/shared';
import type { ColumnsType } from 'antd/es/table';

const { Text, Title, Paragraph } = Typography;

const CONFIDENCE_META: Record<
  CleanupConfidence,
  { label: string; color: string; tagColor: string; icon: React.ReactNode }
> = {
  high: {
    label: 'High',
    color: '#ff4d4f',
    tagColor: 'red',
    icon: <ExclamationCircleOutlined />,
  },
  medium: {
    label: 'Medium',
    color: '#faad14',
    tagColor: 'orange',
    icon: <WarningOutlined />,
  },
  low: {
    label: 'Low',
    color: '#1890ff',
    tagColor: 'blue',
    icon: <WarningOutlined />,
  },
};

interface CorrectionDraft {
  answer_id: number;
  new_value: number;
}

export default function ReadingCleanupPage() {
  const queryClient = useQueryClient();
  const [includeLow, setIncludeLow] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [drafts, setDrafts] = useState<Record<number, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['data-cleanup-suspicious', includeLow],
    queryFn: async () => {
      const res = await dataCleanupApi.listSuspiciousReadings({ include_low: includeLow });
      return res.data?.data;
    },
    staleTime: 60 * 1000,
  });

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const bulkCorrect = useMutation({
    mutationFn: (corrections: CorrectionDraft[]) =>
      dataCleanupApi.bulkCorrectReadings({
        edit_reason: 'Red-tenths mechanical-meter typo correction (10x inflation)',
        corrections,
      }),
    onSuccess: (response) => {
      const result = response.data?.data;
      if (result) {
        message.success(
          `Applied ${result.applied} of ${result.total} corrections${
            result.errors.length ? ` (${result.errors.length} errors)` : ''
          }`
        );
        if (result.errors.length) {
          console.warn('Bulk-correct errors:', result.errors);
        }
      }
      setSelectedRowKeys([]);
      setDrafts({});
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['data-cleanup-suspicious'] });
      queryClient.invalidateQueries({ queryKey: ['running-hours-summary'] });
      queryClient.invalidateQueries({ queryKey: ['running-hours-list'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Bulk correction failed');
    },
  });

  const getDraftValue = (row: SuspiciousReadingRow) =>
    drafts[row.answer_id] ?? row.suggested_value;

  const selectedCorrections: CorrectionDraft[] = useMemo(
    () =>
      selectedRowKeys
        .map((k) => rows.find((r) => r.answer_id === k))
        .filter((r): r is SuspiciousReadingRow => Boolean(r))
        .map((r) => ({ answer_id: r.answer_id, new_value: getDraftValue(r) })),
    [selectedRowKeys, rows, drafts]
  );

  const columns: ColumnsType<SuspiciousReadingRow> = [
    {
      title: 'Confidence',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 110,
      filters: [
        { text: 'High', value: 'high' },
        { text: 'Medium', value: 'medium' },
        { text: 'Low', value: 'low' },
      ],
      onFilter: (val, row) => row.confidence === val,
      render: (c: CleanupConfidence) => {
        const m = CONFIDENCE_META[c];
        return (
          <Tag color={m.tagColor} icon={m.icon}>
            {m.label}
          </Tag>
        );
      },
    },
    {
      title: 'Equipment',
      dataIndex: 'equipment_name',
      key: 'equipment',
      width: 200,
      ellipsis: true,
      render: (name: string, row) => (
        <div>
          <Text strong>{name}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              ID #{row.equipment_id}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 230,
      ellipsis: true,
      render: (r: string) => <Text style={{ fontSize: 12 }}>{r}</Text>,
    },
    {
      title: 'Photo',
      dataIndex: 'photo_url',
      key: 'photo',
      width: 70,
      align: 'center',
      render: (url: string | null) =>
        url ? (
          <Image
            src={url}
            width={44}
            height={44}
            style={{ objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
            preview={{ mask: <FileImageOutlined /> }}
          />
        ) : (
          <Tooltip title="No photo attached">
            <FileImageOutlined style={{ color: '#d9d9d9', fontSize: 18 }} />
          </Tooltip>
        ),
    },
    {
      title: 'Current',
      dataIndex: 'current_value',
      key: 'current',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.current_value - b.current_value,
      render: (v: number) => (
        <Text style={{ color: '#ff4d4f' }} strong>
          {v.toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Previous',
      dataIndex: 'previous_value',
      key: 'previous',
      width: 100,
      align: 'right',
      render: (v: number | null) =>
        v == null ? <Text type="secondary">—</Text> : <Text>{v.toLocaleString()}</Text>,
    },
    {
      title: 'Suggested fix',
      key: 'suggested',
      width: 140,
      render: (_, row) => (
        <InputNumber
          value={getDraftValue(row)}
          step={0.1}
          precision={1}
          size="small"
          style={{ width: 110 }}
          onChange={(v) => {
            if (v == null) return;
            setDrafts((d) => ({ ...d, [row.answer_id]: Number(v) }));
          }}
        />
      ),
    },
    {
      title: 'Date',
      dataIndex: 'answered_at',
      key: 'date',
      width: 130,
      render: (d: string | null) => (d ? dayjs(d).format('YYYY-MM-DD') : '—'),
      sorter: (a, b) => (a.answered_at || '').localeCompare(b.answered_at || ''),
      defaultSortOrder: 'descend',
    },
  ];

  const handleApprove = () => {
    if (selectedCorrections.length === 0) {
      message.warning('Select at least one row to correct');
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <div>
      <Title level={3}>
        <ToolOutlined /> Reading Cleanup — Red-Tenths Typos
      </Title>
      <Paragraph type="secondary">
        Mechanical hour-meters show the integer in white digits and the last digit in red — that
        red digit is the tenths place. When inspectors typed all visible digits as one number
        (e.g. <Text code>95333</Text> instead of <Text code>9533.3</Text>), readings became 10×
        inflated. Review the flagged rows below, adjust the suggested fix if needed, and approve.
      </Paragraph>

      {/* Summary cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Total RH answers"
              value={summary?.total_running_hours_answers ?? 0}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderLeft: '4px solid #ff4d4f' }}>
            <Statistic
              title="High confidence"
              value={summary?.high_confidence ?? 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderLeft: '4px solid #faad14' }}>
            <Statistic
              title="Medium confidence"
              value={summary?.medium_confidence ?? 0}
              valueStyle={{ color: '#faad14' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderLeft: '4px solid #1890ff' }}>
            <Statistic
              title="Low confidence"
              value={summary?.low_confidence ?? 0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="The dashboard will refresh automatically after correction."
        description="High-confidence rows have a clean 10× ratio against the previous reading. Medium = looser ratio or unusually high standalone value. Low confidence rows are hidden by default — toggle below to include them."
      />

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <Badge count={selectedRowKeys.length} showZero color="#1890ff" />
            <span>{selectedRowKeys.length} selected</span>
          </Space>
        }
        extra={
          <Space>
            <Space>
              <Switch
                size="small"
                checked={includeLow}
                onChange={setIncludeLow}
              />
              <Text style={{ fontSize: 12 }}>Show low-confidence</Text>
            </Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={isFetching}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              danger
              disabled={selectedRowKeys.length === 0}
              loading={bulkCorrect.isPending}
              onClick={handleApprove}
            >
              Apply {selectedRowKeys.length || ''} correction
              {selectedRowKeys.length === 1 ? '' : 's'}
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="answer_id"
          columns={columns}
          dataSource={rows}
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true }}
          scroll={{ x: 1100 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />
      </Card>

      <Modal
        title="Confirm bulk correction"
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onOk={() => bulkCorrect.mutate(selectedCorrections)}
        okText={`Apply ${selectedCorrections.length} correction${
          selectedCorrections.length === 1 ? '' : 's'
        }`}
        okButtonProps={{ danger: true, loading: bulkCorrect.isPending }}
      >
        <Paragraph>
          You're about to overwrite{' '}
          <Text strong>{selectedCorrections.length}</Text> inspector-typed reading
          {selectedCorrections.length === 1 ? '' : 's'}. The original values will be lost
          (InspectionAnswer has no audit columns), but the change is logged in the server log
          with your user ID and the reason.
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          Edit reason: "Red-tenths mechanical-meter typo correction (10× inflation)"
        </Paragraph>
      </Modal>
    </div>
  );
}
