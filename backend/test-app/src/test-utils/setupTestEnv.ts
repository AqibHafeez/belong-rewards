import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { REDIS_LEADERBOARD_KEY } from '../utils/constants';

dotenv.config();

export interface TestEnv {
  dataSource: DataSource;
  redis: Redis;
}

export function createTestDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT_TEST || '5433', 10),
    username: process.env.DB_USERNAME || 'belong',
    password: process.env.DB_PASSWORD || 'belong_dev',
    database: process.env.DB_DATABASE_TEST || 'fan_rewards_test',
    entities: [path.join(__dirname, '../entities/*.{ts,js}')],
    migrations: [path.join(__dirname, '../migrations/*.{ts,js}')],
    synchronize: false,
    logging: false,
  });
}

export async function setupTestEnv(): Promise<TestEnv> {
  const dataSource = createTestDataSource();
  await dataSource.initialize();

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  return { dataSource, redis };
}

export async function cleanupTestData(dataSource: DataSource, redis: Redis): Promise<void> {
  await dataSource.query('DELETE FROM audit_logs');
  await dataSource.query('DELETE FROM reward_redemptions');
  await dataSource.query('DELETE FROM challenge_completions');
  await dataSource.query('DELETE FROM refresh_tokens');
  await dataSource.query('DELETE FROM rewards');
  await dataSource.query('DELETE FROM challenges');
  await dataSource.query('DELETE FROM users');
  await redis.del(REDIS_LEADERBOARD_KEY);
}

export async function teardownTestEnv(dataSource: DataSource, redis: Redis): Promise<void> {
  await cleanupTestData(dataSource, redis);
  await redis.quit();
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
