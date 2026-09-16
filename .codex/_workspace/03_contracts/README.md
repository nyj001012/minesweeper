# 섬 지뢰찾기 MVP 계약 결정

- 대상 이슈: [#1](https://github.com/nyj001012/minesweeper/issues/1)
- 구현 대상: `game.contract.ts`를 기준으로 Phase 3에서 `src/contracts/game.ts`를 만든다.
- 서버·DB·네트워크 계약은 없다. `GameState`가 메모리 안의 단일 aggregate root다.

## 생성 불변조건

1. 행과 열은 각각 5~40의 정수다. 좌표는 내부에서 0부터 시작하고 셀 배열은 행 우선이다.
2. 새 게임은 먼저 `round(rows * columns * rockRatio)`개의 돌을 만든다. 기본 돌 비율은 0.08이고, 상하좌우로 연결된 각 돌 컴포넌트는 기본 최대 4칸이다. 돌은 지뢰·공개·깃발·숫자 상태를 갖지 않는다.
3. 지뢰는 첫 번째 유효한 `reveal-cell` 전까지 배치하지 않는다. 돌·깃발 칸 클릭은 유효한 첫 공개가 아니며 타이머도 시작하지 않는다.
4. 첫 공개 시 `[0.13, 0.17]`에서 지뢰 비율을 균등 표본 추출한다. 지뢰 수는 `floor((전체 칸 - 돌) * 표본 비율)`이다.
5. 첫 클릭 칸은 반드시 안전하다. 보호 가중치 `[5,10,15,20,20,15,10,5]`는 반경이 아니라 보호할 인접 플레이 가능 칸 수 1~8의 확률(%)이다. 실제 후보가 부족하면 가능한 후보 전부를 보호한다.
6. 돌, 첫 클릭 칸, 선택한 보호 칸은 지뢰 후보가 아니다. 지뢰와 보호 칸은 균등 비복원 추출한다. 모든 난수 소비는 `prngState`에 반영한다.
7. 기본 가중치는 양의 정수 8개이며 합계가 정확히 100이다. 비율 범위, 돌 설정, seed(uint32), timestamp(유한한 0 이상 수)가 유효하지 않으면 게임을 만들지 않는다.

## 상태 전이 불변조건

- 숫자는 최대 8방향의 인접 지뢰만 센다. 돌은 숫자에 기여하지 않는다.
- 0칸 공개는 큐 기반 BFS로 연결된 0칸과 경계 숫자 칸을 연다. 돌·지뢰·깃발 칸은 열거나 통과하지 않는다.
- 숨은 플레이 가능 칸만 깃발을 토글할 수 있다. 돌·공개 칸·종료된 게임의 입력은 명시적인 무변경 결과다.
- 첫 유효 공개는 `ready → running` 전이와 `startedAtMs = nowMs`를 한 번에 만든다. 첫 처리 직후 표시 시간은 0초다.
- 지뢰 공개는 즉시 `lost`로 만들고 `endedAtMs`를 고정한다. 안전한 비돌 칸을 모두 공개하면 깃발 정확도와 무관하게 `won`이다.
- `won`/`lost`의 공개·깃발은 무변경이다. 새 게임만 새 aggregate를 만든다.
- 표시 시간은 `floor(((endedAtMs ?? observedAtMs) - startedAtMs) / 1000)`이다. 미시작 상태는 0이며 interval 횟수를 누적하지 않는다. `observe-time`은 `running`에서만 화면 갱신용 시각을 바꾼다.
- 과거 시각, 범위 밖 좌표, 깨진 aggregate는 사용자 조작 no-op와 구별되는 거부 결과다.

## UI 경계

- React 컴포넌트는 `GameViewModel`만 소비하고 엔진 `Cell`을 직접 읽지 않는다. 진행 중 숨은 칸의 `hasMine`은 `CellView`에 존재하지 않는다.
- 각 칸은 `CellView.coordinate`와 보이는 상태로 접근 가능한 이름을 만든다. 돌과 공개 칸은 비활성 상호작용으로 표시하되 DOM에서 제거하지 않는다.
- 셀 우클릭 핸들러는 `contextmenu` 기본 동작을 막고 `toggle-flag`를 보낸다. 계약은 모바일 장기 누르기를 포함하지 않는다.
- 폼은 문자열을 먼저 받아 10진 정수로 검증한다. 실패하면 현재 `GameState`를 유지하고 오류를 표시한다.
- `statusAnnouncement`는 `aria-live="polite"` 영역에 연결한다. 40×40 레이아웃의 스크롤과 CSS 표현은 UI 구현 책임이며 도메인 계약에 넣지 않는다.

## 구현자별 소비 범위

| 소비자 | 계약 |
|---|---|
| 순수 엔진 | `GameConfig`, `Cell`, `GameState`, `createGame`, `transitionGame` |
| reducer / `useGame` | `GameAction`, `GameSetupResult`, `GameTransitionResult` |
| selector | `GameState → GameViewModel`, `getElapsedSeconds` |
| React UI | `BoardSetupInput`, `BoardSetupViewModel`, `GameViewModel`, `CellView` |
| QA | 오류 코드, 무변경 사유, 생성/상태 전이 불변조건 |

