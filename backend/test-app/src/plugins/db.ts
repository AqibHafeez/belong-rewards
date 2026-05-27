import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../config/data-source';

declare module 'fastify' {
  interface FastifyInstance {
    db: DataSource;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  await AppDataSource.initialize();
  fastify.log.info('PostgreSQL connected');

  fastify.decorate('db', AppDataSource);

  fastify.addHook('onClose', async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      fastify.log.info('PostgreSQL connection closed');
    }
  });
};

export default fp(dbPlugin, { name: 'db' });
