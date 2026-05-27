import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'crypto';
import { config } from './config';
import dbPlugin from './plugins/db';
import redisPlugin from './plugins/redis';
import bullPlugin from './plugins/bull';
import correlationIdPlugin from './plugins/correlationId';
import challengeEventsPlugin from './plugins/challengeEvents';
import auditLogPlugin from './plugins/auditLog';
import { AppError } from './errors';
import swaggerPlugin from './plugins/swagger';
import { HttpStatus } from './utils/HttpStatus';
import { ResponseHelper } from './utils/ResponseHelper';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import challengeRoutes from './routes/challenges';
import rewardRoutes from './routes/rewards';
import leaderboardRoutes from './routes/leaderboard';
import adminRoutes from './routes/admin';
import { LeaderboardService } from './services/LeaderboardService';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
  });

  await app.register(swaggerPlugin);
  await app.register(correlationIdPlugin);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: config.rateLimit.globalMax,
    timeWindow: config.rateLimit.timeWindow,
    keyGenerator: (req) => (req.headers['x-forwarded-for'] as string) ?? req.ip,
  });

  await app.register(dbPlugin);
  await app.register(auditLogPlugin);
  await app.register(redisPlugin);
  await app.register(bullPlugin);
  await app.register(challengeEventsPlugin);

  app.get('/health', { schema: { tags: ['health'] } }, async (req, reply) => {
    try {
      await app.db.query('SELECT 1');
      await app.redis.ping();
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok({ db: 'up', redis: 'up' }, 'Service is healthy'));
    } catch (err) {
      req.log.error(err, 'Health check failed');
      return reply
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .send(ResponseHelper.error(HttpStatus.SERVICE_UNAVAILABLE, 'Service unavailable'));
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send(ResponseHelper.error(err.statusCode, err.message));
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply
        .status(err.statusCode)
        .send(ResponseHelper.error(err.statusCode as never, err.message));
    }
    req.log.error({ err, correlationId: req.id }, 'Unhandled error');
    return reply
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(ResponseHelper.error(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'));
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(challengeRoutes, { prefix: '/api/challenges' });
  await app.register(rewardRoutes, { prefix: '/api/rewards' });
  await app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  app.addHook('onReady', async () => {
    const leaderboardService = new LeaderboardService(app.db, app.redis);
    await leaderboardService.syncFromDB();
    app.log.info('Leaderboard cache warmed from DB');
  });

  return app;
}

async function start(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received shutdown signal, closing gracefully');
    try {
      await app.close();
      app.log.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
