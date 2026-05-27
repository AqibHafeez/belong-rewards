import { DataSource } from 'typeorm';
import { AuditLog } from '../entities/AuditLog';
import {
  AUDIT_MUTATING_METHODS,
  AUDIT_SKIP_PATH_DOCS,
  AUDIT_SKIP_PATH_HEALTH,
} from '../utils/constants';

export interface AuditLogInput {
  correlationId: string;
  userId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  action?: string | null;
  metadata?: Record<string, unknown> | null;
}

const MUTATING_METHODS = new Set<string>(AUDIT_MUTATING_METHODS);
const SKIP_PATH_PREFIXES = [AUDIT_SKIP_PATH_HEALTH, AUDIT_SKIP_PATH_DOCS];

export function shouldAuditRequest(method: string, url: string): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) {
    return false;
  }

  const path = url.split('?')[0];
  return !SKIP_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** e.g. POST /api/auth/login → auth.login */
export function deriveAuditAction(method: string, path: string): string {
  const apiPath = path.split('?')[0].replace(/^\/api\//, '');
  const [resource, ...rest] = apiPath.split('/').filter(Boolean);

  if (!resource) {
    return `${method.toLowerCase()} ${path}`;
  }

  const suffix = rest.length > 0 ? rest.join('.') : method.toLowerCase();
  return `${resource}.${suffix}`;
}

export class AuditService {
  constructor(private readonly db: DataSource) {}

  async log(input: AuditLogInput): Promise<AuditLog> {
    const repo = this.db.getRepository(AuditLog);
    const entry = repo.create({
      correlationId: input.correlationId,
      userId: input.userId ?? null,
      method: input.method.toUpperCase(),
      path: input.path.split('?')[0],
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      action: input.action ?? null,
      metadata: input.metadata ?? null,
    });

    return repo.save(entry);
  }
}
