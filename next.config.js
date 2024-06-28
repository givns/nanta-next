/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        // Remove the url polyfill
        // url: require.resolve('url/'),
      };
    }

    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    return config;
  },
  images: {
    domains: ['maps.googleapis.com', 'maps.gstatic.com'],
  },
};

module.exports = nextConfig;
