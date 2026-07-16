import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { history, useIntl, useModel } from '@umijs/max';
import { Alert, App } from 'antd';
import React, { useState } from 'react';
import { Footer } from '@/components';
import { login } from '@/services/api';
import Settings from '../../../../config/defaultSettings';

const LoginMessage: React.FC<{ content: string }> = ({ content }) => (
  <Alert style={{ marginBottom: 24 }} title={content} type="error" showIcon />
);

const Login: React.FC = () => {
  const [loginResult, setLoginResult] = useState<API.ResponseBase | null>(null);
  const { initialState, setInitialState } = useModel('@@initialState');
  const { message } = App.useApp();
  const intl = useIntl();

  const handleSubmit = async (values: API.LoginParams) => {
    try {
      const res = await login(values);
      if (res.code === 0 && res.data?.access_token) {
        localStorage.setItem('access_token', res.data.access_token);
        if (res.data.refresh_token) localStorage.setItem('refresh_token', res.data.refresh_token);
        message.success(intl.formatMessage({ id: 'pages.login.success', defaultMessage: '登录成功！' }));
        const userInfo = await initialState?.fetchUserInfo?.();
        if (userInfo) setInitialState((s) => ({ ...s, currentUser: userInfo }));
        const urlParams = new URL(window.location.href).searchParams;
        history.replace(urlParams.get('redirect') || '/');
        return;
      }
      setLoginResult(res);
    } catch (error: any) {
      if (error?.name === 'BizError' && error?.info) {
        setLoginResult({ code: error.info.code, message: error.info.message, data: null } as API.ResponseBase);
      } else if (error?.response?.status === 401) {
        setLoginResult({ code: 401, message: '用户名或密码错误', data: null } as API.ResponseBase);
      } else {
        setLoginResult({ code: -1, message: error?.message || '登录失败，请重试', data: null } as API.ResponseBase);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'auto', backgroundImage: "url('https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/V-_oS6r-i7wAAAAAAAAAAAAAFl94AQBr')", backgroundSize: '100% 100%' }}>
      <div style={{ flex: 1, padding: '32px 0' }}>
        <LoginForm contentStyle={{ minWidth: 280, maxWidth: '75vw' }} logo={<img alt="logo" src="/logo.svg" />} title={Settings.title} subTitle="小微批发经营管理系统" onFinish={async (values) => { await handleSubmit(values as API.LoginParams); }}>
          {loginResult && loginResult.code !== 0 && <LoginMessage content={loginResult.message || '账户或密码错误'} />}
          <ProFormText name="username" fieldProps={{ size: 'large', prefix: <UserOutlined /> }} placeholder={intl.formatMessage({ id: 'pages.login.username.placeholder', defaultMessage: '用户名' })} rules={[{ required: true, message: '请输入用户名!' }]} />
          <ProFormText.Password name="password" fieldProps={{ size: 'large', prefix: <LockOutlined /> }} placeholder={intl.formatMessage({ id: 'pages.login.password.placeholder', defaultMessage: '密码' })} rules={[{ required: true, message: '请输入密码！' }]} />
        </LoginForm>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
