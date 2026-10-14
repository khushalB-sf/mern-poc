// Static seed taxonomy and fixtures. Marker keywords below never occur in the generated vocabulary.
export const CATEGORIES = [
  {
    slug: 'technology',
    name: 'Technology',
    tags: [
      ['react', 'React'],
      ['nodejs', 'Node.js'],
      ['typescript', 'TypeScript'],
      ['postgresql', 'PostgreSQL'],
      ['docker', 'Docker'],
      ['aws', 'AWS'],
      ['python', 'Python'],
      ['java', 'Java'],
      ['go', 'Go'],
      ['kubernetes', 'Kubernetes'],
      ['graphql', 'GraphQL'],
      ['mongodb', 'MongoDB'],
    ],
  },
  {
    slug: 'seniority',
    name: 'Seniority level',
    tags: [
      ['junior', 'Junior'],
      ['mid', 'Mid'],
      ['senior', 'Senior'],
      ['lead', 'Lead'],
    ],
  },
  {
    slug: 'type',
    name: 'Question type',
    tags: [
      ['technical', 'Technical'],
      ['behavioural', 'Behavioural'],
      ['system-design', 'System design'],
      ['coding', 'Coding'],
      ['screening', 'Screening'],
    ],
  },
] as const;

export const CLIENTS = ['Acme Corp', 'Globex'] as const;

export const SEED_PASSWORD_NOTE = 'All seeded users share SEED_PASSWORD.';

// grants: indexes into CLIENTS
export const USERS = [
  { email: 'user@example.com', name: 'Una User', role: 'USER', grants: [] },
  { email: 'user.acme@example.com', name: 'Uma Acme (read-only)', role: 'USER', grants: [0] },
  { email: 'author.acme@example.com', name: 'Alice Author (Acme)', role: 'AUTHOR', grants: [0] },
  { email: 'author.globex@example.com', name: 'Bob Author (Globex)', role: 'AUTHOR', grants: [1] },
  {
    email: 'author.none@example.com',
    name: 'Carol Author (no clients)',
    role: 'AUTHOR',
    grants: [],
  },
  {
    email: 'author.both@example.com',
    name: 'Dan Author (both clients)',
    role: 'AUTHOR',
    grants: [0, 1],
  },
  { email: 'reviewer@example.com', name: 'Rex Reviewer (Acme)', role: 'REVIEWER', grants: [0] },
] as const;

// Named fixtures for demos and manual checks. client: index into CLIENTS or null.
export const FIXTURES = [
  {
    text: 'What is the capybara pattern for zero-downtime releases?',
    notes: 'Global question. Marker keyword: capybara.',
    client: null,
    tags: ['technology:docker', 'seniority:senior', 'type:system-design'],
  },
  {
    text: 'How does Acme use the zebrafish deployment pipeline?',
    notes: 'Acme-only question. Marker keyword: zebrafish.',
    client: 0,
    tags: ['technology:aws', 'seniority:mid', 'type:technical'],
  },
  {
    text: 'What did Globex change in the narwhal billing flow?',
    notes: 'Globex-only question. Marker keyword: narwhal.',
    client: 1,
    tags: ['technology:nodejs', 'seniority:senior', 'type:technical'],
  },
  {
    text: 'Explain the difference between let, const and var in JavaScript.',
    notes: 'Global. Used to demonstrate duplicate detection.',
    client: null,
    tags: ['technology:typescript', 'seniority:junior', 'type:screening'],
  },
] as const;
