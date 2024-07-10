const ContentSecurityPolicy = `
default-src 'self' https://nanta-next.vercel.app;
 script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://static.line-scdn.net https://tfhub.dev;
 style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
 img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com;
 font-src 'self' https://fonts.gstatic.com;
 connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.line-scdn.net https://*.line.me https://tfhub.dev https://www.kaggle.com https://nanta-next.vercel.app;
 frame-src 'self' https://www.google.com;
 object-src 'none';
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
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = {
  reactStrictMode: true,
  devIndicators: {
    autoPrerender: false,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};
