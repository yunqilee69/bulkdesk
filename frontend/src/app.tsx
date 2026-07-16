import type { Settings as LayoutSettings } from '@ant-design/pro-components';
import { SettingDrawer } from '@ant-design/pro-components';
import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';
import React from 'react';
import { AvatarDropdown, Footer } from '@/components';
import { currentUser as queryCurrentUser } from '@/services/api';
import defaultSettings from '../config/defaultSettings';
import { errorConfig } from './requestErrorConfig';

const loginPath = '/user/login';

export async function getInitialState(): Promise<{
  settings?: Partial<LayoutSettings>;
  currentUser?: API.CurrentUser;
  fetchUserInfo?: () => Promise<API.CurrentUser | undefined>;
  settingDrawerOpen?: boolean;
}> {
  const fetchUserInfo = async () => {
    try {
      const user = await queryCurrentUser();
      return user;
    } catch {
      history.replace(loginPath);
    }
    return undefined;
  };

  const { location } = history;
  if (location.pathname !== loginPath) {
    const currentUser = await fetchUserInfo();
    return { fetchUserInfo, currentUser, settings: defaultSettings as Partial<LayoutSettings>, settingDrawerOpen: false };
  }
  return { fetchUserInfo, settings: defaultSettings as Partial<LayoutSettings>, settingDrawerOpen: false };
}

export const layout: RunTimeLayoutConfig = ({ initialState, setInitialState }) => {
  return {
    actionsRender: () => [],
    avatarProps: {
      src: initialState?.currentUser?.avatar,
      title: initialState?.currentUser?.username || '用户',
      render: (_, avatarChildren) => <AvatarDropdown>{avatarChildren}</AvatarDropdown>,
    },
    footerRender: () => <Footer />,
    onPageChange: () => {
      const { location } = history;
      if (!initialState?.currentUser && location.pathname !== loginPath) {
        history.replace(loginPath);
      }
    },
    childrenRender: (children) => {
      return (
        <>
          {children}
          <SettingDrawer
            disableUrlParams
            enableDarkTheme
            collapse={initialState?.settingDrawerOpen}
            onCollapseChange={(open) => { setInitialState((s) => ({ ...s, settingDrawerOpen: open })); }}
            settings={initialState?.settings}
            onSettingChange={(settings) => { setInitialState((s) => ({ ...s, settings })); }}
          />
        </>
      );
    },
    ...initialState?.settings,
  };
};

export const request: RequestConfig = { ...errorConfig };
