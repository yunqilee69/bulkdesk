import type { RequestOptions } from '@@/plugin-request/request';
import type { RequestConfig } from '@umijs/max';
import { message } from 'antd';

export const errorConfig: RequestConfig = {
  errorConfig: {
    errorThrower: (res) => {
      const { code, message: msg } = res as unknown as API.ResponseBase;
      if (code !== 0) {
        const error: any = new Error(msg);
        error.name = 'BizError';
        error.info = { code, message: msg };
        throw error;
      }
    },
    errorHandler: (error: any, opts: any) => {
      if (opts?.skipErrorHandler) throw error;
      if (error.name === 'BizError') {
        const errorInfo = error.info;
        if (errorInfo) { message.error(errorInfo.message || '请求失败'); }
      } else if (error.response) {
        if (error.response.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/user/login';
          return;
        }
        message.error(`请求错误: ${error.response.status}`);
      } else {
        message.error('网络异常，请重试');
      }
    },
  },
  requestInterceptors: [
    (config: RequestOptions) => {
      const token = localStorage.getItem('access_token');
      if (token) { config.headers = { ...config.headers, Authorization: `Bearer ${token}` }; }
      return config;
    },
  ],
  responseInterceptors: [],
};
