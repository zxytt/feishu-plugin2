import './style.scss';
import React, { useEffect, useState, useCallback } from 'react';
import { bitable, dashboard, DashboardState, IConfig } from '@lark-base-open/js-sdk';
import { Card, Button, Typography, Empty, Spin, Tag, Space, Switch, Checkbox, InputNumber, Select, Table } from '@douyinfe/semi-ui';
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
  const [dataRecords, setDataRecords] = useState<any[]>([]);
  const [dataColumns, setDataColumns] = useState<Array<{ title: string; dataIndex: string; key: string }>>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [filterSource, setFilterSource] = useState<string>(''); // 筛选条件来源

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
      // 优先级：1. 仪表盘筛选条件 2. 指定视图筛选条件 3. base级别筛选条件
      let filterInfo: any = null;
      
      try {
        // 优先尝试从 dashboard 获取筛选条件（仪表盘级别的筛选）
        try {
          const dashboardConfig = await dashboard.getConfig();
          console.log('Dashboard Config:', dashboardConfig);
          
          // 尝试多种可能的属性名
          const possibleFilterKeys = ['dataConditions', 'filterConditions', 'filters', 'filterInfo', 'conditions'];
          for (const key of possibleFilterKeys) {
            const filterData = (dashboardConfig as any)?.[key];
            if (filterData) {
              if (Array.isArray(filterData) && filterData.length > 0) {
                filterInfo = { conditions: filterData };
                setFilterSource('仪表盘筛选条件');
                console.log(`从 dashboard.getConfig().${key} 获取到筛选条件:`, filterData);
                break;
              } else if (filterData && typeof filterData === 'object' && filterData.conditions) {
                filterInfo = filterData;
                setFilterSource('仪表盘筛选条件');
                console.log(`从 dashboard.getConfig().${key} 获取到筛选条件:`, filterData);
                break;
              }
            }
          }
          
          // 尝试从 dashboard 对象直接获取
          if (!filterInfo) {
            const dashboardMethods = ['getFilterInfo', 'getFilters', 'getFilterConditions', 'getDataConditions'];
            for (const method of dashboardMethods) {
              if (typeof (dashboard as any)[method] === 'function') {
                try {
                  const result = await (dashboard as any)[method]();
                  if (result) {
                    filterInfo = Array.isArray(result) ? { conditions: result } : result;
                    setFilterSource('仪表盘筛选条件');
                    console.log(`从 dashboard.${method}() 获取到筛选条件:`, filterInfo);
                    break;
                  }
                } catch (e) {
                  // 继续尝试下一个方法
                }
              }
            }
          }
        } catch (e) {
          console.warn('从 dashboard 获取筛选条件失败:', e);
        }
        
        // 如果还没有获取到，且配置了数据源，从指定的表格和视图获取筛选条件
        if (!filterInfo && config.dataSource?.tableId) {
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
                // 尝试多种方法获取视图筛选条件
                const viewMethods = ['getFilterInfo', 'getFilters', 'getFilterConditions'];
                for (const method of viewMethods) {
                  if (typeof (view as any)[method] === 'function') {
                    try {
                      const result = await (view as any)[method]();
                      if (result) {
                        filterInfo = Array.isArray(result) ? { conditions: result } : result;
                        console.log(`从指定视图.${method}() 获取到筛选条件:`, filterInfo);
                        break;
                      }
                    } catch (e) {
                      // 继续尝试下一个方法
                    }
                  }
                }
                
                // 如果方法调用都失败，尝试从视图元数据获取
                if (!filterInfo) {
                  try {
                    const viewMeta = await view.getMeta();
                    filterInfo = (viewMeta as any).filterInfo || (viewMeta as any).filters || (viewMeta as any).filterConditions || null;
                    if (filterInfo) {
                      filterInfo = Array.isArray(filterInfo) ? { conditions: filterInfo } : filterInfo;
                      setFilterSource(`视图筛选条件 (${config.dataSource.viewName || config.dataSource.viewId || '当前视图'})`);
                      console.log('从视图元数据获取到筛选条件:', filterInfo);
                    }
                  } catch (e) {
                    console.warn('从视图元数据获取筛选条件失败:', e);
                  }
                } else {
                  setFilterSource(`视图筛选条件 (${config.dataSource.viewName || config.dataSource.viewId || '当前视图'})`);
                }
              } catch (e) {
                console.warn('从指定视图获取筛选条件失败:', e);
              }
            }
          } catch (e) {
            console.warn('获取指定表格/视图失败:', e);
          }
        }
        
        // 如果还没有获取到，尝试从 base 级别获取筛选条件
        if (!filterInfo) {
          try {
            const baseMethods = ['getFilterInfo', 'getFilters', 'getFilterConditions'];
            for (const method of baseMethods) {
              if (typeof (base as any)[method] === 'function') {
                try {
                  const result = await (base as any)[method]();
                  if (result) {
                    filterInfo = Array.isArray(result) ? { conditions: result } : result;
                    console.log(`从 base.${method}() 获取到筛选条件:`, filterInfo);
                    break;
                  }
                } catch (e) {
                  // 继续尝试下一个方法
                }
              }
            }
            
            // 如果方法调用都失败，尝试从 base 元数据中获取
            if (!filterInfo && baseMeta) {
              filterInfo = baseMeta.filterInfo || baseMeta.filters || baseMeta.filterConditions || null;
              if (filterInfo) {
                filterInfo = Array.isArray(filterInfo) ? { conditions: filterInfo } : filterInfo;
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
      
      // 标准化 filterInfo 格式
      if (filterInfo) {
        // 如果 filterInfo 是数组，转换为对象格式
        if (Array.isArray(filterInfo) && filterInfo.length > 0) {
          filterInfo = { conditions: filterInfo };
        }
        // 如果 filterInfo 是对象但没有 conditions 属性，尝试查找其他可能的属性
        else if (filterInfo && typeof filterInfo === 'object' && !filterInfo.conditions) {
          const possibleKeys = ['conditions', 'filters', 'filterConditions', 'items', 'data'];
          for (const key of possibleKeys) {
            if (Array.isArray(filterInfo[key]) && filterInfo[key].length > 0) {
              filterInfo = { conditions: filterInfo[key] };
              break;
            }
          }
        }
      }
      
      // 检查是否有有效的筛选条件
      if (!filterInfo || !filterInfo.conditions || !Array.isArray(filterInfo.conditions) || filterInfo.conditions.length === 0) {
        console.log('未找到筛选条件，当前 filterInfo:', filterInfo);
        setFilters([]);
        setFilterSource('');
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
        // 跳过无效的筛选条件
        if (!condition || (typeof condition !== 'object')) {
          continue;
        }
        
        // 尝试通过 tableId_fieldId 或 fieldId 查找字段
        let fieldInfo = null;
        const fieldId = condition.fieldId || condition.field_id || condition.field;
        const tableId = condition.tableId || condition.table_id || condition.table;
        
        if (tableId && fieldId) {
          fieldInfo = fieldMap.get(`${tableId}_${fieldId}`);
        }
        if (!fieldInfo && fieldId) {
          fieldInfo = fieldMap.get(fieldId);
        }
        
        // 获取操作符和值
        const operator = condition.operator || condition.op || condition.operation || 'unknown';
        const value = condition.value !== undefined ? condition.value : (condition.values || '');
        const fieldName = condition.fieldName || condition.field_name || condition.name;
        const fieldType = condition.type || condition.fieldType || condition.field_type;
        const tableName = condition.tableName || condition.table_name;
        
        if (fieldInfo) {
          filterConditions.push({
            fieldId: fieldId || 'unknown',
            fieldName: fieldInfo.name,
            operator: operator,
            value: value,
            type: fieldInfo.type,
            tableId: fieldInfo.tableId,
            tableName: fieldInfo.tableName,
          });
        } else {
          // 如果找不到字段信息，仍然显示筛选条件（使用条件中的信息）
          filterConditions.push({
            fieldId: fieldId || 'unknown',
            fieldName: fieldName || `字段 ${fieldId || 'unknown'}`,
            operator: operator,
            value: value,
            type: fieldType || 'unknown',
            tableId: tableId,
            tableName: tableName,
          });
        }
      }

      setFilters(filterConditions);
      onFilterChange?.(filterConditions);
    } catch (err: any) {
      console.error('获取筛选条件失败:', err);
      setError(err?.message || '获取筛选条件失败');
      setFilters([]);
      setFilterSource('');
    } finally {
      setLoading(false);
    }
  }, [onFilterChange, config.dataSource]);

  // 获取数据源的数据
  const fetchDataSourceData = useCallback(async () => {
    if (!config.dataSource?.tableId) {
      setDataRecords([]);
      setDataColumns([]);
      return;
    }

    setDataLoading(true);
    try {
      console.log('========== 开始获取数据源数据 ==========');
      console.log('数据源配置:', config.dataSource);
      
      const base = bitable.base;
      const table = await base.getTableById(config.dataSource.tableId);
      console.log('获取到的表格对象:', table);
      
      let view = null;

      // 如果指定了视图，使用指定视图；否则使用活动视图
      if (config.dataSource.viewId) {
        view = await table.getViewById(config.dataSource.viewId);
        console.log('使用指定视图 ID:', config.dataSource.viewId);
      } else {
        view = await table.getActiveView();
        console.log('使用活动视图');
      }
      console.log('获取到的视图对象:', view);

      // 获取字段列表
      const fieldList = await table.getFieldList();
      console.log('字段列表对象:', fieldList);
      const fields: Array<{ id: string; name: string; type: string }> = [];
      
      for (const field of fieldList) {
        const fieldMeta = await field.getMeta();
        fields.push({
          id: fieldMeta.id,
          name: fieldMeta.name,
          type: String(fieldMeta.type),
        });
      }
      console.log('解析后的字段数组:', fields);

      // 构建表格列
      const columns = fields.map((field) => ({
        title: field.name,
        dataIndex: field.id,
        key: field.id,
        width: 150,
        render: (text: any, record: any) => {
          const value = record[field.id];
          return formatFieldValue(value, field.type);
        },
      }));

      setDataColumns(columns);

      // 获取记录（优先使用视图，因为视图可能包含筛选条件）
      let records: any[] = [];
      try {
        // 优先使用视图的 getRecords 方法（视图会自动应用筛选条件）
        if (view) {
          try {
            // 尝试使用视图的标准方法
            const result = await view.getRecords({ pageSize: 100 });
            console.log('view.getRecords() 原始返回:', result);
            // 处理返回结果，可能是数组或包含 records 属性的对象
            records = Array.isArray(result) ? result : (result?.records || []);
            console.log('从视图获取到记录数量:', records.length);
          } catch (viewError) {
            console.warn('使用 view.getRecords() 失败，尝试其他方法:', viewError);
            // 尝试其他可能的视图方法
            const viewMethods = ['getRecordList', 'getRecordsByPage', 'getFilteredRecords'];
            for (const method of viewMethods) {
              if (typeof (view as any)[method] === 'function') {
                try {
                  const result = await (view as any)[method]({ pageSize: 100 });
                  records = Array.isArray(result) ? result : (result?.records || []);
                  console.log(`使用 view.${method}() 获取到记录数量:`, records.length);
                  break;
                } catch (e) {
                  // 继续尝试下一个方法
                }
              }
            }
          }
        }
        
        // 如果视图方法都失败，尝试从表格获取记录
        if (records.length === 0) {
          try {
            const tableResult = await table.getRecords({ pageSize: 100 });
            console.log('table.getRecords() 原始返回:', tableResult);
            records = Array.isArray(tableResult) ? tableResult : (tableResult?.records || []);
            console.log('从表格获取到记录数量:', records.length);
          } catch (e2) {
            console.error('从表格获取记录也失败:', e2);
            records = [];
          }
        }
        
        console.log('最终解析后的记录数组:', records);
        console.log('最终记录数量:', records.length);
      } catch (e) {
        console.error('获取记录时发生错误:', e);
        records = [];
      }

      const recordData = await Promise.all(
        records.map(async (record: any, index: number) => {
          console.log(`处理第 ${index + 1} 条记录:`, record);
          const recordObj: any = { id: record.id || record.recordId };
          for (const field of fields) {
            try {
              const cell = await record.getCell(field.id);
              const value = await cell.getValue();
              recordObj[field.id] = value;
              console.log(`  字段 ${field.name} (${field.id}):`, value);
            } catch (e) {
              console.warn(`  字段 ${field.name} (${field.id}) 获取失败:`, e);
              recordObj[field.id] = null;
            }
          }
          console.log(`  处理完成的记录对象:`, recordObj);
          return recordObj;
        })
      );

      setDataRecords(recordData);
      
      // 打印汇总信息
      console.log('========== 数据获取完成 ==========');
      console.log('获取到数据记录数量:', recordData.length, '条');
      console.log('数据记录详情:', recordData);
      console.log('表格列配置:', columns);
      console.log('字段信息:', fields);
      console.log('表格名称:', config.dataSource.tableName);
      console.log('视图名称:', config.dataSource.viewName);
      console.log('========== 数据打印结束 ==========');
      
      // 打印每条记录的详细信息
      recordData.forEach((record, index) => {
        console.log(`\n--- 记录 ${index + 1} ---`);
        console.log('记录 ID:', record.id);
        Object.keys(record).forEach((key) => {
          if (key !== 'id') {
            const field = fields.find((f) => f.id === key);
            console.log(`  ${field?.name || key} (${key}):`, record[key]);
          }
        });
      });
    } catch (err: any) {
      console.error('获取数据源数据失败:', err);
      setError(err?.message || '获取数据失败');
      setDataRecords([]);
      setDataColumns([]);
    } finally {
      setDataLoading(false);
    }
  }, [config.dataSource]);

  // 格式化字段值用于展示
  const formatFieldValue = (value: any, type: string): string => {
    if (value === null || value === undefined) {
      return '-';
    }

    if (Array.isArray(value)) {
      return value.map((v) => {
        if (typeof v === 'object' && v !== null) {
          return v.name || v.text || JSON.stringify(v);
        }
        return String(v);
      }).join(', ');
    }

    if (typeof value === 'object' && value !== null) {
      return value.name || value.text || JSON.stringify(value);
    }

    if (type === 'DateTime' || type === 'CreatedTime' || type === 'LastModifiedTime') {
      if (typeof value === 'number') {
        return new Date(value).toLocaleString('zh-CN');
      }
    }

    if (type === 'Checkbox') {
      return value ? '是' : '否';
    }

    return String(value);
  };

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
    const offConfigChange = dashboard.onConfigChange((r: any) => {
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
          fetchDataSourceData();
        });
      } else if (typeof (base as any).onActiveViewChange === 'function') {
        viewChangeListener = (base as any).onActiveViewChange(() => {
          console.log('活动视图变化，刷新筛选条件');
          fetchFilterConditions();
          fetchDataSourceData();
        });
      }
      
      // 尝试监听表格变化
      if (typeof (base as any).onTableChange === 'function') {
        tableChangeListener = (base as any).onTableChange(() => {
          console.log('表格变化，刷新筛选条件');
          fetchFilterConditions();
          fetchDataSourceData();
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
  }, [fetchFilterConditions, fetchDataSourceData]);

  // 当数据源变化时，自动获取数据
  useEffect(() => {
    if (config.dataSource?.tableId) {
      fetchDataSourceData();
    } else {
      setDataRecords([]);
      setDataColumns([]);
    }
  }, [config.dataSource, fetchDataSourceData]);

  // 当筛选条件变化时，如果配置了数据源，自动刷新数据
  useEffect(() => {
    if (config.dataSource?.tableId && filters.length > 0) {
      // 延迟一下，确保筛选条件已经应用
      const timer = setTimeout(() => {
        fetchDataSourceData();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [filters.length, config.dataSource?.tableId, config.dataSource?.viewId]);

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
            {(baseName || filterSource) && (
              <div className="filter-conditions-meta">
                {baseName && (
                  <Text type="tertiary" size="small">
                    文档: {baseName}
                  </Text>
                )}
                {filterSource && (
                  <Text type="tertiary" size="small" style={{ marginLeft: baseName ? 12 : 0 }}>
                    来源: {filterSource}
                  </Text>
                )}
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

        {/* 数据展示区域 */}
        {config.dataSource?.tableId && (
          <Card
            className="data-source-display"
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Title heading={5} style={{ margin: 0 }}>
                  数据预览
                  {config.dataSource.tableName && (
                    <Text type="tertiary" size="small" style={{ marginLeft: 8 }}>
                      ({config.dataSource.tableName}
                      {config.dataSource.viewName && ` - ${config.dataSource.viewName}`})
                    </Text>
                  )}
                </Title>
                <Button
                  onClick={fetchDataSourceData}
                  loading={dataLoading}
                  theme="borderless"
                  type="tertiary"
                  size="small"
                >
                  刷新数据
                </Button>
              </div>
            }
            style={{ width: '100%', marginTop: 16 }}
          >
            <Spin spinning={dataLoading}>
              {dataRecords.length === 0 ? (
                <Empty description="暂无数据" />
              ) : (
                <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                  <Table
                    columns={dataColumns}
                    dataSource={dataRecords}
                    pagination={{
                      pageSize: 20,
                      showSizeChanger: true,
                      showTotal: ((total: number) => `共 ${total} 条`) as any,
                    }}
                    scroll={{ x: 'max-content' }}
                    size="small"
                  />
                </div>
              )}
            </Spin>
          </Card>
        )}
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
        console.log('tableList', tableList);
        const tableData = await Promise.all(
          tableList.map(async (table) => {
            const meta = await table.getMeta();
            return { id: meta.id, name: meta.name };
          })
        );
        console.log('tableData', tableData);
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
        console.log('table', table);
        const viewList = await table.getViewList();
        console.log('viewList', viewList);
        const viewData = await Promise.all(
          viewList.map(async (view) => {
            const meta = await view.getMeta();
            return { id: meta.id, name: meta.name };
          })
        );  
        console.log('viewData', viewData);
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

