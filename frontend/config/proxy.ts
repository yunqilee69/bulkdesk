const apiTarget = process.env.API_TARGET || 'http://localhost:8000';

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
