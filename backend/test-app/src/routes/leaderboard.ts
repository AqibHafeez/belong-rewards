import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { LeaderboardService } from '../services/LeaderboardService';
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

export default async function leaderboardRoutes(fastify: FastifyInstance) {
  const leaderboardService = new LeaderboardService(fastify.db, fastify.redis);

  // All leaderboard routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET /api/leaderboard?page=1&limit=20
  fastify.get<{ Querystring: PaginationQueryT }>(
    '/',
    { schema: { querystring: PaginationQuery } },
    async (request, reply) => {
      const page  = request.query.page  ?? 1;
      const limit = request.query.limit ?? 20;

      const { data, total } = await leaderboardService.getTopFans(page, limit);

      return reply.status(HttpStatus.OK).send(
        ResponseHelper.paginated(data, {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }, 'Leaderboard retrieved successfully'),
      );
    },
  );

  // GET /api/leaderboard/me  — current user's rank
  fastify.get('/me', async (request, reply) => {
    const result = await leaderboardService.getMyRank(request.user!.userId);
    return reply
      .status(HttpStatus.OK)
      .send(ResponseHelper.ok(result, 'Your rank retrieved successfully'));
  });
}
