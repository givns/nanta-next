const dotenv = require('dotenv');
const path = require('path');
const webpack = require('webpack');

dotenv.config();

const ContentSecurityPolicy = `
  default-src *;
  script-src * 'unsafe-inline' 'unsafe-eval';
  style-src * 'unsafe-inline';
  img-src * data: blob:;
  font-src * data:;
  connect-src *;
  media-src *;
  object-src *;
  child-src *;
  frame-src *;
  worker-src *;
  form-action *;
  base-uri *;
  manifest-src *;
  prefetch-src *;
`;

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy.replace(/\s+/g, ' ').trim(),
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
    value: 'origin-when-cross-origin',
  },
];

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    CHANNEL_ACCESS_TOKEN: process.env.CHANNEL_ACCESS_TOKEN,
    CHANNEL_SECRET: process.env.CHANNEL_SECRET,
    MONGO_URI: process.env.MONGO_URI,
    LIFF_ID: process.env.LIFF_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_MAPS_API: process.env.GOOGLE_MAPS_API,
  },
  webpack: (config, { isServer }) => {
    config.resolve.modules.push(path.resolve(__dirname, 'src'));
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    domains: ['maps.googleapis.com', 'maps.gstatic.com'],
  },
};

module.exports = config;
