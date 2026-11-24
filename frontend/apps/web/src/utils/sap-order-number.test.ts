import { describe, expect, it } from 'vitest';
import { sapOrderNumber } from './sap-order-number';

describe('the SAP order number a card shows', () => {
  it('shows it for a job on a day', () => {
    expect(sapOrderNumber({ sap_order_number: '700001896146', sap_order_type: 'PRM' }))
      .toBe('700001896146');
  });

  it('shows it for a pool order, PRM or a fault from SAP', () => {
    expect(sapOrderNumber({ order_number: '700001896146', order_type: 'PRM' })).toBe('700001896146');
    expect(sapOrderNumber({ order_number: '700001900001', order_type: 'COM', job_type: 'defect' }))
      .toBe('700001900001');
  });

  it('shows nothing for a hand-typed job, which has no SAP number', () => {
    expect(sapOrderNumber({ sap_order_number: 'MAN-6-9', is_manual: true })).toBeNull();
    expect(sapOrderNumber({ order_number: 'MAN-6-9', is_manual: true })).toBeNull();
  });

  it('shows nothing for an app defect or an empty job', () => {
    expect(sapOrderNumber({ defect: { id: 4 } })).toBeNull();
    expect(sapOrderNumber({ sap_order_number: null })).toBeNull();
    expect(sapOrderNumber(null)).toBeNull();
  });
});
