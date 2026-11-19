/** Words for the event types the API records. An unknown type falls back to the raw name. */
export const AUDIT_LABEL: Record<string, string> = {
  QUESTION_CREATED: 'Question added',
  QUESTION_UPDATED: 'Question edited',
  DUPLICATE_REJECTED: 'Duplicate blocked',
  DUPLICATE_OVERRIDDEN: 'Duplicate overridden',
  QUESTION_APPROVED: 'Question approved',
  QUESTION_REJECTED: 'Question rejected',
  QUESTION_DELETED: 'Question deleted',
  QUESTION_RESTORED: 'Question restored',
  USER_ROLE_CHANGED: 'User role changed',
  USER_CLIENTS_CHANGED: 'User departments changed',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User edited',
  USER_DELETED: 'User deleted',
  USER_RESTORED: 'User restored',
  CLIENT_CREATED: 'Department created',
  CLIENT_UPDATED: 'Department edited',
  CLIENT_DELETED: 'Department deleted',
  CLIENT_RESTORED: 'Department restored',
  TAG_CREATED: 'Technology created',
  TAG_UPDATED: 'Technology renamed',
  TAG_LINKED: 'Technology added to a department',
  TAG_UNLINKED: 'Technology removed from a department',
  TAG_ARCHIVED: 'Technology archived',
  TAG_RESTORED: 'Technology restored',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET_LINK_CREATED: 'Password reset link created',
  PASSWORD_RESET_USED: 'Password reset link used',
  MFA_ENABLED: 'Two-factor turned on',
  MFA_DISABLED: 'Two-factor turned off',
  MFA_RESET: 'Two-factor reset by an admin',
};

/** The few facts worth reading at a glance; the full payload is one click away. */
export function summarise(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (parts.length >= 3) break;
    if (typeof v === 'string' && v) parts.push(v.length > 60 ? `${v.slice(0, 57)}…` : v);
    else if (typeof v === 'number' || typeof v === 'boolean') parts.push(`${k}: ${String(v)}`);
  }
  return parts.join(' · ');
}
