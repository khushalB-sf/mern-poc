import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TagPicker } from '../src/features/questions/components/TagPicker';

const categories = [
  {
    slug: 'technology',
    name: 'Technology',
    tags: [
      { value: 'react', label: 'React', retired: false },
      { value: 'angular', label: 'Angular', retired: true },
      { value: 'spark', label: 'Spark', retired: true },
    ],
  },
];

describe('TagPicker with retired technologies', () => {
  it('hides a retired tag unless the question already carries it', () => {
    render(
      <TagPicker categories={categories} selected={['technology:spark']} onToggle={() => {}} />,
    );
    expect(screen.getByRole('checkbox', { name: 'React' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Angular/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Spark/ })).toBeChecked();
    expect(screen.getByText('(retired)')).toBeInTheDocument();
  });
});
