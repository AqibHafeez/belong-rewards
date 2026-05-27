import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { AuditService, deriveAuditAction, shouldAuditRequest } from '../services/AuditService';
import { sanitizeForAudit } from '../utils/sanitizeForAudit';

const auditLogPlugin: FastifyPluginAsync = async (fastify) => {
  const auditService = new AuditService(fastify.db);

  fastify.addHook('onRequest', async (request) => {
    request.auditStartTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    if (!shouldAuditRequest(request.method, request.url)) {
      return;
    }

    const durationMs = Date.now() - (request.auditStartTime ?? Date.now());
    const path = request.url.split('?')[0];

    const metadata: Record<string, unknown> = {};

    if (request.params && Object.keys(request.params).length > 0) {
      metadata.params = sanitizeForAudit(request.params);
    }

    if (request.query && Object.keys(request.query as object).length > 0) {
      metadata.query = sanitizeForAudit(request.query);
    }

    if (request.body && typeof request.body === 'object') {
      metadata.request = sanitizeForAudit(request.body);
    }

    void auditService
      .log({
        correlationId: request.id,
        userId: request.user?.userId ?? null,
        method: request.method,
        path,
        statusCode: reply.statusCode,
        durationMs,
        action: deriveAuditAction(request.method, path),
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      })
      .catch((err) => {
        request.log.error({ err, correlationId: request.id }, 'Failed to write audit log');
      });
  });
};

export default fp(auditLogPlugin, { name: 'audit-log', dependencies: ['db'] });
