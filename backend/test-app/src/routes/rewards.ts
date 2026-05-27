import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { RewardService } from '../services/RewardService';
import { authenticate } from '../middleware/auth';
import { ResponseHelper } from '../utils/ResponseHelper';
import { HttpStatus } from '../utils/HttpStatus';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
  PAGINATION_MAX_LIMIT,
  PAGINATION_MIN_LIMIT,
  PAGINATION_MIN_PAGE,
} from '../utils/constants';

// ─── schemas ──────────────────────────────────────────────────────────────────

const PaginationQuery = Type.Object({
  page:  Type.Optional(Type.Integer({ minimum: PAGINATION_MIN_PAGE, default: PAGINATION_DEFAULT_PAGE })),
  limit: Type.Optional(Type.Integer({ minimum: PAGINATION_MIN_LIMIT, maximum: PAGINATION_MAX_LIMIT, default: PAGINATION_DEFAULT_LIMIT })),
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
      const page  = request.query.page  ?? PAGINATION_DEFAULT_PAGE;
      const limit = request.query.limit ?? PAGINATION_DEFAULT_LIMIT;

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
      const page  = request.query.page  ?? PAGINATION_DEFAULT_PAGE;
      const limit = request.query.limit ?? PAGINATION_DEFAULT_LIMIT;

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
