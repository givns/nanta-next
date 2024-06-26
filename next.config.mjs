import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  // You might want to remove or modify other security headers if they're too restrictive
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
  // Remove or modify other headers as needed
];

export default {
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
    config.resolve.modules.push(__dirname + '/src');
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
};
