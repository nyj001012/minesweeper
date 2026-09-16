import { useEffect, useReducer } from 'react';
import type { GameAction, GameState } from '../../../contracts/game';
import { createGame, transitionGame } from '../engine/game';
import { selectGameViewModel } from './selectors';

export function newSeed(): number {
  // This adapter is compiled out of production builds unless explicitly enabled for E2E.
  if (import.meta.env.MODE === 'e2e') {
    const seed = new URLSearchParams(window.location.search).get('seed');
    if (seed !== null && /^\d+$/.test(seed) && Number(seed) <= 0xffffffff)
      return Number(seed);
  }
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

interface Session {
  game: GameState;
  error: string | null;
}
function reducer(session: Session, action: GameAction): Session {
  if (session.error && action.type !== 'new-game') return session;
  const result =
    action.type === 'new-game'
      ? createGame(action)
      : transitionGame(session.game, action);
  if (!result.ok)
    return {
      ...session,
      error: '게임을 계속할 수 없습니다. 새 게임으로 다시 시작해 주세요.',
    };
  return { game: result.state, error: null };
}
function initialSession(): Session {
  const result = createGame({
    type: 'new-game',
    size: { rows: 10, columns: 10 },
    seed: newSeed(),
    nowMs: Date.now(),
  });
  if (!result.ok) throw new Error('초기 게임을 생성하지 못했습니다.');
  return { game: result.state, error: null };
}
export function useGame() {
  const [session, dispatch] = useReducer(reducer, undefined, initialSession);
  useEffect(() => {
    if (session.game.status !== 'running' || session.error) return;
    const timer = window.setInterval(
      () => dispatch({ type: 'observe-time', nowMs: Date.now() }),
      250,
    );
    return () => window.clearInterval(timer);
  }, [session.game.status, session.game.startedAtMs, session.error]);
  return {
    view: selectGameViewModel(session.game),
    error: session.error,
    dispatch,
  };
}
