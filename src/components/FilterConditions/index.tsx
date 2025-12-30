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
  tableId?: string;
  tableName?: string;
}

interface IFilterConditionsConfig {
  showTableName: boolean;
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
  const [baseName, setBaseName] = useState<string>('');
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
      // 获取文档（base）信息
      const base = bitable.base;
      let baseMeta: any = null;
      
      // 尝试获取 base 名称，如果没有直接方法，使用默认值
      try {
        if (typeof (base as any).getName === 'function') {
          const name = await (base as any).getName();
          setBaseName(name || '多维表格');
        } else if (typeof (base as any).getMeta === 'function') {
          baseMeta = await (base as any).getMeta();
          setBaseName(baseMeta?.name || '多维表格');
        } else {
          setBaseName('多维表格');
        }
      } catch {
        setBaseName('多维表格');
      }

      // 获取文档级别的筛选条件
      // 尝试从 dashboard 的配置中获取 dataConditions
      let filterInfo: any = null;
      
      try {
        // 方法1: 从 dashboard 配置中获取 dataConditions
        const dashboardConfig = await dashboard.getConfig();
        if (dashboardConfig && (dashboardConfig as any).dataConditions) {
          filterInfo = {
            conditions: (dashboardConfig as any).dataConditions,
          };
        }
        
        // 方法2: 尝试从 base 级别获取筛选条件
        if (!filterInfo) {
          if (typeof (base as any).getFilterInfo === 'function') {
            filterInfo = await (base as any).getFilterInfo();
          } else if (typeof (base as any).getFilters === 'function') {
            filterInfo = await (base as any).getFilters();
          } else if (typeof (base as any).getFilterConditions === 'function') {
            filterInfo = await (base as any).getFilterConditions();
          } else if (baseMeta) {
            // 尝试从 base 元数据中获取
            filterInfo = baseMeta.filterInfo || baseMeta.filters || null;
          }
        }
      } catch (filterError: any) {
        console.warn('获取筛选条件时出错:', filterError);
        // 继续执行，filterInfo 为 null
      }
      
      if (!filterInfo || !filterInfo.conditions || filterInfo.conditions.length === 0) {
        setFilters([]);
        onFilterChange?.([]);
        setLoading(false);
        return;
      }

      // 获取所有表格的字段信息，用于映射字段ID到字段名
      const tableList = await base.getTableList();
      const fieldMap = new Map<string, { name: string; type: string; tableId: string; tableName: string }>();
      
      // 遍历所有表格获取字段信息
      for (const table of tableList) {
        const tableMeta = await table.getMeta();
        const fieldList = await table.getFieldList();
        
        for (const field of fieldList) {
          const fieldMeta = await field.getMeta();
          // 使用 tableId_fieldId 作为唯一键，因为不同表格可能有相同字段ID
          const uniqueKey = `${tableMeta.id}_${fieldMeta.id}`;
          fieldMap.set(uniqueKey, {
            name: fieldMeta.name,
            type: String(fieldMeta.type),
            tableId: tableMeta.id,
            tableName: tableMeta.name,
          });
          // 也支持只用 fieldId 查找（向后兼容）
          if (!fieldMap.has(fieldMeta.id)) {
            fieldMap.set(fieldMeta.id, {
              name: fieldMeta.name,
              type: String(fieldMeta.type),
              tableId: tableMeta.id,
              tableName: tableMeta.name,
            });
          }
        }
      }

      // 转换筛选条件
      const filterConditions: FilterCondition[] = [];
      
      for (const condition of filterInfo.conditions) {
        // 尝试通过 tableId_fieldId 或 fieldId 查找字段
        let fieldInfo = null;
        if (condition.tableId && condition.fieldId) {
          fieldInfo = fieldMap.get(`${condition.tableId}_${condition.fieldId}`);
        }
        if (!fieldInfo && condition.fieldId) {
          fieldInfo = fieldMap.get(condition.fieldId);
        }
        
        if (fieldInfo) {
          filterConditions.push({
            fieldId: condition.fieldId,
            fieldName: fieldInfo.name,
            operator: condition.operator || 'unknown',
            value: condition.value || '',
            type: fieldInfo.type,
            tableId: fieldInfo.tableId,
            tableName: fieldInfo.tableName,
          });
        } else {
          // 如果找不到字段信息，仍然显示筛选条件
          filterConditions.push({
            fieldId: condition.fieldId || 'unknown',
            fieldName: condition.fieldName || `字段 ${condition.fieldId || 'unknown'}`,
            operator: condition.operator || 'unknown',
            value: condition.value || '',
            type: condition.type || 'unknown',
            tableId: condition.tableId,
            tableName: condition.tableName,
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
            {baseName && (
              <div className="filter-conditions-meta">
                <Text type="tertiary" size="small">
                  文档: {baseName}
                </Text>
              </div>
            )}
            <div className="filter-conditions-list">
              {filters.map((filter, index) => (
                <div key={`${filter.tableId || ''}_${filter.fieldId}_${index}`} className="filter-condition-item">
                  <Space align="center" wrap>
                    {filter.tableName && config.showTableName && (
                      <Tag color="purple" size="small">
                        {filter.tableName}
                      </Tag>
                    )}
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

