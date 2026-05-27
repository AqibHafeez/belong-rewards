import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError, HttpStatus } from '../errors';
import { AUTH_BEARER_PREFIX, HTTP_HEADER_AUTHORIZATION } from '../utils/constants';

/**
 * Fastify preHandler that verifies the Bearer access token and
 * attaches `request.user` for downstream route handlers.
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers[HTTP_HEADER_AUTHORIZATION];
  if (!authHeader?.startsWith(AUTH_BEARER_PREFIX)) {
    throw new AppError(HttpStatus.UNAUTHORIZED, 'Missing or invalid Authorization header');
  }

  const token = authHeader.slice(AUTH_BEARER_PREFIX.length);
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as { userId: string };
    request.user = { userId: payload.userId };
  } catch {
    throw new AppError(HttpStatus.UNAUTHORIZED, 'Invalid or expired access token');
  }
}
