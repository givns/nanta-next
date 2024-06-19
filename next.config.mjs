import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https:;
  style-src 'self' 'unsafe-inline' https:;
  img-src 'self' data: https:;
  connect-src 'self' https://liffsdk.line-scdn.net https://api.line.me;
`;

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy.replace(/\s+/g, ' ').trim(),
  },
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
