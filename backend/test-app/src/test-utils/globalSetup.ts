import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export default async function globalSetup() {
  const dataSource = new DataSource({
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

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
