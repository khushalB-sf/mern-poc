import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TagPicker } from '../src/features/questions/components/TagPicker';

const categories = [
  {
    slug: 'technology',
    name: 'Technology',
    tags: [
      { value: 'react', label: 'React', archived: false },
      { value: 'django', label: 'Django', archived: false },
      { value: 'angular', label: 'Angular', archived: true },
      { value: 'spark', label: 'Spark', archived: true },
    ],
  },
  { slug: 'seniority', name: 'Seniority level', tags: [{ value: 'mid', label: 'Mid' }] },
];

describe('TagPicker', () => {
  it('hides an archived tag unless the question already carries it', () => {
    render(
      <TagPicker categories={categories} selected={['technology:spark']} onToggle={() => {}} />,
    );
    expect(screen.getByRole('checkbox', { name: 'React' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Angular/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Spark/ })).toBeChecked();
    expect(screen.getByText('(archived)')).toBeInTheDocument();
  });

  it("offers only the department's technologies, plus any already selected", () => {
    render(
      <TagPicker
        categories={categories}
        technologies={new Set(['django'])}
        selected={['technology:react']}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Django' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'React' })).toBeChecked(); // kept, already selected
    // other categories are unaffected by the technology list
    expect(screen.getByRole('checkbox', { name: 'Mid' })).toBeInTheDocument();
  });

  it('with no department every active technology is offered', () => {
    render(<TagPicker categories={categories} selected={[]} onToggle={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'React' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Django' })).toBeInTheDocument();
  });

  it('groups technologies no department uses under "Other"', () => {
    const withOther = [
      {
        slug: 'technology',
        name: 'Technology',
        tags: [
          { value: 'react', label: 'React' },
          { value: 'go', label: 'Go', other: true },
        ],
      },
    ];
    render(<TagPicker categories={withOther} selected={[]} onToggle={() => {}} />);
    const other = screen.getByRole('group', { name: 'Other' });
    expect(within(other).getByRole('checkbox', { name: 'Go' })).toBeInTheDocument();
    expect(within(other).queryByRole('checkbox', { name: 'React' })).toBeNull();
  });

  it('shows no "Other" group when a department is chosen (it has no unassigned technologies)', () => {
    const withOther = [
      {
        slug: 'technology',
        name: 'Technology',
        tags: [
          { value: 'react', label: 'React' },
          { value: 'go', label: 'Go', other: true },
        ],
      },
    ];
    render(
      <TagPicker
        categories={withOther}
        technologies={new Set(['react'])}
        selected={[]}
        onToggle={() => {}}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Other' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Go' })).toBeNull();
  });
});
