import { config } from 'dotenv';
import { execSync } from 'child_process';

config({ path: '.env.local' });

console.log('Running Prisma commands with DATABASE_URL:', process.env.DATABASE_URL);

try {
  execSync('npx prisma db pull --force', { stdio: 'inherit' });
  execSync('npx prisma generate', { stdio: 'inherit' });
} catch (error) {
  console.error('Error running Prisma commands:', error);
}