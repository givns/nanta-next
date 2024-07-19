const ContentSecurityPolicy = `
  default-src 'self' https://nanta-next.vercel.app;
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://static.line-scdn.net https://tfhub.dev;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.line-scdn.net;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.line-scdn.net https://*.line.me https://tfhub.dev https://www.kaggle.com https://nanta-next.vercel.app https://api.line.me;
  frame-src 'self' https://www.google.com;
  object-src 'none';
  prefetch-src 'self';
`;

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy.replace(/\s{2,}/g, ' ').trim(),
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
];

/** @type {import('next').NextConfig} */
const webpack = require('webpack');
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: [
      'maps.googleapis.com',
      'maps.gstatic.com',
      'profile.line-scdn.net',
      'example.com',
    ],
  },
  env: {
    NEXT_PUBLIC_LIFF_ID: process.env.NEXT_PUBLIC_LIFF_ID,
    GOOGLE_MAPS_API: process.env.GOOGLE_MAPS_API,
  },
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        buffer: require.resolve('buffer/'),
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
      };

      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        }),
      );
    }
    return config;
  },
};

module.exports = nextConfig;
