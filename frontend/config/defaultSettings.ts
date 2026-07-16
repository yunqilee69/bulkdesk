import type { ProLayoutProps } from '@ant-design/pro-components';

const Settings: ProLayoutProps & { logo?: string } = {
  navTheme: 'light',
  colorPrimary: '#1677ff',
  layout: 'side',
  contentWidth: 'Fluid',
  fixedHeader: false,
  fixSiderbar: true,
  colorWeak: false,
  title: '批掌柜 BulkDesk',
  logo: '/logo.svg',
  iconfontUrl: '',
  token: {},
};

export default Settings;
