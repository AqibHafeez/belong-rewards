import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import Bull from 'bull';
import { config } from '../config';

declare module 'fastify' {
  interface FastifyInstance {
    challengeQueue: Bull.Queue;
  }
}

const bullPlugin: FastifyPluginAsync = async (fastify) => {
  const challengeQueue = new Bull('challenge-completions', {
    redis: config.redis.url,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  challengeQueue.on('failed', (job, err) => {
    fastify.log.error({ jobId: job.id, err }, 'Challenge completion job failed');
  });

  fastify.decorate('challengeQueue', challengeQueue);

  fastify.addHook('onClose', async () => {
    await challengeQueue.close();
    fastify.log.info('Bull queue closed');
  });
};

export default fp(bullPlugin, { name: 'bull' });
