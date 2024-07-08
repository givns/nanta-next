import Queue from 'bull';
import processRegistration from './registrationWorker';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error('REDIS_URL is not defined in the environment variables');
}

async function testRedisConnection(url: string) {
  try {
    console.log('Testing Redis connection...');
    const testQueue = new Queue('test-queue', url);

    console.log('Queue created, attempting to add job...');
    const job = await testQueue.add('test-job', { test: true });

    console.log('Test job added successfully. Job id:', job.id);

    console.log('Attempting to retrieve job...');
    const retrievedJob = await testQueue.getJob(job.id);

    if (retrievedJob) {
      console.log('Job retrieved successfully');
    } else {
      console.log('Job not found after adding');
    }

    console.log('Redis connection test successful');
  } catch (error) {
    console.error('Redis connection test failed:', error);
    throw error;
  }
}
async function startWorker(url: string) {
  try {
    await testRedisConnection(url);

    const registrationQueue = new Queue('user-registration', url);

    registrationQueue.process(async (job) => {
      console.log('Job starting to be processed:', job.id);
      try {
        const result = await processRegistration(job);
        console.log('Job completed:', job.id, 'Result:', result);
        return result;
      } catch (error) {
        console.error('Job failed:', job.id, 'Error:', error);
        throw error;
      }
    });

    console.log('Worker started and listening for jobs');
    console.log('Worker is now processing jobs');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker(REDIS_URL).catch(console.error);
