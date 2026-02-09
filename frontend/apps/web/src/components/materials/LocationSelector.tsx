import { useState, useMemo } from 'react';
import { TreeSelect, Input, Space, Tag, Typography, Empty, Spin } from 'antd';
import {
  HomeOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  SearchOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, StorageLocation } from '@inspection/shared';

const { Text } = Typography;

interface LocationSelectorProps {
  value?: number;
  onChange?: (locationId: number | undefined, location?: StorageLocation) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  showRecentLocations?: boolean;
  recentLocationIds?: number[];
  style?: React.CSSProperties;
}

interface TreeNode {
  title: React.ReactNode;
  value: string;
  key: string;
  children?: TreeNode[];
  location?: StorageLocation;
  selectable?: boolean;
}

export function LocationSelector({
  value,
  onChange,
  placeholder,
  allowClear = true,
  disabled = false,
  showRecentLocations = true,
  recentLocationIds = [],
  style,
}: LocationSelectorProps) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['material-locations'],
    queryFn: () => materialsApi.getLocations(),
  });

  const locations = data?.data?.locations || [];

  // Build hierarchical tree data
  const treeData = useMemo(() => {
    const nodes: TreeNode[] = [];

    // Group by warehouse
    const warehouseMap = new Map<string, StorageLocation[]>();

    locations.forEach((loc) => {
      const warehouse = loc.warehouse || 'Default';
      if (!warehouseMap.has(warehouse)) {
        warehouseMap.set(warehouse, []);
      }
      warehouseMap.get(warehouse)!.push(loc);
    });

    // Build tree for each warehouse
    warehouseMap.forEach((locs, warehouse) => {
      const warehouseNode: TreeNode = {
        title: (
          <Space>
            <HomeOutlined />
            <Text strong>{warehouse}</Text>
          </Space>
        ),
        value: `warehouse-${warehouse}`,
        key: `warehouse-${warehouse}`,
        selectable: false,
        children: [],
      };

      // Group by zone within warehouse
      const zoneMap = new Map<string, StorageLocation[]>();
      locs.forEach((loc) => {
        const zone = loc.zone || 'General';
        if (!zoneMap.has(zone)) {
          zoneMap.set(zone, []);
        }
        zoneMap.get(zone)!.push(loc);
      });

      zoneMap.forEach((zoneLocs, zone) => {
        const zoneNode: TreeNode = {
          title: (
            <Space>
              <EnvironmentOutlined />
              {zone}
            </Space>
          ),
          value: `zone-${warehouse}-${zone}`,
          key: `zone-${warehouse}-${zone}`,
          selectable: false,
          children: zoneLocs.map((loc) => ({
            title: (
              <Space>
                <InboxOutlined />
                <span>{loc.name}</span>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  ({loc.code})
                </Text>
                {loc.aisle && <Tag style={{ fontSize: 10 }}>Aisle {loc.aisle}</Tag>}
                {loc.shelf && <Tag style={{ fontSize: 10 }}>Shelf {loc.shelf}</Tag>}
                {loc.bin && <Tag style={{ fontSize: 10 }}>Bin {loc.bin}</Tag>}
              </Space>
            ),
            value: String(loc.id),
            key: String(loc.id),
            location: loc,
            selectable: true,
          })),
        };

        warehouseNode.children!.push(zoneNode);
      });

      nodes.push(warehouseNode);
    });

    // Add recent locations section if enabled
    if (showRecentLocations && recentLocationIds.length > 0) {
      const recentLocs = locations.filter((loc) => recentLocationIds.includes(loc.id));
      if (recentLocs.length > 0) {
        const recentNode: TreeNode = {
          title: (
            <Space>
              <HistoryOutlined />
              <Text type="secondary">{t('materials.recent_locations', 'Recent Locations')}</Text>
            </Space>
          ),
          value: 'recent',
          key: 'recent',
          selectable: false,
          children: recentLocs.map((loc) => ({
            title: (
              <Space>
                <InboxOutlined />
                <span>{loc.name}</span>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  ({loc.code})
                </Text>
              </Space>
            ),
            value: `recent-${loc.id}`,
            key: `recent-${loc.id}`,
            location: loc,
            selectable: true,
          })),
        };
        nodes.unshift(recentNode);
      }
    }

    return nodes;
  }, [locations, showRecentLocations, recentLocationIds, t]);

  const handleChange = (selectedValue: string | undefined) => {
    if (!selectedValue) {
      onChange?.(undefined);
      return;
    }

    // Handle recent location selection
    const actualId = selectedValue.startsWith('recent-')
      ? parseInt(selectedValue.replace('recent-', ''))
      : parseInt(selectedValue);

    const location = locations.find((loc) => loc.id === actualId);
    onChange?.(actualId, location);
  };

  const filterTreeNode = (input: string, node: any) => {
    const location = node.location as StorageLocation | undefined;
    if (!location) return false;

    const searchLower = input.toLowerCase();
    return (
      location.name.toLowerCase().includes(searchLower) ||
      location.code.toLowerCase().includes(searchLower) ||
      (location.warehouse?.toLowerCase().includes(searchLower) ?? false) ||
      (location.zone?.toLowerCase().includes(searchLower) ?? false) ||
      (location.aisle?.toLowerCase().includes(searchLower) ?? false) ||
      (location.shelf?.toLowerCase().includes(searchLower) ?? false) ||
      (location.bin?.toLowerCase().includes(searchLower) ?? false)
    );
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
        <Spin size="small" />
        <Text type="secondary">{t('common.loading', 'Loading...')}</Text>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('materials.no_locations', 'No locations defined')}
        style={style}
      />
    );
  }

  const displayValue = value ? String(value) : undefined;

  return (
    <TreeSelect
      value={displayValue}
      onChange={handleChange}
      treeData={treeData}
      placeholder={placeholder || t('materials.select_location', 'Select location')}
      allowClear={allowClear}
      disabled={disabled}
      showSearch
      filterTreeNode={filterTreeNode}
      treeDefaultExpandAll={false}
      treeDefaultExpandedKeys={['recent']}
      treeLine={{ showLeafIcon: false }}
      dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
      style={{ width: '100%', ...style }}
      searchValue={searchValue}
      onSearch={setSearchValue}
      suffixIcon={<SearchOutlined />}
    />
  );
}

export default LocationSelector;
