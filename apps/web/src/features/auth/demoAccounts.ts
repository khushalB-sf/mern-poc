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
    email: 'priya.sharma@mailinator.com',
    label: 'Priya Sharma, admin (sees everything)',
    role: 'Admin',
    grants: [],
    seesAll: true,
  },
  {
    email: 'aarav.mehta@mailinator.com',
    label: 'Aarav Mehta, author in MERN and MEAN',
    role: 'Author',
    grants: ['MERN', 'MEAN'],
  },
  {
    email: 'sofia.rossi@mailinator.com',
    label: 'Sofia Rossi, author in Python and AI-ML',
    role: 'Author',
    grants: ['Python', 'AI-ML'],
  },
  {
    email: 'daniel.okafor@mailinator.com',
    label: 'Daniel Okafor, author in Data Engineering and DevOps',
    role: 'Author',
    grants: ['Data Engineering', 'DevOps'],
  },
  {
    email: 'isabella.nguyen@mailinator.com',
    label: 'Isabella Nguyen, author in every department',
    role: 'Author',
    grants: [...DEMO_CLIENTS],
  },
  {
    email: 'chloe.martin@mailinator.com',
    label: 'Chloe Martin, author with no department access',
    role: 'Author',
    grants: [],
  },
  {
    email: 'rohan.verma@mailinator.com',
    label: 'Rohan Verma, reviewer for MERN and MEAN',
    role: 'Reviewer',
    grants: ['MERN', 'MEAN'],
  },
  {
    email: 'hannah.schmidt@mailinator.com',
    label: 'Hannah Schmidt, reviewer for every department',
    role: 'Reviewer',
    grants: [...DEMO_CLIENTS],
  },
  {
    email: 'emma.brooks@mailinator.com',
    label: 'Emma Brooks, read-only in MERN',
    role: 'Read-only',
    grants: ['MERN'],
  },
  {
    email: 'lucas.meyer@mailinator.com',
    label: 'Lucas Meyer, read-only in Python',
    role: 'Read-only',
    grants: ['Python'],
  },
  {
    email: 'noah.fischer@mailinator.com',
    label: 'Noah Fischer, read-only, no department access',
    role: 'Read-only',
    grants: [],
  },
];
