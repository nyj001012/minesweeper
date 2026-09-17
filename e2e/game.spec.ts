import { test, expect, type Page } from '@playwright/test';

const board = (page: Page) => page.getByRole('grid', { name: '지뢰찾기 보드' });
const timer = (page: Page) => page.getByRole('timer', { name: '경과 시간' });
const cell = (page: Page, coordinate: string) =>
  board(page).getByRole('button', { name: new RegExp(`^${coordinate},`) });

async function newGame(page: Page, rows = 5, columns = 7) {
  await page
    .getByRole('spinbutton', { name: '행', exact: true })
    .fill(String(rows));
  await page
    .getByRole('spinbutton', { name: '열', exact: true })
    .fill(String(columns));
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await expect(board(page).getByRole('button')).toHaveCount(rows * columns);
  await expect(page.getByRole('status')).toContainText('준비');
  await expect(timer(page)).toHaveText('0초');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?seed=42');
});

test('직사각형 보드, 돌 비율, 준비 상태와 첫 클릭 보호', async ({
  page,
}, info) => {
  await newGame(page);
  await expect(board(page).getByRole('button', { name: /돌$/ })).toHaveCount(3);
  await expect(board(page).getByRole('button', { name: /숨김$/ })).toHaveCount(
    32,
  );
  await page.clock.install();
  await cell(page, '1행 1열').click();
  await expect(cell(page, '1행 1열')).toHaveAccessibleName(/공개/);
  await expect(page.getByRole('status')).toContainText('탐험 중');
  await expect(timer(page)).toHaveText('0초');
  await expect(
    board(page).getByRole('button', { name: /공개/ }),
  ).not.toHaveCount(1);
  await expect(
    board(page).getByRole('button', { name: /지뢰 폭발/ }),
  ).toHaveCount(0);
  await page.clock.runFor(1250);
  await expect(timer(page)).toHaveText('1초');
  await page.screenshot({
    path: info.outputPath('island-desktop.png'),
    fullPage: true,
  });
});

for (const field of ['행', '열']) {
  for (const value of ['4', '41', '5.5', '']) {
    test(`${field} 잘못된 값 ${value || '빈 값'} 거부`, async ({ page }) => {
      await newGame(page);
      await cell(page, '1행 1열').click({ button: 'right' });
      await page
        .getByRole('spinbutton', { name: field, exact: true })
        .fill(value);
      await page.getByRole('button', { name: '새 게임', exact: true }).click();
      await expect(board(page).getByRole('button')).toHaveCount(35);
      await expect(cell(page, '1행 1열')).toHaveAccessibleName(/깃발/);
      await expect(page.getByRole('alert')).toContainText(/5.*40/);
    });
  }
}

test('돌과 깃발은 타이머를 시작하지 않으며 깃발 칸 공개를 차단한다', async ({
  page,
}) => {
  await newGame(page);
  await page.clock.install();
  const rock = board(page).getByRole('button', { name: /돌$/ }).first();
  await expect(rock).toBeDisabled();
  await rock.click({ force: true });
  await rock.click({ button: 'right', force: true });
  await expect(rock).toHaveAccessibleName(/돌$/);
  const target = cell(page, '1행 1열');
  // Observe the actual browser contextmenu event after its target handler runs.
  await page.evaluate(() => {
    document.addEventListener('contextmenu', (event) => {
      document.body.dataset.contextMenuPrevented = String(
        event.defaultPrevented,
      );
    });
  });
  await target.click({ button: 'right' });
  await expect(page.locator('body')).toHaveAttribute(
    'data-context-menu-prevented',
    'true',
  );
  await expect(target).toHaveAccessibleName(/깃발/);
  await target.click();
  await expect(target).toHaveAccessibleName(/깃발/);
  await page.clock.runFor(2200);
  await expect(timer(page)).toHaveText('0초');
  await expect(page.getByRole('status')).toContainText('준비');
  await target.click({ button: 'right' });
  await expect(target).toHaveAccessibleName(/숨김/);
  await target.click();
  await page.clock.runFor(2100);
  await expect(timer(page)).toHaveText('2초');
  await newGame(page);
  await page.clock.runFor(1500);
  await expect(timer(page)).toHaveText('0초');
  await expect(
    board(page).getByRole('button', { name: /공개|깃발/ }),
  ).toHaveCount(0);
});

test('지뢰 클릭 패배, 타이머 정지, 종료 후 입력 차단과 재시작', async ({
  page,
}) => {
  await newGame(page);
  await page.clock.install();
  await cell(page, '1행 1열').click();
  await page.clock.runFor(2250);
  // These coordinates were observed by playing the seed=42 board in the browser.
  await cell(page, '2행 7열').click();
  await expect(page.getByRole('status')).toContainText('패배');
  await expect(cell(page, '2행 7열')).toHaveAccessibleName(/지뢰 폭발/);
  const state = await board(page).ariaSnapshot();
  await cell(page, '3행 3열').click({ force: true });
  await cell(page, '3행 3열').click({ button: 'right', force: true });
  await page.clock.runFor(5000);
  await expect(timer(page)).toHaveText('2초');
  expect(await board(page).ariaSnapshot()).toBe(state);
  await newGame(page);
  await expect(
    board(page).getByRole('button', { name: /지뢰 폭발|공개|깃발/ }),
  ).toHaveCount(0);
});

test('깃발 없이 모든 안전한 칸을 열면 승리하고 타이머가 멈춘다', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.clock.install();
  // Learn mines solely from visible explosions, replaying the same seeded board.
  // No engine imports, hidden DOM attributes, or private application state are read.
  const mines = new Set<string>();
  for (let attempt = 0; attempt < 7; attempt++) {
    await newGame(page);
    await cell(page, '1행 1열').click();
    await page.clock.runFor(2100);
    for (let step = 0; step < 35; step++) {
      if (/승리|패배/.test(await page.getByRole('status').innerText())) break;
      const hidden = await board(page)
        .getByRole('button', { name: /숨김$/ })
        .evaluateAll((elements) =>
          elements.map(
            (element) => element.getAttribute('aria-label')!.split(',')[0],
          ),
        );
      const next = hidden.find((coordinate) => !mines.has(coordinate));
      expect(
        next,
        'a safe move remains until all safe cells are open',
      ).toBeDefined();
      await cell(page, next!).click();
    }
    if ((await page.getByRole('status').innerText()).includes('승리')) break;
    await expect(page.getByRole('status')).toContainText('패배');
    const explosions = await board(page)
      .getByRole('button', { name: /지뢰 폭발/ })
      .evaluateAll((elements) =>
        elements.map(
          (element) => element.getAttribute('aria-label')!.split(',')[0],
        ),
      );

    for (const coordinate of explosions) {
      mines.add(coordinate);
    }
  }
  await expect(page.getByRole('status')).toContainText('승리');
  await expect(board(page).getByRole('button', { name: /깃발/ })).toHaveCount(
    0,
  );
  expect(mines.size).toBeGreaterThanOrEqual(Math.floor(32 * 0.13));
  expect(mines.size).toBeLessThanOrEqual(Math.floor(32 * 0.17));
  await expect(board(page).getByRole('button', { name: /공개/ })).toHaveCount(
    32 - mines.size,
  );
  const stoppedTime = await timer(page).innerText();
  expect(Number.parseInt(stoppedTime, 10)).toBeGreaterThanOrEqual(2);
  const state = await board(page).ariaSnapshot();
  const remaining = board(page).getByRole('button', { name: /숨김/ }).first();
  await remaining.click({ force: true });
  await remaining.click({ button: 'right', force: true });
  await page.clock.runFor(5000);
  await expect(timer(page)).toHaveText(stoppedTime);
  expect(await board(page).ariaSnapshot()).toBe(state);
});

test('최소 보드와 최대 직사각형, 40×40 보드의 작은 화면 스크롤', async ({
  page,
}, info) => {
  await newGame(page, 5, 5);
  await newGame(page, 40, 20);
  await page.setViewportSize({ width: 390, height: 844 });
  await newGame(page, 40, 40);
  await expect(cell(page, '40행 40열')).toBeAttached();
  const layout = await board(page).evaluate((element) => {
    let parent = element.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (
        /(auto|scroll)/.test(style.overflowX) &&
        parent.scrollWidth > parent.clientWidth
      ) {
        parent.scrollLeft = parent.scrollWidth;
        parent.scrollTop = parent.scrollHeight;
        return {
          x: parent.scrollLeft,
          y: parent.scrollTop,
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      }
      parent = parent.parentElement;
    }
    return null;
  });
  expect(layout).not.toBeNull();
  expect(layout!.x).toBeGreaterThan(0);
  expect(layout!.y).toBeGreaterThan(0);
  expect(layout!.pageOverflow).toBe(false);
  await cell(page, '40행 40열').scrollIntoViewIfNeeded();
  await expect(cell(page, '40행 40열')).toBeInViewport();
  await page.screenshot({
    path: info.outputPath('island-small-viewport.png'),
    fullPage: true,
  });
});
