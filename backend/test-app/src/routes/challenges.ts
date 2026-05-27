import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { ChallengeService } from '../services/ChallengeService';
import { authenticate } from '../middleware/auth';
import { ResponseHelper } from '../utils/ResponseHelper';
import { HttpStatus } from '../utils/HttpStatus';
import type { Difficulty } from '../entities/Challenge';

// ─── schemas ──────────────────────────────────────────────────────────────────

const ListQuery = Type.Object({
  page:       Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit:      Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  difficulty: Type.Optional(Type.Union([
    Type.Literal('easy'),
    Type.Literal('medium'),
    Type.Literal('hard'),
  ])),
  isActive:   Type.Optional(Type.Boolean({ default: true })),
});

const CompleteBody = Type.Object({
  listenPercentage: Type.Number({ minimum: 0, maximum: 100 }),
});

type ListQueryT    = Static<typeof ListQuery>;
type CompleteBodyT = Static<typeof CompleteBody>;

export default async function challengeRoutes(fastify: FastifyInstance) {
  const challengeService = new ChallengeService(fastify.db, fastify.redis);

  // Register Bull worker — runs off the HTTP thread
  fastify.challengeQueue.process(
    async (job) => challengeService.processCompletionJob(job),
  );

  // GET /api/challenges
  fastify.get<{ Querystring: ListQueryT }>(
    '/',
    { schema: { querystring: ListQuery } },
    async (request, reply) => {
      const page       = request.query.page       ?? 1;
      const limit      = request.query.limit      ?? 20;
      const difficulty = request.query.difficulty as Difficulty | undefined;
      const isActive   = request.query.isActive   ?? true;

      const { data, total } = await challengeService.list({
        page,
        limit,
        difficulty,
        isActive,
      });

      return reply.status(HttpStatus.OK).send(
        ResponseHelper.paginated(data, {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }, 'Challenges retrieved successfully'),
      );
    },
  );

  // GET /api/challenges/:id
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const challenge = await challengeService.getById(request.params.id);
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok(challenge, 'Challenge retrieved successfully'));
    },
  );

  // POST /api/challenges/:id/complete  — requires auth, enqueues async job
  fastify.post<{ Params: { id: string }; Body: CompleteBodyT }>(
    '/:id/complete',
    { schema: { body: CompleteBody }, preHandler: [authenticate] },
    async (request, reply) => {
      const result = await challengeService.enqueueCompletion(
        request.user!.userId,
        request.params.id,
        request.body.listenPercentage,
        fastify.challengeQueue,
      );

      return reply.status(HttpStatus.OK).send(
        ResponseHelper.ok(result, 'Challenge completion queued. Points will be credited to your account.'),
      );
    },
  );
}
