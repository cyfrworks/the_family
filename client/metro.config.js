const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { createProxyMiddleware } = require('http-proxy-middleware');

const config = getDefaultConfig(__dirname);

// Proxy /cyfr requests to CYFR runtime (same as Vite's proxy in the web frontend)
config.server = config.server || {};
const originalEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (metroMiddleware, metroServer) => {
  const enhanced = originalEnhanceMiddleware
    ? originalEnhanceMiddleware(metroMiddleware, metroServer)
    : metroMiddleware;

  const cyfrProxy = createProxyMiddleware({
    target: 'http://localhost:4000',
    changeOrigin: true,
    pathRewrite: { '^/cyfr': '/mcp' },
  });

  return (req, res, next) => {
    if (req.url && req.url.startsWith('/cyfr')) {
      return cyfrProxy(req, res, next);
    }
    return enhanced(req, res, next);
  };
};

module.exports = withNativeWind(config, { input: './global.css' });
