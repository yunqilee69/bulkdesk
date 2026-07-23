export const defaultApiTarget = 'http://localhost:9000';

const apiTarget = process.env.API_TARGET || defaultApiTarget;

export default {
  dev: {
    '/api/': {
      target: apiTarget,
      changeOrigin: true,
    },
  },
  test: {
    '/api/': {
      target: apiTarget,
      changeOrigin: true,
    },
  },
  pre: {
    '/api/': {
      target: apiTarget,
      changeOrigin: true,
    },
  },
};
