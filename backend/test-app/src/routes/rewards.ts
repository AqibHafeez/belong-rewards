import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { RewardService } from '../services/RewardService';
import { authenticate } from '../middleware/auth';
import { ResponseHelper } from '../utils/ResponseHelper';
import { HttpStatus } from '../utils/HttpStatus';

// ─── schemas ──────────────────────────────────────────────────────────────────

const PaginationQuery = Type.Object({
  page:  Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});

type PaginationQueryT = Static<typeof PaginationQuery>;

// ─── routes ───────────────────────────────────────────────────────────────────

export default async function rewardRoutes(fastify: FastifyInstance) {
  const rewardService = new RewardService(fastify.db, fastify.redis);

  fastify.addHook('onRoute', (route) => {
    route.schema = route.schema ?? {};
    route.schema.tags = ['rewards'];
    route.schema.security = [{ bearerAuth: [] }];
  });

  fastify.addHook('preHandler', authenticate);

  // GET /api/rewards?page=1&limit=20
  fastify.get<{ Querystring: PaginationQueryT }>(
    '/',
    { schema: { querystring: PaginationQuery } },
    async (request, reply) => {
      const page  = request.query.page  ?? 1;
      const limit = request.query.limit ?? 20;

      const { data, total } = await rewardService.list({ page, limit });

      return reply.status(HttpStatus.OK).send(
        ResponseHelper.paginated(data, {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }, 'Rewards retrieved successfully'),
      );
    },
  );

  // GET /api/rewards/history  — must be before /:id to avoid param capture
  fastify.get<{ Querystring: PaginationQueryT }>(
    '/history',
    { schema: { querystring: PaginationQuery } },
    async (request, reply) => {
      const page  = request.query.page  ?? 1;
      const limit = request.query.limit ?? 20;

      const { data, total } = await rewardService.getHistory(
        request.user!.userId,
        { page, limit },
      );

      return reply.status(HttpStatus.OK).send(
        ResponseHelper.paginated(data, {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }, 'Redemption history retrieved successfully'),
      );
    },
  );

  // POST /api/rewards/:id/redeem
  fastify.post<{ Params: { id: string } }>(
    '/:id/redeem',
    async (request, reply) => {
      const { redemption, remainingPoints } = await rewardService.redeem(
        request.user!.userId,
        request.params.id,
      );

      return reply.status(HttpStatus.CREATED).send(
        ResponseHelper.created(
          {
            redemptionId: redemption.id,
            rewardId: redemption.rewardId,
            pointsSpent: redemption.pointsSpent,
            status: redemption.status,
            redeemedAt: redemption.redeemedAt,
            remainingPoints,
          },
          'Reward redeemed successfully',
        ),
      );
    },
  );
}
