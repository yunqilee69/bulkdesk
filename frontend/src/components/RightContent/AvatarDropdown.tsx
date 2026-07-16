import { LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import type { MenuProps } from 'antd';
import { Spin } from 'antd';
import React, { startTransition } from 'react';
import { logout } from '@/services/api';
import HeaderDropdown from '../HeaderDropdown';

type GlobalHeaderRightProps = {
  children?: React.ReactNode;
};

const menuItems: MenuProps['items'] = [
  { key: 'settings', icon: <SettingOutlined />, label: '主题设置' },
  { type: 'divider' as const },
  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
];

const loginOut = async () => {
  try { await logout(); } catch { /* ignore */ }
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  history.replace('/user/login');
};

export const AvatarDropdown: React.FC<GlobalHeaderRightProps> = ({ children }) => {
  const { initialState, setInitialState } = useModel('@@initialState');

  const onMenuClick: MenuProps['onClick'] = (event) => {
    const { key } = event;
    if (key === 'logout') {
      startTransition(() => { setInitialState((s) => ({ ...s, currentUser: undefined })); });
      loginOut();
      return;
    }
    if (key === 'settings') {
      setInitialState((s) => ({ ...s, settingDrawerOpen: true }));
      return;
    }
  };

  if (!initialState) return <Spin size="small" />;
  const { currentUser } = initialState;
  if (!currentUser) return <Spin size="small" />;

  return (
    <HeaderDropdown placement="bottomRight" menu={{ selectedKeys: [], onClick: onMenuClick, items: menuItems }} arrow>
      {children}
    </HeaderDropdown>
  );
};
