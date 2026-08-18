import { expect, test } from '@playwright/test';

// End-to-end coverage of the built site. Every selector goes through
// data-testid or a form control's name, never through a class name, so a
// restyle does not break the suite: a redesign should have to change these
// tests only when it changes what the site actually does.
//
// The regression block at the bottom is the important half. Each case there
// maps to a defect that was found in review, reproduced here first, then
// fixed. Deleting one of those tests deletes the only thing stopping that bug
// from coming back.

const SONG_COUNT = 215;

const rows = (page) => page.getByTestId('song-row');
const cards = (page) => page.getByTestId('artist-card');

/** Opens the artist and waits for the lazily loaded table to arrive. */
async function openArtist(page) {
  await cards(page).first().click();
  await expect(page.getByTestId('song-table')).toBeVisible();
}

test.describe('artist list', () => {
  test.beforeEach(async ({ page }) => page.goto('./'));

  test('renders the registry', async ({ page }) => {
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Maroon 5');
    await expect(cards(page).first()).toContainText(String(SONG_COUNT));
  });

  test('filters on name, origin and active years', async ({ page }) => {
    const box = page.locator('input[name="artist-filter"]');

    await box.fill('Los Angeles');
    await expect(cards(page)).toHaveCount(1);

    await box.fill('zzzz');
    await expect(cards(page)).toHaveCount(0);

    await page.getByTestId('clear-artist-filter').click();
    await expect(cards(page)).toHaveCount(1);
  });

  test('is prerendered into the HTML, not mounted by JavaScript', async ({ browser }) => {
    // The point of Astro here. Without this the island could regress to an
    // empty shell and every other test would still pass, because they all run
    // with JavaScript enabled.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('./');
    await expect(page.getByTestId('artist-card')).toHaveCount(1);
    await context.close();
  });
});

test.describe('artist detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await openArtist(page);
  });

  test('shows every song', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Maroon 5');
    await expect(rows(page)).toHaveCount(SONG_COUNT);
  });

  test('search narrows the table and reaches the URL', async ({ page }) => {
    await page.locator('input[name="song-search"]').fill('sugar');
    await expect(rows(page)).not.toHaveCount(SONG_COUNT);
    await expect(rows(page)).not.toHaveCount(0);
    await expect(page).toHaveURL(/q=sugar/);
  });

  test('era filter narrows the table', async ({ page }) => {
    await page.selectOption('select[name="era"]', 'kara-s-flowers');
    await expect(page).toHaveURL(/era=kara-s-flowers/);
    const count = await rows(page).count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(SONG_COUNT);
  });

  test('sorting by year toggles direction', async ({ page }) => {
    const firstYear = () => page.getByTestId('song-row').first().locator('.cell-year').innerText();

    await page.getByTestId('sort-year').click();
    await expect(page).toHaveURL(/sort=year&dir=asc/);
    const ascending = await firstYear();

    await page.getByTestId('sort-year').click();
    await expect(page).toHaveURL(/dir=desc/);
    expect(await firstYear()).not.toBe(ascending);
  });

  test('clearing filters restores every row', async ({ page }) => {
    await page.locator('input[name="song-search"]').fill('sugar');
    await expect(page).toHaveURL(/q=sugar/);

    await page.getByTestId('clear-filters').click();
    await expect(rows(page)).toHaveCount(SONG_COUNT);
    await expect(page).not.toHaveURL(/q=/);
  });

  test('copies the filtered rows as CSV', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('input[name="song-search"]').fill('sugar');
    await expect(page).toHaveURL(/q=sugar/);

    const visible = await rows(page).count();
    await page.getByTestId('copy-csv').click();

    const csv = await page.evaluate(() => navigator.clipboard.readText());
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Song,Album(s),Year,Type');
    // Header plus one line per visible row, and no more: the export must
    // follow the filter rather than dumping the whole catalogue.
    expect(lines).toHaveLength(visible + 1);
  });
});

test.describe('URL state and navigation', () => {
  test('a filtered deep link restores the search box and the table', async ({ page }) => {
    await page.goto('./?q=sugar#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();
    await expect(page.locator('input[name="song-search"]')).toHaveValue('sugar');

    const count = await rows(page).count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(SONG_COUNT);
  });

  test('back returns to the artist, forward returns to the list', async ({ page }) => {
    await page.goto('./');
    await openArtist(page);
    await page.getByTestId('back-to-list').click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page).toHaveURL(/\/music-discographies\/$/);

    await page.goBack();
    await expect(page).toHaveURL(/#maroon-5/);
    await expect(page.getByTestId('song-table')).toBeVisible();

    await page.goForward();
    await expect(cards(page)).toHaveCount(1);
  });

  test('serves a real 404 for an unknown path', async ({ page }) => {
    const response = await page.goto('./does-not-exist');
    expect(response.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');
  });

  test('an unknown artist hash degrades to the list', async ({ page }) => {
    await page.goto('./#not-an-artist');
    await expect(cards(page)).toHaveCount(1);
  });
});

test.describe('build output', () => {
  test('loads no artist data until an artist is opened', async ({ page }) => {
    // The whole justification for the lazy registry. If this fails, every
    // visitor is downloading the entire collection to read one page.
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));

    await page.goto('./', { waitUntil: 'networkidle' });
    expect(requests.filter((u) => u.includes('maroon-5'))).toHaveLength(0);

    await openArtist(page);
    expect(requests.filter((u) => u.includes('maroon-5')).length).toBeGreaterThan(0);
  });

  test('every request succeeds', async ({ page }) => {
    const bad = [];
    page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
    await page.goto('./', { waitUntil: 'networkidle' });
    await openArtist(page);
    expect(bad).toEqual([]);
  });
});

// --------------------------------------------------------------- regressions
// One test per defect found in review. The comment names the symptom so a
// future failure is diagnosable without digging up the original report.

test.describe('regressions', () => {
  test('skip link does not navigate away from the open artist', async ({ page }) => {
    // The hash is the router, so a real jump to "#main" resolved "main" as an
    // unknown artist and threw the reader back to the list.
    await page.goto('./#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();

    // Reached the way a real user reaches it. The link is parked off-screen
    // until focused, so tabbing to it is both the only way to activate it and
    // an assertion that it is still the first stop in the tab order.
    await page.keyboard.press('Tab');
    const skip = page.getByTestId('skip-link');
    await expect(skip).toBeFocused();
    await skip.press('Enter');

    await expect(page).toHaveURL(/#maroon-5/);
    await expect(page.getByTestId('song-table')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
  });

  test('a malformed hash does not crash the island', async ({ page }) => {
    // decodeURIComponent throws URIError on "#%". Unguarded, that escaped the
    // mount effect, the listeners were never attached and the page rendered
    // nothing at all.
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('./#%');
    await expect(cards(page)).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('repeat navigation to the current view adds no history entries', async ({ page }) => {
    // pushState fired unconditionally, so clicking the wordmark on the list
    // stacked identical entries and Back appeared to do nothing.
    await page.goto('./');
    const before = await page.evaluate(() => history.length);

    await page.getByTestId('wordmark').click();
    await page.getByTestId('wordmark').click();
    await page.getByTestId('wordmark').click();

    expect(await page.evaluate(() => history.length)).toBe(before);
  });

  test('opening an artist moves focus off the body', async ({ page }) => {
    // Route changes unmounted the focused card without moving focus, so
    // keyboard users lost their place and screen readers announced nothing.
    await page.goto('./');
    await openArtist(page);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
  });

  test('clearing filters keeps focus on a real control', async ({ page }) => {
    // Both clear buttons remove themselves by clearing the state that renders
    // them, dropping focus to <body>.
    await page.goto('./#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();

    await page.locator('input[name="song-search"]').fill('sugar');
    await expect(page).toHaveURL(/q=sugar/);
    await page.getByTestId('clear-filters').click();

    expect(await page.evaluate(() => document.activeElement?.name)).toBe('song-search');
  });

  test('clearing the artist filter keeps focus on a real control', async ({ page }) => {
    await page.goto('./');
    await page.locator('input[name="artist-filter"]').fill('zzzz');
    await expect(cards(page)).toHaveCount(0);

    await page.getByTestId('clear-artist-filter').click();
    expect(await page.evaluate(() => document.activeElement?.name)).toBe('artist-filter');
  });

  test('artist links carry no query string from the current page', async ({ page }) => {
    // A fragment-only href resolves against the current URL, so a modified
    // click carried this page's filters into the artist.
    await page.goto('./?q=sugar&sort=year#not-an-artist');
    await expect(cards(page)).toHaveCount(1);

    const href = await cards(page).first().getAttribute('href');
    expect(href).toBe('/music-discographies/#maroon-5');
  });

  test('only the sorted column carries aria-sort', async ({ page }) => {
    await page.goto('./#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();

    await page.getByTestId('sort-year').click();
    const header = (testid) =>
      page.getByTestId(testid).locator('xpath=ancestor::th').getAttribute('aria-sort');

    expect(await header('sort-year')).toBe('ascending');
    expect(await header('sort-title')).toBeNull();
  });

  test('the table header stays pinned while the rows scroll', async ({ page }) => {
    // overflow-x alone made the wrapper the sticky container but an unbounded
    // one, so the header slid away with the page instead of pinning.
    await page.goto('./#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();

    await page.getByTestId('table-scroll').evaluate((el) => el.scrollTo(0, 4000));

    const header = await page.locator('thead th').first().boundingBox();
    const wrapper = await page.getByTestId('table-scroll').boundingBox();
    expect(Math.abs(header.y - wrapper.y)).toBeLessThan(4);
  });

  test('a failed preload raises no unhandled rejection', async ({ page }) => {
    // preload is speculative, so its failures are not the user's problem yet
    // and must not surface as unhandled rejections. A genuinely dead chunk is
    // still unrecoverable without a reload; that is what the boundary is for.
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('./');
    await page.route('**/maroon-5*.js', (r) => r.abort());
    await cards(page).first().hover();
    await page.waitForTimeout(600);

    expect(errors).toEqual([]);
  });

  test('a dead artist chunk shows the error boundary, not a blank page', async ({ page }) => {
    await page.goto('./');
    await page.route('**/maroon-5*.js', (r) => r.abort());
    await cards(page).first().click();

    await expect(page.getByText('This artist could not be loaded')).toBeVisible();
    // The shell must survive: only the failed view is replaced.
    await expect(page.getByTestId('wordmark')).toBeVisible();
  });
});
