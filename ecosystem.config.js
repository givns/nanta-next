module.exports = {
  apps: [
    {
      name: 'nanta-next',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/Users/parunpatpatchaichaiyakorn/nanta-next', // Adjust if necessary
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'attendance-worker',
      script: 'npm',
      args: 'run start:attendance-worker',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      output: './logs/worker-out.log',
      error: './logs/worker-error.log',
      log: './logs/worker-combined.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
