/** The database diagram on the How-it-works page must match apps/api/prisma/schema.prisma. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EDGES, ENTITIES, RELATIONSHIPS } from '../src/features/how-it-works/ErDiagram';
import { baseHandlers, mockApi, renderApp } from './helpers';

const schema = readFileSync(resolve(__dirname, '../../api/prisma/schema.prisma'), 'utf8');

interface Model {
  table: string;
  /** database column names that hold a foreign key, from `@relation(fields: [...])` */
  fkColumns: string[];
  columns: string[];
}

/** Reads each model: its table name, its columns, and which columns are foreign keys. */
function parse(): Model[] {
  return [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => {
    const body = m[2]!;
    const table = /@@map\("([^"]+)"\)/.exec(body)![1]!;
    // property name -> database column name
    const column = new Map<string, string>();
    const columns: string[] = [];
    for (const line of body.split('\n')) {
      const field = /^\s+(\w+)\s+\S+/.exec(line);
      if (!field || line.includes('@relation(') || /^\s+@@/.test(line)) continue;
      if (/\[\]/.test(line)) continue; // the other side of a relation
      const name = /@map\("([^"]+)"\)/.exec(line)?.[1] ?? field[1]!;
      column.set(field[1]!, name);
      columns.push(name);
    }
    const fkColumns = [...body.matchAll(/@relation\([^)]*fields: \[(\w+)\]/g)].map((r) =>
      column.get(r[1]!)!,
    );
    return { table, fkColumns, columns };
  });
}

describe('database diagram', () => {
  const models = parse();

  it('has exactly the tables of the schema', () => {
    expect(ENTITIES.map((e) => e.name).sort()).toEqual(models.map((m) => m.table).sort());
  });

  it('marks every foreign key column, and every key column it lists exists', () => {
    for (const m of models) {
      const entity = ENTITIES.find((e) => e.name === m.table)!;
      const names = entity.fields.map((f) => f.name.replace(/ \(.*\)$/, ''));
      for (const fk of m.fkColumns) {
        const field = entity.fields.find((f) => f.name === fk);
        expect(field?.kind, `${m.table}.${fk} should be marked FK`).toMatch(/fk/);
      }
      for (const f of entity.fields.filter((f) => f.kind)) {
        expect(m.columns, `${m.table}.${f.name} is not a column`).toContain(
          f.name.replace(/ \(.*\)$/, ''),
        );
      }
      expect(names.length).toBeGreaterThan(0);
    }
  });

  it('draws one line for each foreign key in the schema, plus the one deliberate non-FK reference', () => {
    const fkCount = models.reduce((n, m) => n + m.fkColumns.length, 0);
    expect(EDGES.filter((e) => !e.loose)).toHaveLength(fkCount);
    expect(EDGES.filter((e) => e.loose)).toHaveLength(1);
    // every line ends on a real table, and the many end is the table that holds the key
    for (const e of EDGES.filter((e) => !e.loose)) {
      const child = models.find((m) => m.table === e.child.table)!;
      if (e.child.field) expect(child.fkColumns).toContain(e.child.field);
    }
  });

  it('is shown on the Database tab with the relationships in words', async () => {
    mockApi({ ...baseHandlers });
    renderApp('/how-it-works#database');
    const heading = await screen.findByRole('heading', { name: 'Database diagram' });
    expect(heading).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Table relationships' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(RELATIONSHIPS.length);
    expect(list).toHaveTextContent('deliberately not a foreign key');
    expect(screen.getByRole('list', { name: 'Diagram key' })).toBeInTheDocument();
  });
});
