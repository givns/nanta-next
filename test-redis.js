const { createClient } = require('redis');

async function testRedisConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.error('REDIS_URL environment variable is not set');
    return;
  }

  console.log('Attempting to connect to Redis at URL:', redisUrl);

  const client = createClient({
    url: redisUrl,
  });

  client.on('error', (err) => console.log('Redis Client Error', err));

  try {
    await client.connect();
    console.log('Connected to Redis successfully');

    const pong = await client.ping();
    console.log('Redis PING response:', pong);

    await client.set('test_key', 'Hello from Node.js');
    const value = await client.get('test_key');
    console.log('Retrieved value:', value);

    await client.quit();
    console.log('Redis connection closed');
  } catch (error) {
    console.error('Error:', error);
  }
}

testRedisConnection();
