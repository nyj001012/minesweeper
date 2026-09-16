import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/app/App';

describe('island minesweeper UI', () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint32Array) array[0] = 829;
      return array as typeof array;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates a rectangular board from independent row and column inputs', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.clear(screen.getByRole('spinbutton', { name: '행' }));
    await user.type(screen.getByRole('spinbutton', { name: '행' }), '5');
    await user.clear(screen.getByRole('spinbutton', { name: '열' }));
    await user.type(screen.getByRole('spinbutton', { name: '열' }), '7');
    await user.click(screen.getByRole('button', { name: '새 게임' }));

    const board = screen.getByRole('grid', { name: '지뢰찾기 보드' });
    expect(within(board).getAllByRole('button')).toHaveLength(35);
    expect(board).toHaveAttribute('aria-rowcount', '5');
    expect(board).toHaveAttribute('aria-colcount', '7');
  });

  it.each([
    ['4', '7'],
    ['41', '7'],
    ['5.5', '7'],
    ['5', '4'],
    ['5', '41'],
  ])('keeps the current board and explains invalid size %sx%s', async (rows, columns) => {
    const user = userEvent.setup();
    render(<App />);
    const boardBefore = screen.getByRole('grid', { name: '지뢰찾기 보드' });
    const cellCountBefore = within(boardBefore).getAllByRole('button').length;
    fireEvent.change(screen.getByRole('spinbutton', { name: '행' }), {
      target: { value: rows },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: '열' }), {
      target: { value: columns },
    });
    await user.click(screen.getByRole('button', { name: '새 게임' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/5.*40|정수/);
    expect(
      within(screen.getByRole('grid', { name: '지뢰찾기 보드' })).getAllByRole('button'),
    ).toHaveLength(cellCountBefore);
  });

  it('reveals ground with left click and toggles a flag with context menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    const hidden = screen.getAllByRole('button', { name: /숨김/ }).find((cell) => !cell.disabled)!;
    expect(hidden).toBeDefined();
    fireEvent.contextMenu(hidden);
    expect(hidden).toHaveAccessibleName(/깃발/);
    fireEvent.contextMenu(hidden);
    expect(hidden).toHaveAccessibleName(/숨김/);
    await user.click(hidden);
    expect(hidden).toHaveAccessibleName(/공개|인접 지뢰/);
  });

  it('renders rocks as named disabled cells that ignore both mouse buttons', () => {
    render(<App />);
    const rock = screen.getAllByRole('button', { name: /돌/ })[0];
    expect(rock).toBeDisabled();
    const before = rock.outerHTML;
    fireEvent.click(rock);
    fireEvent.contextMenu(rock);
    expect(rock.outerHTML).toBe(before);
  });

  it('starts at 0 seconds only after the first valid ground reveal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('0초');
    vi.advanceTimersByTime(2_000);
    expect(timer).toHaveTextContent('0초');

    const hidden = screen.getAllByRole('button', { name: /숨김/ }).find((cell) => !cell.disabled)!;
    await user.click(hidden);
    expect(timer).toHaveTextContent('0초');
    vi.advanceTimersByTime(1_100);
    expect(timer).toHaveTextContent('1초');
  });

  it('announces an outcome and blocks every cell interaction after the game ends', async () => {
    const user = userEvent.setup();
    render(<App />);
    const board = screen.getByRole('grid', { name: '지뢰찾기 보드' });

    for (let attempts = 0; attempts < 1_600; attempts += 1) {
      if (screen.queryByText(/승리|패배/)) break;
      const next = within(board)
        .getAllByRole('button')
        .find((cell) => !cell.disabled && /숨김/.test(cell.getAttribute('aria-label') ?? ''));
      if (!next) break;
      await user.click(next);
    }

    expect(screen.getByRole('status')).toHaveTextContent(/승리|패배/);
    for (const cell of within(board).getAllByRole('button')) {
      expect(cell).toBeDisabled();
    }
  });

  it('announces game state changes through a polite live region', () => {
    render(<App />);
    const announcement = screen.getByRole('status');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
    expect(announcement).toHaveTextContent(/준비/);
  });

  it('does not serialize hidden mine truth into the rendered UI', () => {
    const { container } = render(<App />);
    for (const hidden of screen.getAllByRole('button', { name: /숨김/ })) {
      expect(hidden).not.toHaveAttribute('data-has-mine');
      expect(hidden).not.toHaveAttribute('value', 'mine');
      expect(hidden.outerHTML).not.toMatch(/hasMine|has-mine|mine=(?:"|')?true/i);
    }
    expect(container.querySelector('[data-has-mine]')).not.toBeInTheDocument();
  });
});
