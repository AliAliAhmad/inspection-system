import React, { useState } from 'react';
import { Button, Dropdown, Modal, message, Spin, Tag, Tooltip } from 'antd';
import {
  ThunderboltOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  PauseCircleOutlined,
  PlayCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { workPlansApi } from '@inspection/shared';
import type { PlanRecipe, GenerationResult } from '@inspection/shared';

interface RecipeOption {
  key: PlanRecipe;
  icon: string;
  label: string;
  description: string;
}

const RECIPES: RecipeOption[] = [
  {
    key: 'priority_first',
    icon: '\uD83C\uDFAF',
    label: 'Priority First',
    description: 'Schedule highest priority jobs first',
  },
  {
    key: 'travel_optimized',
    icon: '\uD83D\uDEA2',
    label: 'Travel Optimized',
    description: 'Group by berth/location per day',
  },
  {
    key: 'team_balanced',
    icon: '\u2696\uFE0F',
    label: 'Team Balanced',
    description: 'Distribute evenly across workers',
  },
  {
    key: 'pm_compliance',
    icon: '\uD83D\uDD27',
    label: 'PM Compliance',
    description: 'Prioritize overdue PMs',
  },
  {
    key: 'copy_last_week',
    icon: '\uD83D\uDCCB',
    label: 'Copy Last Week',
    description: "Clone last week's structure",
  },
  {
    key: 'combined',
    icon: '\uD83E\uDDE9',
    label: 'Combined (3 Steps)',
    description: 'Manual: PMs → urgent defects → normal defects',
  },
];

interface GeneratePlanButtonProps {
  planId: number;
  planStatus: string;
  onGenerated: (result: GenerationResult) => void;
}

type StepNumber = 1 | 2 | 3;

interface CombinedStepConfig {
  step: StepNumber;
  title: string;
  description: string;
  icon: string;
}

const COMBINED_STEPS: CombinedStepConfig[] = [
  {
    step: 1,
    title: 'Step 1 — PMs + their defects',
    description:
      'Schedule all preventive maintenance jobs. Defects on the same equipment ride along automatically.',
    icon: '\uD83D\uDD27',
  },
  {
    step: 2,
    title: 'Step 2 — Urgent defects',
    description:
      'Add critical and high severity defects on equipment that has no PM scheduled this week.',
    icon: '\u26A0\uFE0F',
  },
  {
    step: 3,
    title: 'Step 3 — Normal defects',
    description:
      'Add medium and low severity defects on equipment that has no scheduled job yet.',
    icon: '\uD83D\uDCDD',
  },
];

export const GeneratePlanButton: React.FC<GeneratePlanButtonProps> = ({
  planId,
  planStatus,
  onGenerated,
}) => {
  // State for the simple recipes (existing 5)
  const [loading, setLoading] = useState(false);
  const [pendingRecipe, setPendingRecipe] = useState<PlanRecipe | null>(null);

  // State for the Combined recipe stepper
  const [combinedOpen, setCombinedOpen] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<StepNumber>>(new Set());
  const [runningStep, setRunningStep] = useState<StepNumber | null>(null);
  const [stepResults, setStepResults] = useState<Record<StepNumber, number>>({} as Record<StepNumber, number>);

  const isDisabled = planStatus === 'published';

  const handleRecipeClick = (recipe: PlanRecipe) => {
    if (recipe === 'combined') {
      // Open the 3-step stepper modal instead of the simple confirm modal
      setCompletedSteps(new Set());
      setStepResults({} as Record<StepNumber, number>);
      setRunningStep(null);
      setCombinedOpen(true);
      return;
    }
    setPendingRecipe(recipe);
  };

  // ── Simple recipe confirmation (existing 5 recipes) ────────────────────
  const handleConfirmGenerate = async () => {
    if (!pendingRecipe) return;

    setLoading(true);
    setPendingRecipe(null);

    try {
      const response = await workPlansApi.generatePlan(planId, pendingRecipe, false);
      const result = response.data;
      message.success(
        `Plan generated: ${result.summary.scheduled} of ${result.summary.total_candidates} jobs scheduled`,
      );
      onGenerated(result);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Generation failed';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // ── Combined recipe — run a single step ────────────────────────────────
  const runCombinedStep = async (step: StepNumber) => {
    setRunningStep(step);
    try {
      const response = await workPlansApi.generatePlan(
        planId,
        'combined',
        false,
        { step, additive: step > 1 },
      );
      const result = response.data;
      setCompletedSteps((prev) => new Set(prev).add(step));
      setStepResults((prev) => ({ ...prev, [step]: result.summary.scheduled }));
      message.success(`Step ${step} done — ${result.summary.scheduled} jobs scheduled`);
      onGenerated(result);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || `Step ${step} failed`;
      message.error(errorMsg);
    } finally {
      setRunningStep(null);
    }
  };

  // A step is enabled when: nothing is running AND all previous steps are completed
  const isStepEnabled = (step: StepNumber): boolean => {
    if (runningStep !== null) return false;
    if (completedSteps.has(step)) return true; // Allow re-clicking? No — block re-runs
    for (let prev = 1; prev < step; prev++) {
      if (!completedSteps.has(prev as StepNumber)) return false;
    }
    return true;
  };

  const menuItems = RECIPES.map((recipe) => ({
    key: recipe.key,
    label: (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0' }}>
        <span style={{ fontSize: 18, lineHeight: '22px', flexShrink: 0 }}>{recipe.icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#262626', lineHeight: '18px' }}>
            {recipe.label}
          </span>
          <span style={{ fontSize: 11, color: '#8c8c8c', lineHeight: '16px' }}>
            {recipe.description}
          </span>
        </div>
      </div>
    ),
    onClick: () => handleRecipeClick(recipe.key),
  }));

  return (
    <>
      <Dropdown
        menu={{ items: menuItems }}
        trigger={['click']}
        disabled={isDisabled || loading}
        placement="bottomRight"
      >
        <Button
          size="small"
          type="primary"
          disabled={isDisabled}
          style={{
            background: loading
              ? '#d9d9d9'
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderColor: loading ? '#d9d9d9' : '#667eea',
            color: '#fff',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.2s ease',
            boxShadow: loading ? 'none' : '0 2px 6px rgba(102, 126, 234, 0.3)',
          }}
        >
          {loading ? (
            <>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 12, color: '#fff' }} spin />} size="small" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <ThunderboltOutlined />
              <span>Generate Plan</span>
            </>
          )}
        </Button>
      </Dropdown>

      {/* ── Simple recipe confirmation modal (5 existing recipes) ── */}
      <Modal
        open={!!pendingRecipe}
        title="Generate Smart Plan"
        okText="Generate"
        cancelText="Cancel"
        onOk={handleConfirmGenerate}
        onCancel={() => setPendingRecipe(null)}
        okButtonProps={{
          style: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderColor: '#667eea',
          },
        }}
        width={460}
      >
        <div style={{ padding: '8px 0' }}>
          {pendingRecipe && (() => {
            const recipe = RECIPES.find((r) => r.key === pendingRecipe);
            if (!recipe) return null;
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: '#f6f8ff',
                  borderRadius: 8,
                  border: '1px solid #e8ecff',
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: 24 }}>{recipe.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
                    {recipe.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{recipe.description}</div>
                </div>
              </div>
            );
          })()}
          <p style={{ margin: 0, fontSize: 13, color: '#595959', lineHeight: '20px' }}>
            This will auto-schedule jobs from the pool into the weekly calendar.
            Existing manual placements will be kept.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8c8c8c', lineHeight: '18px' }}>
            You can reject the generated plan and revert all AI-placed jobs at any time.
          </p>
        </div>
      </Modal>

      {/* ── Combined recipe 3-step stepper modal ── */}
      <Modal
        open={combinedOpen}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🧩</span>
            <span>Combined Plan — Manual 3 Steps</span>
          </div>
        }
        onCancel={() => setCombinedOpen(false)}
        footer={
          <Button onClick={() => setCombinedOpen(false)}>
            {completedSteps.size === 3 ? 'Done' : 'Close'}
          </Button>
        }
        width={560}
        maskClosable={runningStep === null}
        closable={runningStep === null}
      >
        <div style={{ padding: '4px 0' }}>
          {/* Info banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '8px 12px',
              background: '#f0f5ff',
              border: '1px solid #d6e4ff',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 12,
              color: '#595959',
              lineHeight: '18px',
            }}
          >
            <InfoCircleOutlined style={{ color: '#1890ff', fontSize: 14, marginTop: 2 }} />
            <div>
              Each step assigns the suitable team automatically.
              <br />
              <strong>Materials are added manually</strong> after generation (the auto-planner
              does not assign materials yet).
            </div>
          </div>

          {/* Step cards */}
          {COMBINED_STEPS.map((cfg) => {
            const isDone = completedSteps.has(cfg.step);
            const isRunning = runningStep === cfg.step;
            const enabled = isStepEnabled(cfg.step);
            const scheduled = stepResults[cfg.step];

            return (
              <div
                key={cfg.step}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  marginBottom: 10,
                  background: isDone ? '#f6ffed' : enabled ? '#fff' : '#fafafa',
                  border: `1px solid ${isDone ? '#b7eb8f' : enabled ? '#d9d9d9' : '#f0f0f0'}`,
                  borderRadius: 8,
                  transition: 'all 0.2s ease',
                  opacity: enabled || isDone ? 1 : 0.55,
                }}
              >
                {/* Status icon */}
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  {isDone ? (
                    <CheckCircleFilled style={{ fontSize: 22, color: '#52c41a' }} />
                  ) : enabled ? (
                    <PlayCircleOutlined style={{ fontSize: 22, color: '#1890ff' }} />
                  ) : (
                    <PauseCircleOutlined style={{ fontSize: 22, color: '#bfbfbf' }} />
                  )}
                </div>

                {/* Step body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
                      {cfg.title}
                    </span>
                    {isDone && scheduled !== undefined && (
                      <Tag color="success" style={{ marginLeft: 'auto', fontSize: 11 }}>
                        {scheduled} scheduled
                      </Tag>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#8c8c8c',
                      lineHeight: '18px',
                      marginBottom: 10,
                    }}
                  >
                    {cfg.description}
                  </div>

                  {/* Run button */}
                  {!isDone && (
                    <Tooltip
                      title={
                        !enabled && runningStep === null
                          ? `Complete previous step first`
                          : ''
                      }
                    >
                      <Button
                        type="primary"
                        size="small"
                        loading={isRunning}
                        disabled={!enabled}
                        onClick={() => runCombinedStep(cfg.step)}
                        icon={!isRunning ? <ThunderboltOutlined /> : undefined}
                        style={
                          enabled && !isRunning
                            ? {
                                background:
                                  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderColor: '#667eea',
                              }
                            : undefined
                        }
                      >
                        {isRunning ? `Running Step ${cfg.step}...` : `Run Step ${cfg.step}`}
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })}

          {/* Footer hint */}
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: '#8c8c8c',
              textAlign: 'center',
              lineHeight: '16px',
            }}
          >
            You can stop after any step. Use <strong>Reject</strong> in the action bar to
            clear all AI-placed jobs.
          </div>
        </div>
      </Modal>
    </>
  );
};
