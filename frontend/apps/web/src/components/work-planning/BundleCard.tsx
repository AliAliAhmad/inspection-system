import React, { useState } from 'react';
import { Tag, Tooltip, Typography, Badge } from 'antd';
import { CSS } from '@dnd-kit/utilities';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { WorkPlanJob } from '@inspection/shared';

const { Text } = Typography;

interface BundleCardProps {
  /** All jobs that share the same equipment_id (or one orphan job) */
  jobs: WorkPlanJob[];
  /** equipment_id used as the bundle key (null/0 for orphans) */
  equipmentId: number | null;
  dayId: number;
  /** Click any individual job in the expanded view to open detail modal */
  onJobClick: (job: WorkPlanJob) => void;
  /** Initial expanded state (default false) */
  defaultExpanded?: boolean;
}

/** Pull team category (mech / elec) from the assignment user.specialization */
const teamCategoryOf = (user: any): 'mech' | 'elec' | 'other' => {
  const spec = (user?.specialization || '').toLowerCase();
  if (spec.includes('mech')) return 'mech';
  if (spec.includes('elec')) return 'elec';
  return 'other';
};

const isAcServiceJob = (job: WorkPlanJob): boolean => {
  const desc = (job.description || '').toUpperCase();
  return ` ${desc} `.includes(' AC ') || desc.includes('AC SYSTEM');
};

const equipmentDisplayName = (job: WorkPlanJob): string =>
  (job as any).equipment?.name ||
  (job as any).equipment_name ||
  (job as any).defect?.equipment?.name ||
  (job as any).inspection_assignment?.equipment?.name ||
  (job as any).equipment?.serial_number ||
  (job.description?.split(' - ')[0]?.trim()) ||
  `Job #${job.id}`;

const stripEquipmentPrefix = (raw: string, eq: string): string => {
  if (!raw || !eq || eq.startsWith('Job #')) return raw;
  if (raw.startsWith(eq)) return raw.slice(eq.length).replace(/^[\s\-_.]+/, '').trim();
  return raw;
};

/** Decide which sub-team a job belongs to (mech / elec / both)
 *  Priority order:
 *  1. job.work_center field (ELEC, MECH, ELME)
 *  2. AC PM detection (always elec only)
 *  3. defect.category for inspection defects
 *  4. PM with no other signal → both teams
 */
const subTeamForJob = (job: WorkPlanJob): 'mech' | 'elec' | 'both' => {
  // 1. Explicit work_center wins
  const wc = ((job as any).work_center || '').toUpperCase();
  if (wc === 'ELEC') return 'elec';
  if (wc === 'MECH') return 'mech';
  if (wc === 'ELME') return 'both';

  // 2. AC service is always electrical only
  if (job.job_type === 'pm' && isAcServiceJob(job)) return 'elec';

  // 3. Defect from inspection uses defect.category
  if (job.job_type === 'defect') {
    const cat = (job as any).defect?.category;
    if (cat === 'electrical') return 'elec';
    return 'mech';
  }

  // 4. Regular PM with no signal → both teams work on it in parallel
  return 'both';
};

interface IndividualJobRowProps {
  job: WorkPlanJob;
  dayId: number;
  onJobClick: (job: WorkPlanJob) => void;
  expanded: boolean;
}

const IndividualJobRow: React.FC<IndividualJobRowProps> = ({ job, dayId, onJobClick, expanded }) => {
  const isOverdue = (job as any).overdue_value && (job as any).overdue_value > 0;
  const jobName = stripEquipmentPrefix(
    job.description || (job as any).defect?.description || '',
    equipmentDisplayName(job)
  );

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `plan-job-${job.id}`,
    data: { type: 'job', job, dayId },
  });
  const { setNodeRef: setDropRef, isOver: isEmployeeOver } = useDroppable({
    id: `droppable-job-${job.id}`,
    data: { type: 'job', job, dayId },
  });
  const setNodeRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const tagColor =
    job.job_type === 'defect'
      ? (job as any).defect?.severity === 'critical'
        ? 'magenta'
        : (job as any).defect?.severity === 'high'
        ? 'red'
        : (job as any).defect?.severity === 'medium'
        ? 'orange'
        : 'gold'
      : isAcServiceJob(job)
      ? 'cyan'
      : 'blue';

  const tagLabel =
    job.job_type === 'defect'
      ? 'DEF'
      : isAcServiceJob(job)
      ? 'AC PM'
      : 'PM';

  if (!expanded) return null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onJobClick(job);
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 4,
        padding: '4px 6px',
        marginBottom: 3,
        background: isDragging ? '#e6f7ff' : isEmployeeOver ? '#f9f0ff' : '#fff',
        border: `1px solid ${
          isDragging ? '#1890ff' : isEmployeeOver ? '#722ed1' : isOverdue ? '#ffccc7' : '#f0f0f0'
        }`,
        borderRadius: 4,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Translate.toString(transform),
      }}
    >
      {/* Drag handle */}
      <span
        style={{
          color: '#bfbfbf',
          fontSize: 11,
          lineHeight: 1.2,
          cursor: 'grab',
          flexShrink: 0,
          marginTop: 1,
        }}
        title="Drag to another day"
      >
        ≡
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Job header: tag + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <Tag color={tagColor} style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}>
            {tagLabel}
          </Tag>
          {job.estimated_hours ? (
            <Text style={{ fontSize: 9, color: '#8c8c8c', flexShrink: 0 }}>
              {job.estimated_hours}h
            </Text>
          ) : null}
          {isOverdue && (
            <Text style={{ fontSize: 9, color: '#ff4d4f', fontWeight: 700 }}>
              {(job as any).overdue_value}d!
            </Text>
          )}
        </div>

        {/* Job description */}
        <Text
          style={{
            fontSize: 11,
            color: '#262626',
            display: 'block',
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}
        >
          {jobName || (job.job_type === 'defect' ? 'Defect repair' : 'Preventive maintenance')}
        </Text>

        {/* Materials chips */}
        {(job.materials || []).length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              marginTop: 3,
            }}
          >
            {(job.materials || []).slice(0, 4).map((m) => {
              const mat: any = (m as any).material;
              const code = mat?.code || mat?.name || 'MAT';
              return (
                <span
                  key={m.id}
                  style={{
                    fontSize: 8,
                    padding: '0 4px',
                    borderRadius: 2,
                    background: '#e6f4ff',
                    color: '#1677ff',
                    fontFamily: 'monospace',
                    border: '1px solid #bae0ff',
                  }}
                >
                  {code} ×{(m as any).quantity || 1}
                </span>
              );
            })}
            {(job.materials || []).length > 4 && (
              <span style={{ fontSize: 8, color: '#8c8c8c' }}>
                +{(job.materials || []).length - 4}
              </span>
            )}
          </div>
        )}

        {/* Notes */}
        {job.notes && (
          <Text
            style={{
              fontSize: 9,
              color: '#8c8c8c',
              fontStyle: 'italic',
              display: 'block',
              marginTop: 2,
            }}
          >
            📝 {job.notes.substring(0, 50)}
          </Text>
        )}

        {/* Assigned workers (avatars) */}
        {(job.assignments || []).length > 0 && (
          <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
            {(job.assignments || []).slice(0, 4).map((a) => (
              <Tooltip key={a.id} title={`${a.user?.full_name || 'User'}${a.is_lead ? ' ★ Lead' : ''}`}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    fontSize: 8,
                    fontWeight: 700,
                    background: a.is_lead ? '#faad14' : '#1890ff',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'default',
                  }}
                >
                  {(a.user?.full_name || '?')
                    .split(' ')
                    .map((w: string) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
              </Tooltip>
            ))}
            {(job.assignments || []).length > 4 && (
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  fontSize: 8,
                  background: '#d9d9d9',
                  color: '#595959',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                +{(job.assignments || []).length - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const BundleCard: React.FC<BundleCardProps> = ({
  jobs,
  equipmentId,
  dayId,
  onJobClick,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Bundle drag (drag the whole bundle to another day)
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `plan-bundle-${equipmentId || jobs[0]?.id}-${dayId}`,
    data: { type: 'bundle', jobs, dayId, equipmentId },
  });

  // Pull stats
  const pmCount = jobs.filter((j) => j.job_type === 'pm').length;
  const defectCount = jobs.filter((j) => j.job_type === 'defect').length;
  const totalHours = jobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0);
  const hasOverdue = jobs.some((j) => (j as any).overdue_value && (j as any).overdue_value > 0);

  // Determine bundle type — PM bundle if any PM, else defect bundle
  const isPmBundle = pmCount > 0;

  // Equipment name (from first job)
  const equipmentName = equipmentDisplayName(jobs[0]);

  // Stripe color
  const stripeColor = isPmBundle ? '#16a085' : '#c0392b';

  // Group jobs into mech / elec sub-teams for the team summary.
  // Jobs with subTeam='both' (e.g. regular PM that needs both teams) appear in BOTH lists.
  const mechJobs = jobs.filter((j) => {
    const t = subTeamForJob(j);
    return t === 'mech' || t === 'both';
  });
  const elecJobs = jobs.filter((j) => {
    const t = subTeamForJob(j);
    return t === 'elec' || t === 'both';
  });

  // Pull lead names from assignments
  const findLead = (jobsList: WorkPlanJob[]): string | null => {
    for (const j of jobsList) {
      const lead = (j.assignments || []).find((a) => a.is_lead);
      if (lead) return lead.user?.full_name || null;
    }
    return null;
  };

  const mechLead = findLead(mechJobs);
  const elecLead = findLead(elecJobs);

  // Count unique workers per sub-team
  const uniqueWorkers = (jobsList: WorkPlanJob[]): Set<number> => {
    const ids = new Set<number>();
    jobsList.forEach((j) => {
      (j.assignments || []).forEach((a) => {
        if (a.user_id) ids.add(a.user_id);
      });
    });
    return ids;
  };
  const mechWorkers = uniqueWorkers(mechJobs);
  const elecWorkers = uniqueWorkers(elecJobs);

  // Material count (sum across jobs)
  const totalMaterials = jobs.reduce((sum, j) => sum + (j.materials || []).length, 0);

  return (
    <div
      ref={setDragRef}
      style={{
        display: 'flex',
        marginBottom: 4,
        background: isDragging ? '#e6f7ff' : '#fff',
        borderRadius: 5,
        border: `1px solid ${expanded ? '#1677ff' : hasOverdue ? '#ffccc7' : '#e8e8e8'}`,
        boxShadow: expanded ? '0 0 0 2px rgba(22,119,255,0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        opacity: isDragging ? 0.5 : 1,
        transform: CSS.Translate.toString(transform),
        overflow: 'hidden',
      }}
    >
      {/* Left stripe */}
      <div
        style={{
          width: 4,
          background: stripeColor,
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header (clickable to expand/collapse) */}
        <div
          {...listeners}
          {...attributes}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          style={{
            padding: '5px 7px',
            userSelect: 'none',
          }}
        >
          {/* Equipment name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 4,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#0f1e3d',
                background: '#fffbe6',
                padding: '0 4px',
                borderRadius: 2,
                lineHeight: 1.25,
                wordBreak: 'break-word',
                flex: 1,
              }}
            >
              {equipmentName}
            </Text>
            <span style={{ fontSize: 10, color: '#8c8c8c', flexShrink: 0 }}>
              {expanded ? '▲' : '▼'}
            </span>
          </div>

          {/* Badges row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              marginTop: 3,
              flexWrap: 'wrap',
            }}
          >
            {pmCount > 0 && (
              <Tag
                color="cyan"
                style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}
              >
                {pmCount} PM
              </Tag>
            )}
            {defectCount > 0 && (
              <Tag
                color="red"
                style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}
              >
                {defectCount} DEF
              </Tag>
            )}
            {totalHours > 0 && (
              <Text style={{ fontSize: 9, color: '#8c8c8c' }}>
                · {totalHours}h
              </Text>
            )}
            {hasOverdue && (
              <Text style={{ fontSize: 9, color: '#ff4d4f', fontWeight: 700 }}>
                · OVERDUE
              </Text>
            )}
          </div>

          {/* Compact team line */}
          {!expanded && (
            <div style={{ marginTop: 3 }}>
              {mechWorkers.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#595959' }}>
                  <span style={{ color: '#1677ff' }}>🔧</span>
                  <Text style={{ fontSize: 9, color: '#262626', fontWeight: 600 }}>
                    {mechLead ? mechLead.split(' ')[0] : '—'}
                    {mechLead && ' ★'}
                  </Text>
                  {mechWorkers.size > 1 && (
                    <Text style={{ fontSize: 9, color: '#8c8c8c' }}>
                      +{mechWorkers.size - (mechLead ? 1 : 0)}
                    </Text>
                  )}
                </div>
              )}
              {elecWorkers.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#595959' }}>
                  <span style={{ color: '#fa8c16' }}>⚡</span>
                  <Text style={{ fontSize: 9, color: '#262626', fontWeight: 600 }}>
                    {elecLead ? elecLead.split(' ')[0] : '—'}
                    {elecLead && ' ★'}
                  </Text>
                  {elecWorkers.size > 1 && (
                    <Text style={{ fontSize: 9, color: '#8c8c8c' }}>
                      +{elecWorkers.size - (elecLead ? 1 : 0)}
                    </Text>
                  )}
                </div>
              )}
              {mechWorkers.size === 0 && elecWorkers.size === 0 && (
                <Text style={{ fontSize: 9, color: '#bfbfbf', fontStyle: 'italic' }}>
                  No team assigned
                </Text>
              )}
              {totalMaterials > 0 && (
                <Text style={{ fontSize: 9, color: '#8c8c8c' }}>
                  📦 {totalMaterials} items
                </Text>
              )}
            </div>
          )}
        </div>

        {/* Expanded content */}
        {expanded && (
          <div style={{ padding: '4px 7px 7px', borderTop: '1px dashed #e8e8e8' }}>
            {/* Mech sub-team block */}
            {mechJobs.length > 0 && (
              <div
                style={{
                  marginBottom: 6,
                  background: '#f0f5ff',
                  padding: 5,
                  borderRadius: 3,
                  border: '1px solid #d6e4ff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginBottom: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#1677ff',
                  }}
                >
                  <span>🔧 MECH</span>
                  {mechLead && (
                    <Text style={{ fontSize: 9, color: '#262626', fontWeight: 600 }}>
                      {mechLead} ★
                    </Text>
                  )}
                  {mechWorkers.size > 1 && (
                    <Text style={{ fontSize: 9, color: '#8c8c8c' }}>
                      +{mechWorkers.size - 1}
                    </Text>
                  )}
                </div>
                {mechJobs.map((job) => (
                  <IndividualJobRow
                    key={job.id}
                    job={job}
                    dayId={dayId}
                    onJobClick={onJobClick}
                    expanded={true}
                  />
                ))}
              </div>
            )}

            {/* Elec sub-team block */}
            {elecJobs.length > 0 && (
              <div
                style={{
                  background: '#fff7e6',
                  padding: 5,
                  borderRadius: 3,
                  border: '1px solid #ffe7ba',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginBottom: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#fa8c16',
                  }}
                >
                  <span>⚡ ELEC</span>
                  {elecLead && (
                    <Text style={{ fontSize: 9, color: '#262626', fontWeight: 600 }}>
                      {elecLead} ★
                    </Text>
                  )}
                  {elecWorkers.size > 1 && (
                    <Text style={{ fontSize: 9, color: '#8c8c8c' }}>
                      +{elecWorkers.size - 1}
                    </Text>
                  )}
                </div>
                {elecJobs.map((job) => (
                  <IndividualJobRow
                    key={job.id}
                    job={job}
                    dayId={dayId}
                    onJobClick={onJobClick}
                    expanded={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
