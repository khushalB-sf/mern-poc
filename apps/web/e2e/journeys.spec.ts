import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'Passw0rd!demo';

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
const signedIn = (page: Page) =>
  expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
const search = async (page: Page, text: string) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill(text);
};

test.describe('signing in', () => {
  test('a wrong password is refused and the right one gets in', async ({ page }) => {
    await signIn(page, 'noah.fischer@mailinator.com', 'not-the-password');
    await expect(page.getByRole('alert')).toContainText('incorrect');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await signedIn(page);
  });

  test('every page needs a session, and signing out ends it', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, 'noah.fischer@mailinator.com');
    await signedIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('who sees what', () => {
  // The seed has one MERN-only question containing the word "zebrafish".
  test('a department-restricted question is found only by people granted that department', async ({
    page,
  }) => {
    await signIn(page, 'emma.brooks@mailinator.com');
    await signedIn(page);
    await search(page, 'zebrafish');
    await expect(page.getByRole('link', { name: /zebrafish/i })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();

    for (const email of ['lucas.meyer@mailinator.com', 'noah.fischer@mailinator.com']) {
      await signIn(page, email);
      await signedIn(page);
      await search(page, 'zebrafish');
      await expect(page.getByText(/no questions|nothing/i).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /zebrafish/i })).toHaveCount(0);
      await page.getByRole('button', { name: 'Sign out' }).click();
    }
  });

  test('a read-only user has no way to add questions and is turned away from admin pages', async ({
    page,
  }) => {
    await signIn(page, 'noah.fischer@mailinator.com');
    await signedIn(page);
    await expect(page.getByRole('link', { name: 'Add question' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /users/i })).toHaveCount(0);
  });
});

test.describe('the review workflow', () => {
  test('an author submits a question, a reviewer approves it, and then everyone can find it', async ({
    page,
  }) => {
    const text = `What does the event loop do in Node ${Date.now()}?`;

    await signIn(page, 'isabella.nguyen@mailinator.com');
    await signedIn(page);
    await page.goto('/questions/new');
    await page.getByLabel('Question', { exact: true }).fill(text);
    await page.getByLabel('Answer notes').fill('Runs callbacks when the stack is empty.');
    await page.getByRole('button', { name: /submit for review|add question/i }).click();
    await expect(page.getByText(text)).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();

    // not visible to a plain user while it waits
    await signIn(page, 'noah.fischer@mailinator.com');
    await signedIn(page);
    await search(page, text.slice(0, 30));
    await expect(page.getByRole('link', { name: text })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, 'hannah.schmidt@mailinator.com');
    await signedIn(page);
    await search(page, text.slice(0, 30));
    await page.getByRole('link', { name: text }).click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/approved/i).first()).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, 'noah.fischer@mailinator.com');
    await signedIn(page);
    await search(page, text.slice(0, 30));
    await expect(page.getByRole('link', { name: text })).toBeVisible();
  });
});

test.describe('keyboard', () => {
  test('a filter dropdown opens with the arrow key and picks an option with the space bar', async ({
    page,
  }) => {
    await signIn(page, 'priya.sharma@mailinator.com');
    await signedIn(page);
    await page.goto('/');
    const dropdown = page.locator('details', {
      has: page.locator('summary', { hasText: 'Technology' }),
    });
    await dropdown.locator('summary').focus();
    await page.keyboard.press('ArrowDown');
    await expect(dropdown.getByRole('checkbox').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dropdown.getByRole('checkbox').nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/tags=technology%3A/);
  });
});

// jsdom cannot compute colours, so contrast is only checked here, in a real browser.
test.describe('accessibility in a real browser (axe, incl. colour contrast)', () => {
  const scan = async (page: Page) => {
    await page.addScriptTag({
      path: fileURLToPath(new URL('../../../node_modules/axe-core/axe.min.js', import.meta.url)),
    });
    const result = await page.evaluate(() =>
      (
        window as unknown as {
          axe: {
            run: () => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }>;
          };
        }
      ).axe.run(),
    );
    return result.violations.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    );
  };

  test('sign-in, question list, a question, the add form and the admin pages have no violations', async ({
    page,
  }) => {
    await page.goto('/login');
    expect(await scan(page)).toEqual([]);

    await signIn(page, 'priya.sharma@mailinator.com');
    await signedIn(page);
    for (const path of [
      '/',
      '/questions/new',
      '/admin/users',
      '/admin/departments',
      '/admin/tags',
      '/admin/audit',
      '/how-it-works',
      '/how-it-works#path',
      '/how-it-works#database',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await scan(page), path).toEqual([]);
    }
  });
});

test.describe('admin lists share one pattern', () => {
  test('Users, Departments and Tags each have an Add button, a search box, filters and a table', async ({
    page,
  }) => {
    await signIn(page, 'priya.sharma@mailinator.com');
    await signedIn(page);
    for (const [path, add, search] of [
      ['/admin/users', 'Add user', 'Search users'],
      ['/admin/departments', 'Add department', 'Search departments'],
      ['/admin/tags', 'Add tag', 'Search tags'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: add })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: search })).toBeVisible();
      await expect(page.getByRole('table').first()).toBeVisible();
    }
  });

  test('the Users role filter narrows the table, and Clear filters restores it', async ({
    page,
  }) => {
    await signIn(page, 'priya.sharma@mailinator.com');
    await signedIn(page);
    await page.goto('/admin/users');
    const rows = page.getByRole('table').first().getByRole('row');
    await expect(rows.nth(2)).toBeVisible();
    const all = await rows.count();
    await page.getByLabel('Role', { exact: true }).selectOption('REVIEWER');
    await expect(page.getByText('2 users')).toBeVisible(); // the seed has two reviewers
    await expect(rows).toHaveCount(3); // header + two
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(rows).toHaveCount(all);
  });

  test('Add tag opens a dialog and the new tag shows up in the table', async ({ page }) => {
    await signIn(page, 'priya.sharma@mailinator.com');
    await signedIn(page);
    await page.goto('/admin/tags');
    await page.getByRole('button', { name: 'Add tag' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add tag' });
    await dialog.getByLabel('List').selectOption({ label: 'Seniority level' });
    const name = `Principal ${Date.now()}`;
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Add tag' }).click();
    await expect(page.getByRole('rowheader', { name })).toBeVisible();
  });
});

test.describe('layout consistency', () => {
  test('every page starts its title at the same place, on a wide screen and on a laptop', async ({
    page,
  }) => {
    await signIn(page, 'priya.sharma@mailinator.com');
    await signedIn(page);
    for (const size of [
      { width: 1900, height: 1000 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      const seen: Record<string, string> = {};
      for (const path of [
        '/',
        '/notifications',
        '/how-it-works',
        '/questions/new',
        '/admin/users',
        '/admin/departments',
        '/admin/tags',
        '/admin/deleted-questions',
        '/admin/audit',
        '/nope-not-a-page',
      ]) {
        await page.goto(path);
        const h = page.getByRole('main').getByRole('heading', { level: 1 }).first();
        // the not-found page has no h1 of its own: its message card is measured instead
        const target = path.startsWith('/nope')
          ? page.getByRole('heading', { name: "That page doesn't exist" })
          : h;
        await target.waitFor();
        const box = (await target.boundingBox())!;
        seen[path] = `${Math.round(box.x)},${Math.round(box.y)}`;
      }
      const titled = Object.entries(seen).filter(([p]) => p !== '/nope-not-a-page');
      const first = titled[0]![1];
      for (const [path, pos] of titled) {
        expect(pos, `${path} at ${size.width}px`).toBe(first);
      }
    }
  });
});
