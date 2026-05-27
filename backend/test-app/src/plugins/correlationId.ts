import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';

const CORRELATION_HEADER = 'x-correlation-id';

const correlationIdPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    request.log = request.log.child({ correlationId: request.id });
  });

  fastify.addHook('onSend', async (request, reply) => {
    reply.header(CORRELATION_HEADER, request.id);
    reply.header('x-request-id', request.id);
  });
};

export default fp(correlationIdPlugin, { name: 'correlation-id' });
