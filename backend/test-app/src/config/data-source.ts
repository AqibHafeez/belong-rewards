import { DataSource } from 'typeorm';
import * as path from 'path';
import { config } from './index';
import { User } from '../entities/User';
import { Challenge } from '../entities/Challenge';
import { ChallengeCompletion } from '../entities/ChallengeCompletion';
import { Reward } from '../entities/Reward';
import { RewardRedemption } from '../entities/RewardRedemption';
import { RefreshToken } from '../entities/RefreshToken';
import { AuditLog } from '../entities/AuditLog';
import {
  DB_POOL_CONNECTION_TIMEOUT_MS,
  DB_POOL_IDLE_TIMEOUT_MS,
} from '../utils/constants';

// Single default export — TypeORM CLI requires exactly one DataSource export
const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.username,
  password: config.db.password,
  database: config.db.database,
  entities: [User, Challenge, ChallengeCompletion, Reward, RewardRedemption, RefreshToken, AuditLog],
  migrations: [path.join(__dirname, '../migrations/*.{ts,js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  extra: {
    max: config.db.poolSize,
    min: config.db.poolMin,
    idleTimeoutMillis: DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DB_POOL_CONNECTION_TIMEOUT_MS,
  },
});

export default AppDataSource;
