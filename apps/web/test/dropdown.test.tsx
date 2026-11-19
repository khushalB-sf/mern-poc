import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Dropdown } from '../src/shared/ui/Dropdown';
import { renderApp, mockApi, baseHandlers, page } from './helpers';

const panel = (props: Partial<React.ComponentProps<typeof Dropdown>> = {}) =>
  render(
    <div>
      <button type="button">outside</button>
      <Dropdown label="Technology" {...props}>
        <label>
          <input type="checkbox" /> React
        </label>
        <label>
          <input type="checkbox" /> Angular
        </label>
        <label>
          <input type="checkbox" /> Vue
        </label>
      </Dropdown>
    </div>,
  );
const details = () => document.querySelector('details')!;
const summary = () => screen.getByText('Technology', { selector: 'summary span' });
const open = async () => {
  await userEvent.click(summary());
  expect(details().open).toBe(true);
};

describe('Dropdown', () => {
  it('opens from the summary and shows the selection count and single value', () => {
    panel({ count: 2, value: 'Approved' });
    expect(screen.getByText('selected')).toBeInTheDocument();
    expect(screen.getByText(': Approved')).toBeInTheDocument();
  });

  it('closes when the user presses anywhere outside', async () => {
    panel();
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(details().open).toBe(false);
  });

  it('Escape closes it and returns focus to the button', async () => {
    panel();
    await open();
    await userEvent.tab(); // into the first checkbox
    await userEvent.keyboard('{Escape}');
    expect(details().open).toBe(false);
    expect(document.activeElement?.tagName).toBe('SUMMARY');
  });

  it('keyboard focus leaving the panel closes it', async () => {
    panel();
    await open();
    const last = screen.getByRole('checkbox', { name: 'Angular' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' }); // a key press, not the mouse, moves focus
    fireEvent.focusOut(last, { relatedTarget: screen.getByRole('button', { name: 'outside' }) });
    expect(details().open).toBe(false);
  });

  it('REGRESSION: pressing the mouse on option text (focus jumps away) does not close it', async () => {
    // A press on non-focusable text moves focus to <main>; closing then crashed Chromium tabs.
    panel();
    await open();
    const label = screen.getByText('React');
    fireEvent.pointerDown(label);
    fireEvent.focusOut(label, { relatedTarget: document.body });
    expect(details().open).toBe(true);
    await userEvent.click(label); // and the click still toggles the checkbox
    expect(screen.getByRole('checkbox', { name: 'React' })).toBeChecked();
    expect(details().open).toBe(true);
  });

  it('single-select lists close after a choice, multi-select lists stay open', async () => {
    const { unmount } = panel({ closeOnChange: true });
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    expect(details().open).toBe(false);
    unmount();
    panel();
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    expect(details().open).toBe(true);
  });
});

describe('Dropdown keyboard use', () => {
  const box = (name: string) => screen.getByRole('checkbox', { name });

  it('ArrowDown from the button opens the list and focuses the first option', async () => {
    panel();
    summary().closest('summary')!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(details().open).toBe(true);
    expect(box('React')).toHaveFocus();
  });

  it('arrows move between options and stop at the ends; Home and End jump', async () => {
    panel();
    await open();
    box('React').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(box('Angular')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(box('Vue')).toHaveFocus(); // no wrap past the last
    await userEvent.keyboard('{Home}');
    expect(box('React')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(box('Vue')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(box('Angular')).toHaveFocus();
  });

  it('ArrowUp on the first option returns to the button', async () => {
    panel();
    await open();
    box('React').focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement?.tagName).toBe('SUMMARY');
  });

  it('typing letters jumps to the option that starts with them', async () => {
    panel();
    await open();
    box('React').focus();
    await userEvent.keyboard('v');
    expect(box('Vue')).toHaveFocus();
    await new Promise((r) => setTimeout(r, 750)); // a pause starts a new prefix
    await userEvent.keyboard('an');
    expect(box('Angular')).toHaveFocus();
  });

  it('typing does not toggle anything, and Space still toggles the focused option', async () => {
    panel();
    await open();
    box('React').focus();
    await userEvent.keyboard('v');
    expect(box('Vue')).not.toBeChecked();
    await userEvent.keyboard(' ');
    expect(box('Vue')).toBeChecked();
  });
});

describe('error and not-found pages', () => {
  it('an unknown URL shows a friendly page with a way back', async () => {
    mockApi({ ...baseHandlers, 'GET /api/questions': { body: page([]) } });
    renderApp('/definitely/not/here');
    expect(await screen.findByText("That page doesn't exist")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to all questions' })).toHaveAttribute('href', '/');
  });
});
