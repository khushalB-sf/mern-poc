// Seeded demo users (see USERS in apps/api/src/seed/data.ts). All share SEED_PASSWORD.
// `grants` lists the departments (the API's "clients") the user may see. Keep it in step with the seed.
export const DEMO_CLIENTS = [
  'MERN',
  'MEAN',
  'Python',
  'AI-ML',
  'Data Engineering',
  'DevOps',
] as const;
export type DemoClient = (typeof DEMO_CLIENTS)[number];

export interface DemoAccount {
  email: string;
  label: string;
  role: 'Author' | 'Reviewer' | 'Read-only' | 'Admin';
  grants: readonly DemoClient[];
  /** Admins see every department regardless of grants. */
  seesAll?: boolean;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'admin@example.com',
    label: 'Admin (sees everything)',
    role: 'Admin',
    grants: [],
    seesAll: true,
  },
  {
    email: 'author.mern@example.com',
    label: 'Author in MERN and MEAN',
    role: 'Author',
    grants: ['MERN', 'MEAN'],
  },
  {
    email: 'author.python@example.com',
    label: 'Author in Python and AI-ML',
    role: 'Author',
    grants: ['Python', 'AI-ML'],
  },
  {
    email: 'author.data@example.com',
    label: 'Author in Data Engineering and DevOps',
    role: 'Author',
    grants: ['Data Engineering', 'DevOps'],
  },
  {
    email: 'author.all@example.com',
    label: 'Author in every department',
    role: 'Author',
    grants: [...DEMO_CLIENTS],
  },
  {
    email: 'author.none@example.com',
    label: 'Author with no department access',
    role: 'Author',
    grants: [],
  },
  {
    email: 'reviewer.web@example.com',
    label: 'Reviewer for MERN and MEAN',
    role: 'Reviewer',
    grants: ['MERN', 'MEAN'],
  },
  {
    email: 'reviewer.all@example.com',
    label: 'Reviewer for every department',
    role: 'Reviewer',
    grants: [...DEMO_CLIENTS],
  },
  {
    email: 'user.mern@example.com',
    label: 'Read-only user in MERN',
    role: 'Read-only',
    grants: ['MERN'],
  },
  {
    email: 'user.python@example.com',
    label: 'Read-only user in Python',
    role: 'Read-only',
    grants: ['Python'],
  },
  { email: 'user@example.com', label: 'Read-only user', role: 'Read-only', grants: [] },
];
