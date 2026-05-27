import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { challengeEvents, CHALLENGE_COMPLETED } from '../events/challengeEvents';
import { REDIS_LEADERBOARD_KEY } from '../utils/constants';

const challengeEventsPlugin: FastifyPluginAsync = async (fastify) => {
  challengeEvents.on(CHALLENGE_COMPLETED, async (payload) => {
    await fastify.redis.zadd(REDIS_LEADERBOARD_KEY, payload.newTotalPoints, payload.userId);
    fastify.log.info(
      {
        userId: payload.userId,
        challengeId: payload.challengeId,
        newTotalPoints: payload.newTotalPoints,
      },
      'Leaderboard updated after challenge completion',
    );
  });
};

export default fp(challengeEventsPlugin, { name: 'challenge-events', dependencies: ['redis'] });
