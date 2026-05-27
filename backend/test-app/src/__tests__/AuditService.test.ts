import { sanitizeForAudit } from '../utils/sanitizeForAudit';
import { deriveAuditAction, shouldAuditRequest } from '../services/AuditService';
import { AUDIT_REDACTED_VALUE } from '../utils/constants';

describe('sanitizeForAudit', () => {
  it('redacts sensitive fields', () => {
    const result = sanitizeForAudit({
      email: 'user@example.com',
      password: 'secret',
      refreshToken: 'token-value',
      nested: { accessToken: 'jwt' },
    }) as Record<string, unknown>;

    expect(result.email).toBe('user@example.com');
    expect(result.password).toBe(AUDIT_REDACTED_VALUE);
    expect(result.refreshToken).toBe(AUDIT_REDACTED_VALUE);
    expect((result.nested as Record<string, unknown>).accessToken).toBe(AUDIT_REDACTED_VALUE);
  });

  it('leaves non-sensitive fields unchanged', () => {
    expect(sanitizeForAudit({ listenPercentage: 85 })).toEqual({ listenPercentage: 85 });
  });
});

describe('shouldAuditRequest', () => {
  it('audits mutating API routes', () => {
    expect(shouldAuditRequest('POST', '/api/auth/login')).toBe(true);
    expect(shouldAuditRequest('PATCH', '/api/users/me')).toBe(true);
  });

  it('skips GET requests', () => {
    expect(shouldAuditRequest('GET', '/api/challenges')).toBe(false);
  });

  it('skips health and docs paths', () => {
    expect(shouldAuditRequest('POST', '/health')).toBe(false);
    expect(shouldAuditRequest('POST', '/docs/json')).toBe(false);
  });
});

describe('deriveAuditAction', () => {
  it('builds a readable action label', () => {
    expect(deriveAuditAction('POST', '/api/auth/login')).toBe('auth.login');
    expect(deriveAuditAction('POST', '/api/challenges/abc/complete')).toBe('challenges.abc.complete');
  });
});
