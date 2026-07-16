import { join } from 'node:path';
import { defineConfig } from '@umijs/max';
import defaultSettings from './defaultSettings';
import proxy from './proxy';
import routes from './routes';

const { UMI_ENV = 'dev' } = process.env;

const PUBLIC_PATH: string = '/';

export default defineConfig({
  hash: true,
  publicPath: PUBLIC_PATH,
  routes,
  proxy: proxy[UMI_ENV as keyof typeof proxy],
  fastRefresh: true,
  routePrefetch: {},
  manifest: {},
  model: {},
  initialState: {},
  title: '批掌柜 BulkDesk',
  layout: {
    locale: true,
    ...defaultSettings,
  },
  locale: {
    default: 'zh-CN',
    antd: true,
    baseNavigator: true,
  },
  antd: {
    appConfig: {},
    configProvider: {
      theme: {},
    },
  },
  request: {},
  access: {},
  headScripts: [
    { src: join(PUBLIC_PATH, 'scripts/loading.js'), async: true },
  ],
  esbuildMinifyIIFE: true,
});
