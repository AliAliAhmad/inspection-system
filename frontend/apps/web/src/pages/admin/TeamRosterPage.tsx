import { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Upload,
  Modal,
  Drawer,
  Radio,
  Collapse,
  message,
  Typography,
  Alert,
  Badge,
} from 'antd';
import { UploadOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rosterApi, type RosterWeekUser } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text } = Typography;

const ROLE_ORDER: Record<string, number> = {
  inspector: 0,
  specialist: 1,
  engineer: 2,
  quality_engineer: 3,
};

const ROLE_COLORS: Record<string, string> = {
  inspector: 'blue',
  specialist: 'orange',
  engineer: 'green',
  quality_engineer: 'purple',
  admin: 'red',
};

function shiftTag(value: string | undefined) {
  if (!value) return <Text type="secondary">-</Text>;
  switch (value) {
    case 'day':
      return <Tag color="blue">D</Tag>;
    case 'night':
      return <Tag color="purple">N</Tag>;
    case 'off':
      return <Tag color="default">Off</Tag>;
    case 'leave':
      return <Tag color="red">Leave</Tag>;
    default:
      return <Text type="secondary">-</Text>;
  }
}

export default function TeamRosterPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [weekOffset, setWeekOffset] = useState(0);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [drawerShift, setDrawerShift] = useState<string>('all');
  const [uploadResult, setUploadResult] = useState<{
    imported: number;
    users_processed: number;
    errors: string[];
  } | null>(null);

  const baseDate = dayjs().add(weekOffset * 7, 'day').format('YYYY-MM-DD');

  // Fetch week data
  const { data: weekData, isLoading } = useQuery({
    queryKey: ['roster', 'week', baseDate],
    queryFn: () => rosterApi.getWeek(baseDate).then((r) => r.data.data),
  });

  // Fetch day availability when drawer is open
  const { data: dayAvailability, isLoading: dayLoading } = useQuery({
    queryKey: ['roster', 'day-availability', drawerDate, drawerShift],
    queryFn: () =>
      rosterApi
        .getDayAvailability(drawerDate!, drawerShift !== 'all' ? drawerShift : undefined)
        .then((r) => r.data.data),
    enabled: !!drawerDate,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => rosterApi.upload(file),
    onSuccess: (res) => {
      const result = (res.data as any).data ?? res.data;
      setUploadResult({
        imported: result.imported ?? 0,
        users_processed: result.users_processed ?? 0,
        errors: result.errors ?? [],
      });
      queryClient.invalidateQueries({ queryKey: ['roster'] });
      message.success(
        t('roster.uploadSuccess', '{{count}} entries imported', { count: result.imported ?? 0 }),
      );
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to upload roster';
      message.error(msg);
    },
  });

  // Sort users by role order
  const sortedUsers = [...(weekData?.users ?? [])].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99),
  );

  const dates = weekData?.dates ?? [];

  // Calculate date range for display
  const rangeStart = dates.length > 0 ? dayjs(dates[0]) : dayjs().add(weekOffset * 7, 'day');
  const rangeEnd = dates.length > 0 ? dayjs(dates[dates.length - 1]) : rangeStart.add(7, 'day');

  // Build table columns
  const columns = [
    {
      title: t('roster.teamMember', 'Team Member'),
      key: 'user',
      fixed: 'left' as const,
      width: 220,
      render: (_: unknown, record: RosterWeekUser) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.full_name}</Text>
          <Space size={4}>
            <Tag color={ROLE_COLORS[record.role] ?? 'default'}>{record.role}</Tag>
            {record.specialization && <Tag>{record.specialization}</Tag>}
          </Space>
        </Space>
      ),
    },
    ...dates.map((date) => ({
      title: (
        <Button
          type="link"
          size="small"
          onClick={() => {
            setDrawerDate(date);
            setDrawerShift('all');
          }}
          style={{ padding: 0, height: 'auto', lineHeight: 1.2 }}
        >
          <div style={{ textAlign: 'center' }}>
            <div>{dayjs(date).format('ddd')}</div>
            <div>{dayjs(date).format('DD/MM')}</div>
          </div>
        </Button>
      ),
      key: date,
      width: 80,
      align: 'center' as const,
      render: (_: unknown, record: RosterWeekUser) => shiftTag(record.entries[date]),
    })),
  ];

  return (
    <Card
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('nav.roster', 'Team Roster')}
        </Typography.Title>
      }
      extra={
        <Space>
          <Upload
            accept=".xlsx,.xls"
            showUploadList={false}
            beforeUpload={(file) => {
              uploadMutation.mutate(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploadMutation.isPending}>
              {t('roster.importRoster', 'Import Roster')}
            </Button>
          </Upload>
        </Space>
      }
    >
      {/* Date navigation */}
      <Space style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        <Button icon={<LeftOutlined />} onClick={() => setWeekOffset((o) => o - 1)}>
          {t('roster.prevWeek', 'Prev Week')}
        </Button>
        <Button type="text" onClick={() => setWeekOffset(0)}>
          <Text strong>
            {rangeStart.format('DD MMM')} - {rangeEnd.format('DD MMM YYYY')}
          </Text>
        </Button>
        <Button onClick={() => setWeekOffset((o) => o + 1)}>
          {t('roster.nextWeek', 'Next Week')} <RightOutlined />
        </Button>
      </Space>

      {/* Weekly calendar table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={sortedUsers}
        loading={isLoading}
        pagination={false}
        scroll={{ x: 900 }}
        size="small"
        bordered
        locale={{ emptyText: t('common.noData', 'No data available') }}
      />

      {/* Day Detail Drawer */}
      <Drawer
        title={`${t('roster.teamAvailability', 'Team Availability')} - ${
          drawerDate ? dayjs(drawerDate).format('dddd, DD MMM YYYY') : ''
        }`}
        open={!!drawerDate}
        onClose={() => setDrawerDate(null)}
        width={480}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Radio.Group
            value={drawerShift}
            onChange={(e) => setDrawerShift(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="all">{t('common.all', 'All')}</Radio.Button>
            <Radio.Button value="day">{t('roster.dayShift', 'Day')}</Radio.Button>
            <Radio.Button value="night">{t('roster.nightShift', 'Night')}</Radio.Button>
          </Radio.Group>

          {dayLoading ? (
            <Text type="secondary">{t('common.loading', 'Loading...')}</Text>
          ) : (
            <Collapse
              defaultActiveKey={['available', 'on_leave', 'off']}
              items={[
                {
                  key: 'available',
                  label: (
                    <Space>
                      <Badge status="success" />
                      {t('roster.available', 'Available')}
                      <Tag>{dayAvailability?.available?.length ?? 0}</Tag>
                    </Space>
                  ),
                  children: (
                    <>
                      {(dayAvailability?.available ?? []).length === 0 ? (
                        <Text type="secondary">{t('common.noData', 'No data')}</Text>
                      ) : (
                        (dayAvailability?.available ?? []).map((u) => (
                          <div
                            key={u.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 0',
                              borderBottom: '1px solid #f0f0f0',
                            }}
                          >
                            <Space direction="vertical" size={0}>
                              <Text strong>{u.full_name}</Text>
                              <Space size={4}>
                                <Tag color={ROLE_COLORS[u.role] ?? 'default'}>{u.role}</Tag>
                                {u.specialization && <Tag>{u.specialization}</Tag>}
                              </Space>
                            </Space>
                            {u.shift === 'day' ? (
                              <Tag color="blue">Day</Tag>
                            ) : (
                              <Tag color="purple">Night</Tag>
                            )}
                          </div>
                        ))
                      )}
                    </>
                  ),
                },
                {
                  key: 'on_leave',
                  label: (
                    <Space>
                      <Badge status="error" />
                      {t('roster.onLeave', 'On Leave')}
                      <Tag>{dayAvailability?.on_leave?.length ?? 0}</Tag>
                    </Space>
                  ),
                  children: (
                    <>
                      {(dayAvailability?.on_leave ?? []).length === 0 ? (
                        <Text type="secondary">{t('common.noData', 'No data')}</Text>
                      ) : (
                        (dayAvailability?.on_leave ?? []).map((u) => (
                          <div
                            key={u.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 0',
                              borderBottom: '1px solid #f0f0f0',
                            }}
                          >
                            <Space direction="vertical" size={0}>
                              <Text strong>{u.full_name}</Text>
                              <Space size={4}>
                                <Tag color={ROLE_COLORS[u.role] ?? 'default'}>{u.role}</Tag>
                                {u.specialization && <Tag>{u.specialization}</Tag>}
                              </Space>
                            </Space>
                          </div>
                        ))
                      )}
                    </>
                  ),
                },
                {
                  key: 'off',
                  label: (
                    <Space>
                      <Badge status="default" />
                      {t('roster.offDuty', 'Off')}
                      <Tag>{dayAvailability?.off?.length ?? 0}</Tag>
                    </Space>
                  ),
                  children: (
                    <>
                      {(dayAvailability?.off ?? []).length === 0 ? (
                        <Text type="secondary">{t('common.noData', 'No data')}</Text>
                      ) : (
                        (dayAvailability?.off ?? []).map((u) => (
                          <div
                            key={u.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 0',
                              borderBottom: '1px solid #f0f0f0',
                            }}
                          >
                            <Space direction="vertical" size={0}>
                              <Text strong>{u.full_name}</Text>
                              <Space size={4}>
                                <Tag color={ROLE_COLORS[u.role] ?? 'default'}>{u.role}</Tag>
                                {u.specialization && <Tag>{u.specialization}</Tag>}
                              </Space>
                            </Space>
                          </div>
                        ))
                      )}
                    </>
                  ),
                },
              ]}
            />
          )}
        </Space>
      </Drawer>

      {/* Upload Result Modal */}
      <Modal
        title={t('roster.uploadResult', 'Roster Upload Result')}
        open={uploadResult !== null}
        onCancel={() => setUploadResult(null)}
        onOk={() => setUploadResult(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {uploadResult && (
          <>
            <p>
              <strong>{uploadResult.imported}</strong>{' '}
              {t('roster.entriesImported', 'entries imported')} {t('roster.forUsers', 'for')}{' '}
              <strong>{uploadResult.users_processed}</strong> {t('roster.users', 'users')}.
            </p>
            {uploadResult.errors.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={t('roster.uploadWarnings', '{{count}} warnings', {
                  count: uploadResult.errors.length,
                })}
                description={
                  <ul
                    style={{
                      maxHeight: 200,
                      overflow: 'auto',
                      paddingLeft: 16,
                      margin: 0,
                    }}
                  >
                    {uploadResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </>
        )}
      </Modal>
    </Card>
  );
}
