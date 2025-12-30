import './style.scss';
import React, { useEffect, useState, useCallback } from 'react';
import { bitable, dashboard, DashboardState, IConfig } from '@lark-base-open/js-sdk';
import { Card, Button, Typography, Empty, Spin, Tag, Space, Switch, Checkbox, InputNumber, Select } from '@douyinfe/semi-ui';
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
  dataSource?: {
    tableId?: string;
    tableName?: string;
    viewId?: string;
    viewName?: string;
  };
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

  const fetchFilterConditions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 获取文档（base）信息
      const base = bitable.base;
      console.log('base', base);
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
      let filterInfo: any = null;
      
      try {
        // 如果配置了数据源，从指定的表格和视图获取筛选条件
        if (config.dataSource?.tableId) {
          try {
            const table = await base.getTableById(config.dataSource.tableId);
            let view = null;
            
            // 如果指定了视图，使用指定视图；否则使用活动视图
            if (config.dataSource.viewId) {
              view = await table.getViewById(config.dataSource.viewId);
            } else {
              view = await table.getActiveView();
            }
            
            // 尝试从视图获取筛选条件
            if (view) {
              try {
                if (typeof (view as any).getFilterInfo === 'function') {
                  filterInfo = await (view as any).getFilterInfo();
                  console.log('从指定视图获取到筛选条件:', filterInfo);
                } else if (typeof (view as any).getFilters === 'function') {
                  filterInfo = await (view as any).getFilters();
                  console.log('从指定视图获取到筛选条件:', filterInfo);
                } else if (typeof (view as any).getFilterConditions === 'function') {
                  filterInfo = await (view as any).getFilterConditions();
                  console.log('从指定视图获取到筛选条件:', filterInfo);
                } else {
                  const viewMeta = await view.getMeta();
                  filterInfo = (viewMeta as any).filterInfo || (viewMeta as any).filters || null;
                  if (filterInfo) {
                    console.log('从视图元数据获取到筛选条件:', filterInfo);
                  }
                }
              } catch (e) {
                console.warn('从指定视图获取筛选条件失败:', e);
              }
            }
          } catch (e) {
            console.warn('获取指定表格/视图失败:', e);
          }
        }
        
        // 如果还没有获取到，尝试从 dashboard 配置中获取
        if (!filterInfo) {
          try {
            const dashboardConfig = await dashboard.getConfig();
            console.log('Dashboard Config:', dashboardConfig);
            
            if (dashboardConfig && (dashboardConfig as any).dataConditions) {
              const dataConditions = (dashboardConfig as any).dataConditions;
              if (Array.isArray(dataConditions) && dataConditions.length > 0) {
                filterInfo = { conditions: dataConditions };
                console.log('从 dashboard.getConfig() 获取到筛选条件:', dataConditions);
              }
            }
          } catch (e) {
            console.warn('从 dashboard 配置获取筛选条件失败:', e);
          }
        }
        
        // 如果还没有获取到，尝试从 base 级别获取筛选条件
        if (!filterInfo) {
          try {
            if (typeof (base as any).getFilterInfo === 'function') {
              filterInfo = await (base as any).getFilterInfo();
              console.log('从 base.getFilterInfo() 获取到筛选条件:', filterInfo);
            } else if (typeof (base as any).getFilters === 'function') {
              filterInfo = await (base as any).getFilters();
              console.log('从 base.getFilters() 获取到筛选条件:', filterInfo);
            } else if (typeof (base as any).getFilterConditions === 'function') {
              filterInfo = await (base as any).getFilterConditions();
              console.log('从 base.getFilterConditions() 获取到筛选条件:', filterInfo);
            } else if (baseMeta) {
              // 尝试从 base 元数据中获取
              filterInfo = baseMeta.filterInfo || baseMeta.filters || null;
              if (filterInfo) {
                console.log('从 baseMeta 获取到筛选条件:', filterInfo);
              }
            }
          } catch (e) {
            console.warn('从 base 获取筛选条件失败:', e);
          }
        }
      } catch (filterError: any) {
        console.warn('获取筛选条件时出错:', filterError);
        // 继续执行，filterInfo 为 null
      }
      
      // 如果 filterInfo 是数组，直接使用
      if (Array.isArray(filterInfo) && filterInfo.length > 0) {
        filterInfo = { conditions: filterInfo };
      }
      
      // 如果 filterInfo 有 conditions 属性，使用它
      if (filterInfo && !filterInfo.conditions && Array.isArray(filterInfo)) {
        filterInfo = { conditions: filterInfo };
      }
      
      if (!filterInfo || !filterInfo.conditions || filterInfo.conditions.length === 0) {
        console.log('未找到筛选条件，当前 filterInfo:', filterInfo);
        setFilters([]);
        onFilterChange?.([]);
        setLoading(false);
        return;
      }
      
      console.log('找到筛选条件:', filterInfo.conditions);

      // 获取字段信息，用于映射字段ID到字段名
      const fieldMap = new Map<string, { name: string; type: string; tableId: string; tableName: string }>();
      
      // 如果配置了数据源，只获取指定表格的字段信息
      if (config.dataSource?.tableId) {
        try {
          const table = await base.getTableById(config.dataSource.tableId);
          const tableMeta = await table.getMeta();
          const fieldList = await table.getFieldList();
          
          for (const field of fieldList) {
            const fieldMeta = await field.getMeta();
            const uniqueKey = `${tableMeta.id}_${fieldMeta.id}`;
            fieldMap.set(uniqueKey, {
              name: fieldMeta.name,
              type: String(fieldMeta.type),
              tableId: tableMeta.id,
              tableName: tableMeta.name,
            });
            if (!fieldMap.has(fieldMeta.id)) {
              fieldMap.set(fieldMeta.id, {
                name: fieldMeta.name,
                type: String(fieldMeta.type),
                tableId: tableMeta.id,
                tableName: tableMeta.name,
              });
            }
          }
        } catch (e) {
          console.warn('获取指定表格字段信息失败:', e);
        }
      } else {
        // 否则获取所有表格的字段信息
        const tableList = await base.getTableList();
        for (const table of tableList) {
          const tableMeta = await table.getMeta();
          const fieldList = await table.getFieldList();
          
          for (const field of fieldList) {
            const fieldMeta = await field.getMeta();
            const uniqueKey = `${tableMeta.id}_${fieldMeta.id}`;
            fieldMap.set(uniqueKey, {
              name: fieldMeta.name,
              type: String(fieldMeta.type),
              tableId: tableMeta.id,
              tableName: tableMeta.name,
            });
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
  }, [onFilterChange, config.dataSource]);

  // 配置管理
  const updateConfig = useCallback((res: IConfig) => {
    const { customConfig, dataConditions } = res;
    if (customConfig) {
      setConfig({ ...defaultConfig, ...(customConfig as any) });
    }
    // 如果 dataConditions 变化，自动刷新筛选条件
    if (dataConditions !== undefined) {
      fetchFilterConditions();
    }
  }, [fetchFilterConditions]);

  useConfig(updateConfig);

  // 监听配置变化，自动更新筛选条件
  useEffect(() => {
    const offConfigChange = dashboard.onConfigChange((r) => {
      // 当配置变化时，检查 dataConditions 是否变化
      if (r.data && (r.data as any).dataConditions !== undefined) {
        fetchFilterConditions();
      }
    });
    return () => {
      offConfigChange();
    };
  }, [fetchFilterConditions]);

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

  // 监听视图和表格变化，自动刷新筛选条件
  useEffect(() => {
    let viewChangeListener: (() => void) | null = null;
    let tableChangeListener: (() => void) | null = null;
    
    try {
      const base = bitable.base;
      // 尝试监听视图变化
      if (typeof (base as any).onViewChange === 'function') {
        viewChangeListener = (base as any).onViewChange(() => {
          console.log('视图变化，刷新筛选条件');
          fetchFilterConditions();
        });
      } else if (typeof (base as any).onActiveViewChange === 'function') {
        viewChangeListener = (base as any).onActiveViewChange(() => {
          console.log('活动视图变化，刷新筛选条件');
          fetchFilterConditions();
        });
      }
      
      // 尝试监听表格变化
      if (typeof (base as any).onTableChange === 'function') {
        tableChangeListener = (base as any).onTableChange(() => {
          console.log('表格变化，刷新筛选条件');
          fetchFilterConditions();
        });
      }
    } catch (e) {
      console.warn('无法监听视图/表格变化:', e);
    }

    return () => {
      if (viewChangeListener) {
        viewChangeListener();
      }
      if (tableChangeListener) {
        tableChangeListener();
      }
    };
  }, [fetchFilterConditions]);

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
  const [tables, setTables] = useState<Array<{ id: string; name: string }>>([]);
  const [views, setViews] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  // 加载表格列表
  useEffect(() => {
    const loadTables = async () => {
      try {
        setLoading(true);
        const base = bitable.base;
        const tableList = await base.getTableList();
        const tableData = await Promise.all(
          tableList.map(async (table) => {
            const meta = await table.getMeta();
            return { id: meta.id, name: meta.name };
          })
        );
        setTables(tableData);
      } catch (err) {
        console.error('加载表格列表失败:', err);
      } finally {
        setLoading(false);
      }
    };
    loadTables();
  }, []);

  // 加载视图列表
  useEffect(() => {
    const loadViews = async () => {
      if (!config.dataSource?.tableId) {
        setViews([]);
        return;
      }
      try {
        setLoading(true);
        const base = bitable.base;
        const table = await base.getTableById(config.dataSource.tableId);
        const viewList = await table.getViewList();
        const viewData = await Promise.all(
          viewList.map(async (view) => {
            const meta = await view.getMeta();
            return { id: meta.id, name: meta.name };
          })
        );
        setViews(viewData);
      } catch (err) {
        console.error('加载视图列表失败:', err);
        setViews([]);
      } finally {
        setLoading(false);
      }
    };
    loadViews();
  }, [config.dataSource?.tableId]);

  // 当表格变化时，清空视图选择
  const handleTableChange = (value: string | number | any[] | Record<string, any> | undefined) => {
    if (typeof value !== 'string' || !value) {
      setConfig({
        ...config,
        dataSource: undefined,
      });
      return;
    }
    const selectedTable = tables.find((t) => t.id === value);
    setConfig({
      ...config,
      dataSource: {
        tableId: value,
        tableName: selectedTable?.name,
        viewId: undefined,
        viewName: undefined,
      },
    });
  };

  // 当视图变化时
  const handleViewChange = (value: string | number | any[] | Record<string, any> | undefined) => {
    if (typeof value !== 'string' || !value) {
      setConfig({
        ...config,
        dataSource: {
          ...config.dataSource,
          viewId: undefined,
          viewName: undefined,
        },
      });
      return;
    }
    const selectedView = views.find((v) => v.id === value);
    setConfig({
      ...config,
      dataSource: {
        ...config.dataSource,
        viewId: value,
        viewName: selectedView?.name,
      },
    });
  };

  /**保存配置 */
  const onSaveConfig = async () => {
    // 构建 dataConditions，如果选择了数据源
    let dataConditions: any[] = [];
    
    if (config.dataSource?.tableId) {
      const condition: any = {
        tableId: config.dataSource.tableId,
      };
      
      if (config.dataSource.viewId) {
        condition.viewId = config.dataSource.viewId;
      }
      
      dataConditions = [condition];
    }

    await dashboard.saveConfig({
      customConfig: config,
      dataConditions,
    } as any);
  };

  return (
    <div className="config-panel">
      <div className="form">
        <Item label="数据源 - 表格">
          <Select
            placeholder="请选择表格"
            value={config.dataSource?.tableId}
            onChange={handleTableChange}
            loading={loading}
            style={{ width: '100%' }}
            filter
            showClear
          >
            {tables.map((table) => (
              <Select.Option key={table.id} value={table.id}>
                {table.name}
              </Select.Option>
            ))}
          </Select>
        </Item>

        <Item label="数据源 - 视图">
          <Select
            placeholder={config.dataSource?.tableId ? '请选择视图' : '请先选择表格'}
            value={config.dataSource?.viewId}
            onChange={handleViewChange}
            loading={loading}
            disabled={!config.dataSource?.tableId}
            style={{ width: '100%' }}
            filter
            showClear
          >
            {views.map((view) => (
              <Select.Option key={view.id} value={view.id}>
                {view.name}
              </Select.Option>
            ))}
          </Select>
        </Item>

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

