import type { GameState, GameViewModel } from '../../../contracts/game';
import { coordinateOf } from '../engine/board';

export function getElapsedSeconds(state: GameState): number {
  return state.startedAtMs === null
    ? 0
    : Math.max(
        0,
        Math.floor(
          ((state.endedAtMs ?? state.observedAtMs) - state.startedAtMs) / 1000,
        ),
      );
}

export function selectGameViewModel(state: GameState): GameViewModel {
  return {
    size: state.size,
    status: state.status,
    elapsedSeconds: getElapsedSeconds(state),
    totalMineCount: state.minesPlaced ? state.totalMineCount : null,
    flagCount: state.cells.filter((c) => c.terrain === 'ground' && c.isFlagged)
      .length,
    statusAnnouncement: {
      ready: '준비 — 섬의 첫 칸을 열어 주세요.',
      running: '탐험 중',
      won: '승리! 섬을 안전하게 탐험했습니다.',
      lost: '패배 — 지뢰를 발견했습니다.',
    }[state.status],
    cells: state.cells.map((cell, index) => {
      const coordinate = coordinateOf(state.size, index);
      if (cell.terrain === 'rock')
        return { terrain: 'rock', coordinate, interaction: 'disabled' };
      if (cell.visibility === 'hidden')
        return {
          terrain: 'ground',
          coordinate,
          visibility: 'hidden',
          isFlagged: cell.isFlagged,
          interaction:
            state.status === 'ready' || state.status === 'running'
              ? 'enabled'
              : 'disabled',
        };
      if (cell.hasMine)
        return {
          terrain: 'ground',
          coordinate,
          visibility: 'revealed',
          content: 'mine',
          isExploded: cell.isExploded,
          interaction: 'disabled',
        };
      return {
        terrain: 'ground',
        coordinate,
        visibility: 'revealed',
        content: 'safe',
        adjacentMineCount: cell.adjacentMineCount,
        interaction: 'disabled',
      };
    }),
  };
}
