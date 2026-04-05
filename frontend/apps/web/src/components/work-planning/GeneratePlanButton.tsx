import React, { useState } from 'react';
import { Button, Dropdown, Modal, message, Spin } from 'antd';
import { ThunderboltOutlined, LoadingOutlined } from '@ant-design/icons';
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
    description: 'Clone last week\'s structure',
  },
];

interface GeneratePlanButtonProps {
  planId: number;
  planStatus: string;
  onGenerated: (result: GenerationResult) => void;
}

export const GeneratePlanButton: React.FC<GeneratePlanButtonProps> = ({
  planId,
  planStatus,
  onGenerated,
}) => {
  const [loading, setLoading] = useState(false);
  const [pendingRecipe, setPendingRecipe] = useState<PlanRecipe | null>(null);

  const isDisabled = planStatus === 'published';

  const handleRecipeClick = (recipe: PlanRecipe) => {
    setPendingRecipe(recipe);
  };

  const handleConfirmGenerate = async () => {
    if (!pendingRecipe) return;

    setLoading(true);
    setPendingRecipe(null);

    try {
      const response = await workPlansApi.generatePlan(planId, pendingRecipe, false);
      const result = response.data;
      message.success(
        `Plan generated: ${result.summary.scheduled} of ${result.summary.total_candidates} jobs scheduled`
      );
      onGenerated(result);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Generation failed';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
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
    </>
  );
};
