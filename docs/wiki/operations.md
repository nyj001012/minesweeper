# 실행·검증·배포 가이드

## 로컬 실행

Node.js 22.12 이상과 npm 10 이상에서 `npm ci` 후 `npm run dev`를 실행합니다. 배포용 빌드는 `npm run build`, 확인은 `npm run preview`입니다. 산출물은 `dist/`이며 Git에 넣지 않습니다.

| 명령                                                 | 용도                                    |
| ---------------------------------------------------- | --------------------------------------- |
| `npm run format:check`                               | 앱·테스트·설정 포맷 검사                |
| `npm run format -- README.md docs/wiki/*.md`         | 지정한 문서만 포맷 적용                 |
| `npm run lint`                                       | ESLint, 경고도 실패                     |
| `npm run typecheck`                                  | TypeScript 검사                         |
| `npm run test:unit`                                  | 단위·컴포넌트 테스트 1회                |
| `npm run test:unit:watch`                            | 테스트 감시                             |
| `npm run test:coverage`                              | v8 커버리지와 임계값 검사               |
| `npm run check`                                      | 포맷 → 린트 → 타입 → 단위 테스트 → 빌드 |
| `npx playwright install --with-deps chromium webkit` | E2E 브라우저 설치                       |
| `npm run test:e2e`                                   | Chromium/WebKit E2E                     |

E2E는 자체적으로 e2e 모드 빌드와 `127.0.0.1:4173` 서버를 기동합니다. 기존 서버를 재사용하지 않으므로 해당 포트는 비워 두세요. 고정 seed URL은 e2e 모드에서만 적용되며 일반 배포 빌드에서는 비활성입니다. E2E 실행 후 배포 파일이 필요하면 일반 `npm run build`로 다시 생성합니다.

## 검증 기준과 완료 기록

전체 커버리지의 statements/branches/functions/lines는 각각 80% 이상, engine/state는 각각 90% 이상입니다. 커버리지 명령은 `check` 및 CI에 포함되지 않아 별도로 실행합니다.

구현 커밋 `26e0296`, E2E 커밋 `0b41c41`에 대한 최종 검증 전달 기록은 다음과 같습니다. 이전 QA·리뷰 차단 사항은 해소됐습니다.

- 코드 리뷰 승인, `npm run check` 통과, 단위·컴포넌트 테스트 66개 통과.
- E2E 26개 통과: Chromium 13개, WebKit 13개.
- 전체 커버리지: statements 95.68%, branches 93.92%, functions 100%, lines 96.55%. 설정된 임계값 통과.

이 기록은 해당 커밋의 결과이며 이후 변경에는 다시 검증이 필요합니다. 실제 Pages 배포 완료를 의미하지 않습니다.

## GitHub Actions와 Pages

PR과 `main` push에서 CI가 실행됩니다. CI는 설치, 설계 주입 최신성 검사, `check`, 브라우저 설치, E2E를 수행합니다. 실패 시 Playwright 보고서와 테스트 결과를 7일간 보관합니다. trace는 실패한 테스트에만 남습니다.

저장소 Settings → Pages에서 Source를 GitHub Actions로 설정해야 합니다. `main` push의 CI가 성공하면 배포 워크플로는 성공한 정확한 SHA를 체크아웃하고 일반 프로덕션 빌드를 다시 생성합니다. PR CI 성공만으로 배포하지 않습니다. Pages job에만 `pages: write`, `id-token: write` 권한이 있습니다.

현재 워크플로의 base path는 `/<저장소 이름>/`입니다. Vite 설정은 `VITE_BASE_PATH` 환경변수로 변경할 수 있습니다. 사용자 사이트 저장소나 커스텀 도메인의 루트 배포라면 빌드 환경을 `/`로 맞춰야 합니다. Pages 활성화 및 실제 배포는 이 문서 작성 시점에 실행하지 않았습니다.

## 문제 해결

| 증상                        | 확인과 대응                                                               |
| --------------------------- | ------------------------------------------------------------------------- |
| 설치·빌드의 Node 버전 오류  | Node 22.12 이상, npm 10 이상인지 확인하고 `npm ci`로 설치                 |
| E2E 브라우저 실행 파일 없음 | 위 Playwright 설치 명령 실행                                              |
| E2E 서버 기동 실패          | 4173 포트를 쓰는 개발 서버를 종료하고 재실행                              |
| Pages에서 자산 404          | 배포 URL 하위 경로와 `VITE_BASE_PATH` 일치 여부 확인                      |
| Pages 배포 미실행           | `main` push의 CI 성공 여부와 Pages Source 설정 확인                       |
| 입력을 거부함               | 행·열을 각각 5~40 정수로 입력; 기존 게임은 유지됨                         |
| 게임 진행 오류 안내         | 새 게임으로 초기화; 반복 시 재현 조건과 브라우저 오류 기록으로 조사       |
| CI 설계 주입 검사 실패      | 하네스의 설계 원본과 에이전트 주입 지문을 오케스트레이터가 갱신한 뒤 검증 |

앱은 진행 상황을 저장하지 않으므로 복구용 DB 백업은 없습니다. 배포를 되돌릴 때는 검증된 소스 변경을 `main`에 반영하고 동일 CI·배포 경로를 사용합니다.
