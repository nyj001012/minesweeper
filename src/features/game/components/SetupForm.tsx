import { useState } from 'react';
import type { BoardSize } from '../../../contracts/game';
import { parseBoardSize } from '../engine/validation';
import styles from '../styles/Game.module.css';

export function SetupForm({
  onNewGame,
}: {
  onNewGame: (size: BoardSize) => void;
}) {
  const [rows, setRows] = useState('10'),
    [columns, setColumns] = useState('10');
  const [error, setError] = useState('');
  return (
    <form
      className={styles.setup}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseBoardSize({ rows, columns });
        if (!parsed.ok) {
          setError(parsed.errors.map((item) => item.message).join(' '));
          return;
        }
        setError('');
        onNewGame(parsed.size);
      }}
    >
      <label htmlFor="rows">
        행
        <input
          id="rows"
          type="number"
          min="5"
          max="40"
          step="1"
          value={rows}
          onChange={(event) => setRows(event.target.value)}
          aria-describedby={error ? 'setup-error' : undefined}
          aria-invalid={Boolean(error)}
        />
      </label>
      <span aria-hidden="true">×</span>
      <label htmlFor="columns">
        열
        <input
          id="columns"
          type="number"
          min="5"
          max="40"
          step="1"
          value={columns}
          onChange={(event) => setColumns(event.target.value)}
          aria-describedby={error ? 'setup-error' : undefined}
          aria-invalid={Boolean(error)}
        />
      </label>
      <button type="submit" className={styles.newGame}>
        새 게임
      </button>
      {error && (
        <p id="setup-error" role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  );
}
