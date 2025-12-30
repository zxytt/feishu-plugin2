import '@lark-base-open/js-sdk/dist/style/dashboard.css';
import './App.scss';
import './locales/i18n';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import CountDown from './components/CountDown'
import FilterConditions from './components/FilterConditions'
import { useTheme } from './hooks';


export default function App() {
  const { bgColor } = useTheme();
  return <FilterConditions bgColor={bgColor}/>
}