const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test',
  LINE_CHANNEL_ACCESS_TOKEN: 'test_token',
  LINE_CHANNEL_SECRET: 'test_secret',
};

process.env = env;

export { env };
