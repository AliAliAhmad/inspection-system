/**
 * MonitorFollowupForm.tsx
 * Reusable inline form for scheduling a monitor follow-up inspection.
 * Shown inside engineer verdict or admin resolve modals when verdict = "monitor".
 *
 * Auto-fills mechanical/electrical inspectors based on selected date, shift, and location.
 */
import React, { useEffect } from 'react';
import { DatePicker, Form, Input, Radio, Select, Spin } from 'antd';
import type { FormInstance } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { monitorFollowupsApi } from '@inspection/shared';
import type {
  FollowupType,
  FollowupLocation,
  AvailableInspector,
} from '@inspection/shared';
import dayjs from 'dayjs';

const { TextArea } = Input;

interface MonitorFollowupFormProps {
  form: FormInstance;
  compact?: boolean;
}

const FOLLOWUP_TYPES: FollowupType[] = [
  'routine_check',
  'detailed_inspection',
  'operational_test',
];

const LOCATIONS: FollowupLocation[] = ['east', 'west'];

const SHIFTS = ['day', 'night'] as const;

const MonitorFollowupForm: React.FC<MonitorFollowupFormProps> = ({ form, compact = false }) => {
  const { t } = useTranslation();

  const followupDate = Form.useWatch('followup_date', form);
  const location = Form.useWatch('location', form);
  const shift = Form.useWatch('shift', form);

  // Derive the ISO date string used for the API call
  const dateString = followupDate ? dayjs(followupDate).format('YYYY-MM-DD') : undefined;

  // Fetch available inspectors when date is selected (location and shift are optional filters)
  const {
    data: inspectorsData,
    isLoading: inspectorsLoading,
    isFetched: inspectorsFetched,
  } = useQuery({
    queryKey: ['available-inspectors', dateString, shift, location],
    queryFn: () =>
      monitorFollowupsApi.getAvailableInspectors({
        date: dateString!,
        shift: shift || undefined,
        location: location || undefined,
      }),
    enabled: !!dateString,
  });

  const responseData = (inspectorsData?.data as any)?.data ?? inspectorsData?.data;
  const mechanicalInspectors: AvailableInspector[] =
    responseData?.mechanical ?? [];
  const electricalInspectors: AvailableInspector[] =
    responseData?.electrical ?? [];

  // Auto-fill inspectors when available inspectors change
  useEffect(() => {
    if (!responseData) return;

    const currentMech = form.getFieldValue('mechanical_inspector_id');
    const currentElec = form.getFieldValue('electrical_inspector_id');

    // Only auto-fill if not already set or if the current value is no longer available
    if (
      mechanicalInspectors.length > 0 &&
      (!currentMech || !mechanicalInspectors.some((i) => i.id === currentMech))
    ) {
      form.setFieldValue('mechanical_inspector_id', mechanicalInspectors[0].id);
    }

    if (
      electricalInspectors.length > 0 &&
      (!currentElec || !electricalInspectors.some((i) => i.id === currentElec))
    ) {
      form.setFieldValue('electrical_inspector_id', electricalInspectors[0].id);
    }
  }, [inspectorsData, mechanicalInspectors, electricalInspectors, form]);

  const renderInspectorOption = (inspector: AvailableInspector) => (
    <Select.Option key={inspector.id} value={inspector.id}>
      {inspector.name}
      {inspector.employee_id ? ` (${inspector.employee_id})` : ''}
      {inspector.workload > 0 ? ` - ${inspector.workload} ${t('monitor_followup.scheduled').toLowerCase()}` : ''}
    </Select.Option>
  );

  return (
    <Form
      form={form}
      layout="vertical"
      style={compact ? { padding: 0 } : undefined}
    >
      {/* Follow-up Date */}
      <Form.Item
        name="followup_date"
        label={t('monitor_followup.followup_date')}
        rules={[
          { required: true, message: t('monitor_followup.select_date_first') },
          {
            validator: (_, value) => {
              if (!value) return Promise.resolve();
              if (dayjs(value).isBefore(dayjs(), 'day')) {
                return Promise.reject(
                  new Error(t('monitor_followup.followup_date') + ' - future date required'),
                );
              }
              return Promise.resolve();
            },
          },
        ]}
      >
        <DatePicker
          style={{ width: '100%' }}
          disabledDate={(current) => current && current < dayjs().startOf('day')}
          format="YYYY-MM-DD"
        />
      </Form.Item>

      {/* Follow-up Type */}
      <Form.Item
        name="followup_type"
        label={t('monitor_followup.followup_type')}
        rules={[{ required: true }]}
        initialValue="routine_check"
      >
        <Select>
          {FOLLOWUP_TYPES.map((type) => (
            <Select.Option key={type} value={type}>
              {t(`monitor_followup.${type}`)}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      {/* Location */}
      <Form.Item
        name="location"
        label={t('monitor_followup.location')}
        rules={[{ required: true }]}
      >
        <Radio.Group>
          {LOCATIONS.map((loc) => (
            <Radio.Button key={loc} value={loc}>
              {t(`monitor_followup.${loc}`)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>

      {/* Shift */}
      <Form.Item
        name="shift"
        label={t('monitor_followup.shift')}
      >
        <Radio.Group>
          {SHIFTS.map((s) => (
            <Radio.Button key={s} value={s}>
              {t(`monitor_followup.${s}`)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>

      {/* Mechanical Inspector */}
      <Form.Item
        name="mechanical_inspector_id"
        label={t('monitor_followup.mechanical_inspector')}
      >
        <Spin spinning={inspectorsLoading}>
          <Select
            placeholder={
              !dateString
                ? t('monitor_followup.select_date_first')
                : inspectorsFetched && mechanicalInspectors.length === 0
                  ? t('monitor_followup.no_inspectors')
                  : t('monitor_followup.mechanical_inspector')
            }
            disabled={!dateString}
            allowClear
            notFoundContent={
              inspectorsLoading ? (
                <Spin size="small" />
              ) : (
                t('monitor_followup.no_inspectors')
              )
            }
          >
            {mechanicalInspectors.map(renderInspectorOption)}
          </Select>
        </Spin>
      </Form.Item>

      {/* Electrical Inspector */}
      <Form.Item
        name="electrical_inspector_id"
        label={t('monitor_followup.electrical_inspector')}
      >
        <Spin spinning={inspectorsLoading}>
          <Select
            placeholder={
              !dateString
                ? t('monitor_followup.select_date_first')
                : inspectorsFetched && electricalInspectors.length === 0
                  ? t('monitor_followup.no_inspectors')
                  : t('monitor_followup.electrical_inspector')
            }
            disabled={!dateString}
            allowClear
            notFoundContent={
              inspectorsLoading ? (
                <Spin size="small" />
              ) : (
                t('monitor_followup.no_inspectors')
              )
            }
          >
            {electricalInspectors.map(renderInspectorOption)}
          </Select>
        </Spin>
      </Form.Item>

      {/* Notes */}
      <Form.Item
        name="notes"
        label={t('monitor_followup.notes')}
      >
        <TextArea rows={compact ? 2 : 3} />
      </Form.Item>
    </Form>
  );
};

export default MonitorFollowupForm;
