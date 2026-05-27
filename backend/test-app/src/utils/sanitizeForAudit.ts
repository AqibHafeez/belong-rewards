import {
  AUDIT_REDACTED_VALUE,
  AUDIT_SENSITIVE_FIELD_KEYS,
} from './constants';

const SENSITIVE_KEYS = new Set(AUDIT_SENSITIVE_FIELD_KEYS.map((key) => key.toLowerCase()));

export function sanitizeForAudit(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeForAudit);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? AUDIT_REDACTED_VALUE : sanitizeForAudit(val);
    }
    return result;
  }

  return value;
}
