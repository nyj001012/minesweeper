import { Board } from '../features/game/components/Board';
import { SetupForm } from '../features/game/components/SetupForm';
import { newSeed, useGame } from '../features/game/state/useGame';
import styles from '../features/game/styles/Game.module.css';

export default function App() {
  const { view, dispatch, error } = useGame();
  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>ISLAND MINESWEEPER</p>
        <h1>작은 섬의 탐험</h1>
        <p>돌 사이에 숨은 지뢰를 피해, 나만의 섬을 열어 보세요.</p>
      </header>
      <section className={styles.panel} aria-label="게임 설정과 보드">
        <SetupForm
          onNewGame={(size) =>
            dispatch({
              type: 'new-game',
              size,
              seed: newSeed(),
              nowMs: Date.now(),
            })
          }
        />
        <div className={styles.stats}>
          <span role="timer" aria-label="경과 시간">
            {view.elapsedSeconds}초
          </span>
          <span>깃발 {view.flagCount}</span>
          <span>지뢰 {view.totalMineCount ?? '—'}</span>
        </div>
        <p role="status" aria-live="polite" className={styles.status}>
          {view.statusAnnouncement}
        </p>
        {error && <p role="alert">{error}</p>}
        <Board
          view={view}
          blocked={Boolean(error)}
          onReveal={(coordinate) =>
            dispatch({ type: 'reveal-cell', coordinate, nowMs: Date.now() })
          }
          onFlag={(coordinate) =>
            dispatch({ type: 'toggle-flag', coordinate, nowMs: Date.now() })
          }
        />
        <p className={styles.instructions}>
          왼쪽 클릭: 칸 열기 <span aria-hidden="true">·</span> 오른쪽 클릭: 깃발
          <br />
          돌은 열 수 없어요. 첫 번째로 여는 칸은 안전합니다.
        </p>
      </section>
      <footer className={styles.footer}>
        한 칸씩, 천천히. 섬의 모든 안전한 땅을 찾아보세요.
      </footer>
    </main>
  );
}
