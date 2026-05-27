import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import Bull from 'bull';
import { config } from '../config';
import {
  BULL_JOB_ATTEMPTS,
  BULL_JOB_BACKOFF_DELAY_MS,
  BULL_QUEUE_CHALLENGE_COMPLETIONS,
  BULL_REMOVE_ON_COMPLETE_COUNT,
  BULL_REMOVE_ON_FAIL_COUNT,
} from '../utils/constants';

declare module 'fastify' {
  interface FastifyInstance {
    challengeQueue: Bull.Queue;
  }
}

const bullPlugin: FastifyPluginAsync = async (fastify) => {
  const challengeQueue = new Bull(BULL_QUEUE_CHALLENGE_COMPLETIONS, {
    redis: config.redis.url,
    defaultJobOptions: {
      attempts: BULL_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: BULL_JOB_BACKOFF_DELAY_MS },
      removeOnComplete: BULL_REMOVE_ON_COMPLETE_COUNT,
      removeOnFail: BULL_REMOVE_ON_FAIL_COUNT,
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
