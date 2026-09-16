import type { CSSProperties } from 'react';
import type {
  CellView,
  Coordinate,
  GameViewModel,
} from '../../../contracts/game';
import styles from '../styles/Game.module.css';

function appearance(cell: CellView): {
  label: string;
  symbol: string;
  style: string;
} {
  if (cell.terrain === 'rock')
    return { label: '돌', symbol: '◆', style: styles.rock };
  if (cell.visibility === 'hidden')
    return {
      label: cell.isFlagged ? '깃발' : '숨김',
      symbol: cell.isFlagged ? '⚑' : '',
      style: styles.hidden,
    };
  if (cell.content === 'mine')
    return { label: '지뢰 폭발', symbol: '✹', style: styles.mine };
  return {
    label: cell.adjacentMineCount
      ? `공개, 인접 지뢰 ${cell.adjacentMineCount}`
      : '공개, 빈칸',
    symbol: cell.adjacentMineCount ? String(cell.adjacentMineCount) : '',
    style: styles.revealed,
  };
}
export function Board({
  view,
  blocked,
  onReveal,
  onFlag,
}: {
  view: GameViewModel;
  blocked: boolean;
  onReveal: (coordinate: Coordinate) => void;
  onFlag: (coordinate: Coordinate) => void;
}) {
  return (
    <div
      className={styles.boardViewport}
      tabIndex={0}
      aria-label="보드 스크롤 영역"
    >
      <div
        role="grid"
        aria-label="지뢰찾기 보드"
        aria-rowcount={view.size.rows}
        aria-colcount={view.size.columns}
        className={styles.board}
        style={{ '--columns': view.size.columns } as CSSProperties}
      >
        {view.cells.map((cell) => {
          const { row, column } = cell.coordinate;
          const look = appearance(cell);
          return (
            <button
              key={`${row}:${column}`}
              type="button"
              className={`${styles.cell} ${look.style}`}
              disabled={blocked || cell.interaction === 'disabled'}
              aria-label={`${row + 1}행 ${column + 1}열, ${look.label}`}
              data-count={
                cell.terrain === 'ground' &&
                cell.visibility === 'revealed' &&
                cell.content === 'safe'
                  ? cell.adjacentMineCount
                  : undefined
              }
              onClick={() => onReveal(cell.coordinate)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!blocked && cell.interaction === 'enabled')
                  onFlag(cell.coordinate);
              }}
            >
              {look.symbol}
            </button>
          );
        })}
      </div>
    </div>
  );
}
