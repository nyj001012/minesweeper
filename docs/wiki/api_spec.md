# 게임 함수 계약

공개 진입점은 [`src/contracts/game.ts`](../../src/contracts/game.ts)입니다. 모든 호출은 프로세스 내부 TypeScript 함수이며 HTTP 엔드포인트, 인증, WebSocket 채널은 없습니다.

## 함수

| 함수                             | 입력                                                     | 반환                                               |
| -------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `parseBoardSize(input, config?)` | `{ rows: string, columns: string }`, 선택적 `GameConfig` | `{ ok: true, size }` 또는 `{ ok: false, errors }`  |
| `createGame(action)`             | `NewGameAction`                                          | `{ ok: true, state }` 또는 `{ ok: false, errors }` |
| `transitionGame(state, action)`  | `GameState`, 새 게임을 제외한 `GameAction`               | 적용·무변경·거부 결과                              |
| `selectGameViewModel(state)`     | `GameState`                                              | UI용 `GameViewModel`                               |
| `getElapsedSeconds(state)`       | `GameState`                                              | 내림한 경과 초, 미시작 시 0                        |

`createGame`에는 `type: 'new-game'`, `size: { rows, columns }`, `seed`, `nowMs`, 선택적 `config`를 전달합니다. 행·열은 5~40 정수, seed는 0~4294967295 정수, 시각은 유한한 0 이상 밀리초입니다. `parseBoardSize`는 숫자로만 이루어진 문자열을 받으며 공백·소수·지수 표기를 거부합니다.

| action.type    | 추가 payload                           | 동작                                   |
| -------------- | -------------------------------------- | -------------------------------------- |
| `new-game`     | `size`, `seed`, `nowMs`, `config?`     | `createGame`으로 새 상태 생성          |
| `reveal-cell`  | `coordinate: { row, column }`, `nowMs` | 땅 공개, 첫 지뢰 배치, 확산, 승패 판정 |
| `toggle-flag`  | `coordinate`, `nowMs`                  | 숨은 땅의 깃발 토글                    |
| `observe-time` | `nowMs`                                | 진행 중 표시 시각 갱신                 |

좌표는 0부터 시작하며 배열 인덱스는 `row * columns + column`입니다. UI 좌표 라벨만 1부터 표시합니다. 새 게임 action은 `transitionGame`에 전달하지 않습니다.

## 상태와 반환 스키마

`GameState`는 `size`, `config`, `cells`, `status`, `minesPlaced`, `totalMineCount`, `revealedSafeCellCount`, `prngState`, `placement`, `startedAtMs`, `endedAtMs`, `observedAtMs`를 갖습니다. `status`는 `ready → running → won | lost`로 전이하며 첫 공개에서 즉시 승리할 수도 있습니다. `placement`는 첫 공개 좌표, 표본 지뢰 비율·개수, 요청 보호 수와 실제 보호 좌표 기록입니다.

`Cell`은 돌 또는 땅입니다. 돌에는 `terrain: 'rock'`만 존재합니다. 숨은 땅은 지뢰 여부·깃발·인접 숫자를 가지고, 열린 땅은 안전 칸 또는 지뢰 칸으로 구분됩니다. UI에는 selector를 거친 `CellView`만 전달합니다. 숨은 칸의 지뢰 여부와 숫자는 뷰에 없습니다. 패배 시 클릭한 지뢰만 공개하며 다른 숨은 지뢰를 일괄 공개하지 않습니다.

`GameViewModel`에는 크기, 상태, 공개용 셀 배열, 경과 초, 지뢰 수(배치 전 `null`), 깃발 수, 상태 안내가 있습니다.

| 전이 결과 | 스키마                                           |
| --------- | ------------------------------------------------ |
| 적용      | `{ ok: true, changed: true, state }`             |
| 무변경    | `{ ok: true, changed: false, state, reason }`    |
| 거부      | `{ ok: false, state, error: { code, message } }` |

무변경과 거부는 기존 상태를 반환합니다. 무변경 사유는 `GAME_ALREADY_FINISHED`, `ROCK_CELL`, `FLAGGED_CELL`, `REVEALED_CELL`, `TIME_OBSERVATION_WHILE_NOT_RUNNING`입니다. 시각과 좌표 검증이 종료 여부 검사보다 먼저 수행되므로 종료 게임의 잘못된 payload도 거부될 수 있습니다.

## 오류 코드

설정 오류 항목은 `{ code, field, message }`이며 `field`는 `rows | columns | config | seed | nowMs`입니다.

| 설정 코드                                   | 의미                                                          |
| ------------------------------------------- | ------------------------------------------------------------- |
| `ROWS_NOT_INTEGER`, `COLUMNS_NOT_INTEGER`   | 정수 입력 아님                                                |
| `ROWS_OUT_OF_RANGE`, `COLUMNS_OUT_OF_RANGE` | 크기 또는 설정 범위 오류                                      |
| `INVALID_MINE_RATIO`                        | 유한한 `0 ≤ min ≤ max < 1` 위반                               |
| `INVALID_ROCK_RATIO`                        | 유한한 `0 ≤ ratio < 1` 위반 또는 덩어리 제한에 맞는 배치 실패 |
| `INVALID_ROCK_CLUSTER_SIZE`                 | 1~4 정수 위반                                                 |
| `INVALID_PROTECTION_WEIGHTS`                | 양의 정수 8개·합계 100 위반                                   |
| `INSUFFICIENT_MINE_CANDIDATES`              | 최대 보호 범위를 고려한 지뢰 후보 부족                        |
| `INVALID_SEED`                              | uint32 범위 위반                                              |
| `INVALID_TIMESTAMP`                         | 시각이 음수 또는 유한하지 않음                                |

| 전이 코드                   | 의미                                                     |
| --------------------------- | -------------------------------------------------------- |
| `COORDINATE_OUT_OF_BOUNDS`  | 좌표가 정수가 아니거나 보드 밖                           |
| `CLOCK_MOVED_BACKWARDS`     | `nowMs < observedAtMs`                                   |
| `INVALID_ACTION_PAYLOAD`    | 잘못된 시각 또는 허용되지 않은 action 종류               |
| `STATE_INVARIANT_VIOLATION` | 셀 개수 불일치 또는 진행 상태의 지뢰 배치/시작 시각 모순 |

TypeScript 계약에 맞는 객체가 입력 전제입니다. 함수가 임의 JSON 전체를 검증하는 네트워크 파서는 아닙니다. UI는 폼 오류 시 기존 게임을 유지하고, 전이 거부 시 보드를 차단한 뒤 새 게임 안내를 표시합니다.
