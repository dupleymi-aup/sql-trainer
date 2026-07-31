import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3', 'ioredis'],
  outputFileTracingExcludes: {
    '/api/**': ['data/**'],
  },
  // Force body size limit for API routes (1MB default)
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
  compress: true,
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            // unsafe-inline required for Next.js hydration scripts; migrate to nonces when supported
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "media-src 'none'",
            "object-src 'none'",
            "frame-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            'upgrade-insecure-requests',
          ].join('; '),
        },
      ],
    },
  ],
  // Deduplicate @codemirror packages to avoid "multiple instances of @codemirror/state" error
  transpilePackages: [
    '@codemirror/state',
    '@codemirror/view',
    '@codemirror/language',
    '@codemirror/commands',
    '@codemirror/search',
    '@codemirror/autocomplete',
    '@codemirror/lang-sql',
    '@codemirror/theme-one-dark',
    '@lezer/highlight',
    '@lezer/common',
    '@lezer/lr',
    '@lezer/javascript',
    'codemirror',
    'style-mod',
    'w3c-keyname',
  ],
  // Force webpack to resolve these packages to a single instance
  webpack: (config, { isServer }) => {
    if (!isServer && !process.env.TURBOPACK) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        '@codemirror/state': require.resolve('@codemirror/state'),
        '@codemirror/view': require.resolve('@codemirror/view'),
        '@codemirror/language': require.resolve('@codemirror/language'),
        '@codemirror/commands': require.resolve('@codemirror/commands'),
        '@codemirror/search': require.resolve('@codemirror/search'),
        '@codemirror/autocomplete': require.resolve('@codemirror/autocomplete'),
        '@codemirror/lang-sql': require.resolve('@codemirror/lang-sql'),
        '@codemirror/theme-one-dark': require.resolve('@codemirror/theme-one-dark'),
        '@lezer/highlight': require.resolve('@lezer/highlight'),
        '@lezer/common': require.resolve('@lezer/common'),
      };
    }
    return config;
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default withBundleAnalyzer(nextConfig);
