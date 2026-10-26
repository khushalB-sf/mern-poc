// Seeded demo users (see USERS in apps/api/src/seed/data.ts). All share SEED_PASSWORD.
// `grants` lists the clients the user may see, in DEMO_CLIENTS order. Keep it in step with the seed.
export const DEMO_CLIENTS = ['Acme', 'Globex'] as const;
export type DemoClient = (typeof DEMO_CLIENTS)[number];

export interface DemoAccount {
  email: string;
  label: string;
  role: 'Author' | 'Reviewer' | 'Read-only';
  grants: readonly DemoClient[];
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'author.acme@example.com',
    label: 'Author with Acme access',
    role: 'Author',
    grants: ['Acme'],
  },
  {
    email: 'author.globex@example.com',
    label: 'Author with Globex access',
    role: 'Author',
    grants: ['Globex'],
  },
  {
    email: 'author.both@example.com',
    label: 'Author with Acme and Globex access',
    role: 'Author',
    grants: ['Acme', 'Globex'],
  },
  {
    email: 'author.none@example.com',
    label: 'Author with no client access',
    role: 'Author',
    grants: [],
  },
  {
    email: 'reviewer@example.com',
    label: 'Reviewer with Acme access',
    role: 'Reviewer',
    grants: ['Acme'],
  },
  {
    email: 'reviewer.both@example.com',
    label: 'Reviewer with Acme and Globex access',
    role: 'Reviewer',
    grants: ['Acme', 'Globex'],
  },
  {
    email: 'user.acme@example.com',
    label: 'Read-only user with Acme access',
    role: 'Read-only',
    grants: ['Acme'],
  },
  {
    email: 'user.globex@example.com',
    label: 'Read-only user with Globex access',
    role: 'Read-only',
    grants: ['Globex'],
  },
  { email: 'user@example.com', label: 'Read-only user', role: 'Read-only', grants: [] },
];
