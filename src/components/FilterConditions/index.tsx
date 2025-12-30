import './style.scss';
import React, { useEffect, useState, useCallback } from 'react';
import { bitable, dashboard, DashboardState, IConfig } from '@lark-base-open/js-sdk';
import { Card, Button, Typography, Empty, Spin, Tag, Space, Switch, Checkbox, InputNumber } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../../hooks';
import { Item } from '../Item';
import classnames from 'classnames';

const { Title, Text } = Typography;

interface FilterCondition {
  fieldId: string;
  fieldName: string;
  operator: string;
  value: any;
  type: string;
}

interface IFilterConditionsConfig {
  showTableName: boolean;
  showViewName: boolean;
  showFieldType: boolean;
  showOperator: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // 秒
}

interface FilterConditionsProps {
  className?: string;
  showTitle?: boolean;
  onFilterChange?: (filters: FilterCondition[]) => void;
  bgColor?: string;
}

const defaultConfig: IFilterConditionsConfig = {
  showTableName: true,
  showViewName: true,
  showFieldType: true,
  showOperator: true,
  autoRefresh: false,
  refreshInterval: 30,
};

export default function FilterConditions({
  className,
  showTitle = true,
  onFilterChange,
  bgColor,
}: FilterConditionsProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string>('');
  const [viewName, setViewName] = useState<string>('');
  const [config, setConfig] = useState<IFilterConditionsConfig>(defaultConfig);

  const isCreate = dashboard.state === DashboardState.Create;
  const isConfig = dashboard.state === DashboardState.Config || isCreate;

  // 配置管理
  const updateConfig = (res: IConfig) => {
    const { customConfig } = res;
    if (customConfig) {
      setConfig({ ...defaultConfig, ...(customConfig as any) });
    }
  };

  useConfig(updateConfig);

  const fetchFilterConditions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 获取当前激活的表格
      const table = await bitable.base.getActiveTable();
      const tableMeta = await table.getName();
      setTableName(tableMeta);

      // 获取当前视图
      const view = await table.getActiveView();
      const viewMeta = await view.getName();
      setViewName(viewMeta);

      // 获取视图的筛选条件
      // 注意：飞书 SDK 可能使用不同的方法名，如 getFilters() 或 getFilterInfo()
      let filterInfo: any = null;
      
      try {
        // 尝试不同的可能方法名
        if (typeof (view as any).getFilterInfo === 'function') {
          filterInfo = await (view as any).getFilterInfo();
        } else if (typeof (view as any).getFilters === 'function') {
          filterInfo = await (view as any).getFilters();
        } else if (typeof (view as any).getFilterConditions === 'function') {
          filterInfo = await (view as any).getFilterConditions();
        } else {
          // 如果都没有，尝试从视图元数据中获取
          const viewMeta = await view.getMeta();
          filterInfo = (viewMeta as any).filterInfo || (viewMeta as any).filters || null;
        }
      } catch (filterError: any) {
        console.warn('获取筛选条件时出错，可能当前视图不支持筛选条件:', filterError);
        // 继续执行，filterInfo 为 null
      }
      
      if (!filterInfo || !filterInfo.conditions || filterInfo.conditions.length === 0) {
        setFilters([]);
        onFilterChange?.([]);
        setLoading(false);
        return;
      }

      // 获取所有字段信息，用于映射字段ID到字段名
      const fieldList = await table.getFieldList();
      const fieldMap = new Map<string, { name: string; type: string }>();
      
      for (const field of fieldList) {
        const fieldMeta = await field.getMeta();
        fieldMap.set(fieldMeta.id, {
          name: fieldMeta.name,
          type: String(fieldMeta.type),
        });
      }

      // 转换筛选条件
      const filterConditions: FilterCondition[] = [];
      
      for (const condition of filterInfo.conditions) {
        const fieldInfo = fieldMap.get(condition.fieldId);
        if (fieldInfo) {
          filterConditions.push({
            fieldId: condition.fieldId,
            fieldName: fieldInfo.name,
            operator: condition.operator || 'unknown',
            value: condition.value || '',
            type: fieldInfo.type,
          });
        }
      }

      setFilters(filterConditions);
      onFilterChange?.(filterConditions);
    } catch (err: any) {
      console.error('获取筛选条件失败:', err);
      setError(err?.message || '获取筛选条件失败');
      setFilters([]);
    } finally {
      setLoading(false);
    }
  }, [onFilterChange]);

  useEffect(() => {
    fetchFilterConditions();

    // 自动刷新功能
    let refreshTimer: any;
    if (config.autoRefresh && config.refreshInterval > 0) {
      refreshTimer = setInterval(() => {
        fetchFilterConditions();
      }, config.refreshInterval * 1000);
    }

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [fetchFilterConditions, config.autoRefresh, config.refreshInterval]);

  const formatFilterValue = (value: any, type: string, operator: string): string => {
    if (value === null || value === undefined) {
      return '';
    }

    // 处理数组值（如多选、多选人员等）
    if (Array.isArray(value)) {
      return value.join(', ');
    }

    // 处理日期类型
    if (type === 'DateTime' || type === 'CreatedTime' || type === 'LastModifiedTime') {
      if (typeof value === 'number') {
        return new Date(value).toLocaleString('zh-CN');
      }
      return String(value);
    }

    // 处理布尔值
    if (type === 'Checkbox') {
      return value ? '是' : '否';
    }

    return String(value);
  };

  const getOperatorText = (operator: string): string => {
    const operatorMap: Record<string, string> = {
      'is': '等于',
      'isNot': '不等于',
      'contains': '包含',
      'doesNotContain': '不包含',
      'isEmpty': '为空',
      'isNotEmpty': '不为空',
      'isGreater': '大于',
      'isGreaterEqual': '大于等于',
      'isLess': '小于',
      'isLessEqual': '小于等于',
      'isWithin': '在范围内',
      'isNotWithin': '不在范围内',
    };
    return operatorMap[operator] || operator;
  };

  const getFieldTypeText = (type: string): string => {
    const typeMap: Record<string, string> = {
      'Text': '文本',
      'Number': '数字',
      'SingleSelect': '单选',
      'MultiSelect': '多选',
      'DateTime': '日期时间',
      'Checkbox': '复选框',
      'User': '人员',
      'Phone': '电话',
      'Url': '链接',
      'Attachment': '附件',
      'CreatedTime': '创建时间',
      'LastModifiedTime': '最后修改时间',
    };
    return typeMap[type] || type;
  };

  return (
    <main 
      style={{ backgroundColor: bgColor }} 
      className={classnames('filter-conditions-main', { 'main-config': isConfig })}
    >
      <div className="filter-conditions-content-wrapper">
        <Card
          className={`filter-conditions ${className || ''}`}
          title={
            showTitle ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Title heading={5} style={{ margin: 0 }}>
                  筛选条件
                </Title>
                <Button
                  onClick={fetchFilterConditions}
                  loading={loading}
                  theme="borderless"
                  type="tertiary"
                  size="small"
                >
                  刷新
                </Button>
              </div>
            ) : undefined
          }
          style={{ width: '100%' }}
        >
      <Spin spinning={loading}>
        {error ? (
          <Empty
            description={
              <div>
                <Text>{error}</Text>
                <br />
                <Button
                  type="primary"
                  theme="solid"
                  onClick={fetchFilterConditions}
                  style={{ marginTop: 12 }}
                >
                  重试
                </Button>
              </div>
            }
          />
        ) : filters.length === 0 ? (
          <Empty description="当前视图没有筛选条件" />
        ) : (
          <div className="filter-conditions-content">
            {(tableName || viewName) && (config.showTableName || config.showViewName) && (
              <div className="filter-conditions-meta">
                {tableName && config.showTableName && (
                  <Text type="tertiary" size="small">
                    表格: {tableName}
                  </Text>
                )}
                {viewName && config.showViewName && (
                  <Text type="tertiary" size="small" style={{ marginLeft: 12 }}>
                    视图: {viewName}
                  </Text>
                )}
              </div>
            )}
            <div className="filter-conditions-list">
              {filters.map((filter, index) => (
                <div key={`${filter.fieldId}-${index}`} className="filter-condition-item">
                  <Space align="center" wrap>
                    <Tag color="blue" size="large">
                      {filter.fieldName}
                    </Tag>
                    {config.showOperator && (
                      <Text strong>{getOperatorText(filter.operator)}</Text>
                    )}
                    <Tag color="grey" size="large">
                      {formatFilterValue(filter.value, filter.type, filter.operator)}
                    </Tag>
                    {config.showFieldType && (
                      <Tag color="light-blue" size="small">
                        {getFieldTypeText(filter.type)}
                      </Tag>
                    )}
                  </Space>
                </div>
              ))}
            </div>
          </div>
        )}
      </Spin>
    </Card>
      </div>
      {isConfig && (
        <ConfigPanel config={config} setConfig={setConfig} t={t} />
      )}
    </main>
  );
}

function ConfigPanel(props: {
  config: IFilterConditionsConfig;
  setConfig: React.Dispatch<React.SetStateAction<IFilterConditionsConfig>>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const { config, setConfig, t } = props;

  /**保存配置 */
  const onSaveConfig = () => {
    dashboard.saveConfig({
      customConfig: config,
      dataConditions: [],
    } as any);
  };

  return (
    <div className="config-panel">
      <div className="form">
        <Item label="显示表格名称">
          <Switch
            checked={config.showTableName}
            onChange={(checked) => {
              setConfig({
                ...config,
                showTableName: checked ?? false,
              });
            }}
          />
        </Item>

        <Item label="显示视图名称">
          <Switch
            checked={config.showViewName}
            onChange={(checked) => {
              setConfig({
                ...config,
                showViewName: checked ?? false,
              });
            }}
          />
        </Item>

        <Item label="显示操作符">
          <Switch
            checked={config.showOperator}
            onChange={(checked) => {
              setConfig({
                ...config,
                showOperator: checked ?? false,
              });
            }}
          />
        </Item>

        <Item label="显示字段类型">
          <Switch
            checked={config.showFieldType}
            onChange={(checked) => {
              setConfig({
                ...config,
                showFieldType: checked ?? false,
              });
            }}
          />
        </Item>

        <Item label="自动刷新">
          <Switch
            checked={config.autoRefresh}
            onChange={(checked) => {
              setConfig({
                ...config,
                autoRefresh: checked ?? false,
              });
            }}
          />
        </Item>

        <Item label="刷新间隔（秒）">
          <InputNumber
            min={5}
            max={300}
            step={5}
            value={config.refreshInterval}
            onChange={(value) => {
              if (value !== null && value !== undefined) {
                const numValue = typeof value === 'number' ? value : parseInt(String(value), 10);
                if (!isNaN(numValue)) {
                  setConfig({
                    ...config,
                    refreshInterval: numValue,
                  });
                }
              }
            }}
            disabled={!config.autoRefresh}
            style={{ width: '100%' }}
          />
        </Item>
      </div>

      <Button
        className="btn"
        theme="solid"
        onClick={onSaveConfig}
      >
        {t('confirm') || '确认'}
      </Button>
    </div>
  );
}

