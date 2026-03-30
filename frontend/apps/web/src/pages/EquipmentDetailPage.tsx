import { useState } from 'react';
import {
  Card, Tabs, Tag, Space, Typography, Breadcrumb, Button, Spin, Empty, Segmented, Row, Col, Statistic, Descriptions,
} from 'antd';
import {
  ArrowLeftOutlined, DashboardOutlined, TableOutlined, InfoCircleOutlined,
  RiseOutlined, FallOutlined, MinusOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { equipmentApi, type Equipment, type ReadingGroup } from '@inspection/shared';
import ReadingChart from '../components/equipment/ReadingChart';
import ReadingsHistoryTable from '../components/equipment/ReadingsHistoryTable';

const { Title, Text } = Typography;

const DAYS_OPTIONS = [
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 },
  { label: '180 Days', value: 180 },
  { label: '1 Year', value: 365 },
];

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const equipmentId = Number(id);
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [days, setDays] = useState(90);
  const [activeTab, setActiveTab] = useState('charts');

  const { data: eqData, isLoading: eqLoading } = useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: () => equipmentApi.get(equipmentId),
    enabled: !!equipmentId,
  });

  const { data: readingsData, isLoading: readingsLoading } = useQuery({
    queryKey: ['equipment-readings-history', equipmentId, days],
    queryFn: () => equipmentApi.getReadingsHistory(equipmentId, days),
    enabled: !!equipmentId,
  });

  const equipment: Equipment | undefined = (eqData?.data as any)?.data || (eqData?.data as any);
  const history = (readingsData?.data as any)?.data;
  const groups: ReadingGroup[] = history?.reading_groups || [];
  const isLoading = eqLoading || readingsLoading;

  const statusColors: Record<string, string> = {
    active: 'green', under_maintenance: 'orange', out_of_service: 'red', stopped: 'volcano', paused: 'gold',
  };

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Breadcrumb style={{ marginBottom: 16 }}>
        <Breadcrumb.Item><Link to="/equipment-dashboard">Equipment Dashboard</Link></Breadcrumb.Item>
        <Breadcrumb.Item>{equipment?.name || `Equipment #${equipmentId}`}</Breadcrumb.Item>
      </Breadcrumb>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/equipment-dashboard')} />
        <Title level={3} style={{ margin: 0 }}>
          {equipment?.name || equipment?.serial_number || `Equipment #${equipmentId}`}
        </Title>
        {equipment?.status && <Tag color={statusColors[equipment.status]}>{equipment.status.replace('_', ' ').toUpperCase()}</Tag>}
        {equipment?.equipment_type && <Tag>{equipment.equipment_type}</Tag>}
      </div>

      {/* Equipment info strip */}
      {equipment && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={24}>
            <Col><Text type="secondary">Serial:</Text> <Text strong>{equipment.serial_number}</Text></Col>
            <Col><Text type="secondary">Type:</Text> <Text strong>{equipment.equipment_type}</Text></Col>
            {equipment.equipment_type_2 && <Col><Text type="secondary">Subtype:</Text> <Text strong>{equipment.equipment_type_2}</Text></Col>}
            <Col><Text type="secondary">Berth:</Text> <Text strong>{equipment.berth || '-'}</Text></Col>
            <Col><Text type="secondary">Readings:</Text> <Text strong>{history?.total_readings || 0}</Text></Col>
            <Col><Text type="secondary">Period:</Text> <Text strong>{history?.date_range?.start} — {history?.date_range?.end}</Text></Col>
          </Row>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'charts',
            label: <Space><DashboardOutlined />{t('readings.charts', 'Charts')}</Space>,
            children: (
              <div>
                {/* Time range selector */}
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Segmented
                    options={DAYS_OPTIONS}
                    value={days}
                    onChange={(v) => setDays(v as number)}
                  />
                  <Text type="secondary">
                    {groups.length} reading types | {history?.total_readings || 0} total data points
                  </Text>
                </div>

                {isLoading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                ) : groups.length === 0 ? (
                  <Empty description="No numeric readings found for this equipment in the selected period" />
                ) : (
                  <>
                    {/* Summary stats */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      {groups.slice(0, 4).map(g => {
                        const trendIcon = g.stats.trend === 'increasing' ? <RiseOutlined style={{ color: '#ff4d4f' }} />
                          : g.stats.trend === 'decreasing' ? <FallOutlined style={{ color: '#52c41a' }} />
                          : <MinusOutlined style={{ color: '#8c8c8c' }} />;
                        return (
                          <Col key={g.group_key} xs={12} sm={6}>
                            <Card size="small">
                              <Statistic
                                title={<Text style={{ fontSize: 11 }}>{g.label}</Text>}
                                value={g.stats.latest}
                                suffix={g.unit}
                                prefix={trendIcon}
                                valueStyle={{ fontSize: 20 }}
                              />
                              <Text type="secondary" style={{ fontSize: 10 }}>
                                Avg: {g.stats.avg} | Range: {g.stats.min}–{g.stats.max}
                              </Text>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>

                    {/* Charts */}
                    {groups.map(g => (
                      <ReadingChart key={g.group_key} group={g} language={i18n.language} />
                    ))}
                  </>
                )}
              </div>
            ),
          },
          {
            key: 'history',
            label: <Space><TableOutlined />{t('readings.history', 'History')}</Space>,
            children: isLoading ? (
              <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
            ) : groups.length === 0 ? (
              <Empty description="No readings found" />
            ) : (
              <ReadingsHistoryTable groups={groups} />
            ),
          },
          {
            key: 'info',
            label: <Space><InfoCircleOutlined />{t('readings.info', 'Equipment Info')}</Space>,
            children: equipment ? (
              <Card>
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label="Name">{equipment.name}</Descriptions.Item>
                  <Descriptions.Item label="Serial Number">{equipment.serial_number}</Descriptions.Item>
                  <Descriptions.Item label="Type">{equipment.equipment_type}</Descriptions.Item>
                  <Descriptions.Item label="Subtype">{equipment.equipment_type_2 || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Tag color={statusColors[equipment.status || '']}>{equipment.status}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Berth">{equipment.berth || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Location">{equipment.location || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Manufacturer">{(equipment as any).manufacturer || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>
            ) : <Spin />,
          },
        ]}
      />
    </div>
  );
}
