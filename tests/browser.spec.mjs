import { expect, test } from '@playwright/test';

// End-to-end coverage of the built site.
//
// Selectors go through data-testid and form control names wherever an element
// is a thing the tests care about. A few structural selectors survive on
// purpose (`h1`, `thead th`, `astro-island`) because they assert document
// semantics rather than presentation, and a restyle cannot change them without
// changing what the markup means.
//
// The regressions block is one test per defect found in review. Each is meant
// to fail if its fix is reverted, and the three that did not are now written
// so that they do: an absence assertion proves nothing unless the code has
// been given the chance to produce the thing that should be absent.

const SONG_COUNT = 215;
const BASE_PATH = '/music-discographies/';

const rows = (page) => page.getByTestId('song-row');
const cards = (page) => page.getByTestId('artist-card');
const search = (page) => page.locator('input[name="song-search"]');

/**
 * Resolves once React has taken over the prerendered markup.
 *
 * Astro ships the island with an `ssr` attribute and removes it on hydration.
 * Without waiting for that, a test can read server-rendered HTML, assert on it
 * and finish before any client code has run, which makes every "nothing broke"
 * assertion vacuous and every click a race against the native href.
 */
async function hydrated(page) {
  await page.waitForFunction(
    () => {
      const island = document.querySelector('astro-island');
      return Boolean(island) && !island.hasAttribute('ssr');
    },
    null,
    { timeout: 10_000 },
  );
}

/** Navigates and waits for the island to be live before returning. */
async function visit(page, path = './') {
  await page.goto(path);
  await hydrated(page);
}

/**
 * Fails the test on any page error, console error or failed request.
 *
 * Without this a hydration mismatch that React silently recovers from, or an
 * aborted asset, leaves every other assertion passing. Tests that break the
 * network on purpose opt out.
 */
function failOnBrowserErrors(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  return problems;
}

async function openArtist(page) {
  await cards(page).first().click();
  await expect(page.getByTestId('song-table')).toBeVisible();
}

/** Reads one column out of every rendered row. */
const column = (page, testid) => page.getByTestId(testid).allInnerTexts();

test.describe('artist list', () => {
  test('renders the registry', async ({ page }) => {
    const problems = failOnBrowserErrors(page);
    await visit(page);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Maroon 5');
    await expect(cards(page).first()).toContainText(String(SONG_COUNT));
    expect(problems).toEqual([]);
  });

  test('filters on name, origin and active years', async ({ page }) => {
    await visit(page);
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

  test('every registered artist opens its own detail view', async ({ page }) => {
    // Guards the multi-artist path that a single-artist dataset otherwise
    // leaves untested: each card must reach a detail view whose heading is
    // that artist, not merely the first card reaching any detail view.
    await visit(page);
    const names = await cards(page).evaluateAll((els) =>
      els.map((el) => ({
        name: el.querySelector('h2').textContent.trim(),
        href: el.getAttribute('href'),
      })),
    );
    expect(names.length).toBeGreaterThan(0);

    for (const { name, href } of names) {
      await visit(page, href);
      await expect(page.getByTestId('song-table')).toBeVisible();
      await expect(page.locator('h1')).toHaveText(name);
    }
  });
});

test.describe('artist detail', () => {
  test.beforeEach(async ({ page }) => {
    await visit(page);
    await openArtist(page);
  });

  test('shows every song', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Maroon 5');
    await expect(rows(page)).toHaveCount(SONG_COUNT);
  });

  test('search matches only rows containing the term', async ({ page }) => {
    await search(page).fill('sugar');
    await expect(page).toHaveURL(/q=sugar/);
    await expect(rows(page)).not.toHaveCount(SONG_COUNT);

    // Every surviving row must actually match, in title or album. A subset
    // assertion alone passes even if the filter returns the wrong rows.
    const titles = await column(page, 'song-title');
    const albums = await column(page, 'song-albums');
    expect(titles.length).toBeGreaterThan(0);
    titles.forEach((title, i) => {
      const haystack = `${title} ${albums[i]}`.toLowerCase();
      expect(haystack).toContain('sugar');
    });
  });

  test('each filter returns only rows with that value', async ({ page }) => {
    // Type, album and confidence had no coverage at all.
    await page.selectOption('select[name="type"]', 'live');
    await expect(page).toHaveURL(/type=live/);
    for (const type of await column(page, 'song-type')) expect(type.trim()).toBe('live');

    await page.getByTestId('clear-filters').click();
    await expect(rows(page)).toHaveCount(SONG_COUNT);

    const album = await page.locator('select[name="album"] option').nth(3).getAttribute('value');
    await page.selectOption('select[name="album"]', album);
    for (const cell of await column(page, 'song-albums')) expect(cell).toContain(album);

    await page.getByTestId('clear-filters').click();
    await page.selectOption('select[name="confidence"]', 'high');
    await expect(page).toHaveURL(/confidence=high/);
    const shown = await rows(page).count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(SONG_COUNT);
  });

  test('era filter returns only rows from that era', async ({ page }) => {
    const all = await rows(page).count();
    await page.selectOption('select[name="era"]', 'kara-s-flowers');
    await expect(page).toHaveURL(/era=kara-s-flowers/);
    const kara = await rows(page).count();

    await page.selectOption('select[name="era"]', 'maroon-5');
    const maroon = await rows(page).count();

    // The two eras must partition the catalogue exactly. A merely "smaller
    // than everything" assertion tolerates a filter that drops rows at random.
    expect(kara).toBeGreaterThan(0);
    expect(maroon).toBeGreaterThan(0);
    expect(kara + maroon).toBe(all);
  });

  test('year sort is monotonic and puts undated material last', async ({ page }) => {
    const years = async () =>
      (await column(page, 'song-year')).map((v) => (v.trim() === 'n/a' ? null : Number(v)));

    await page.getByTestId('sort-year').click();
    await expect(page).toHaveURL(/sort=year&dir=asc/);
    const asc = await years();
    const datedAsc = asc.filter((y) => y !== null);
    expect(datedAsc).toEqual([...datedAsc].sort((a, b) => a - b));
    // Undated rows are not "year zero"; they sort last in both directions.
    expect(asc.slice(datedAsc.length).every((y) => y === null)).toBe(true);

    await page.getByTestId('sort-year').click();
    await expect(page).toHaveURL(/dir=desc/);
    const desc = await years();
    const datedDesc = desc.filter((y) => y !== null);
    expect(datedDesc).toEqual([...datedDesc].sort((a, b) => b - a));
    expect(desc.slice(datedDesc.length).every((y) => y === null)).toBe(true);
  });

  test('clearing filters restores every row', async ({ page }) => {
    await search(page).fill('sugar');
    await expect(page).toHaveURL(/q=sugar/);

    await page.getByTestId('clear-filters').click();
    await expect(rows(page)).toHaveCount(SONG_COUNT);
    await expect(page).not.toHaveURL(/q=/);
  });

  test('exports exactly the visible rows, correctly escaped', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await search(page).fill('sugar');
    await expect(page).toHaveURL(/q=sugar/);

    const titles = await column(page, 'song-title');
    const years = await column(page, 'song-year');
    const types = await column(page, 'song-type');

    await page.getByTestId('copy-csv').click();
    // The click handler awaits the clipboard write; this status is rendered
    // after it resolves, so reading before it appears races the write.
    await expect(page.getByTestId('copy-status')).toContainText(`Copied ${titles.length}`);

    const csv = await page.evaluate(() => navigator.clipboard.readText());
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Song,Album(s),Year,Type');
    expect(lines).toHaveLength(titles.length + 1);

    // Exact values, not just a line count: a wrong column order or broken
    // quoting produces the right number of lines and the wrong file.
    lines.slice(1).forEach((line, i) => {
      const expectedYear = years[i].trim() === 'n/a' ? '' : years[i].trim();
      const field = (raw) => (/[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw);
      expect(line.startsWith(field(titles[i].trim()) + ',')).toBe(true);
      expect(line.endsWith(`,${expectedYear},${types[i].trim()}`)).toBe(true);
    });
  });
});

test.describe('URL state and navigation', () => {
  test('a filtered deep link restores the search box and the table', async ({ page }) => {
    await visit(page, './?q=sugar#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();
    await expect(search(page)).toHaveValue('sugar');

    const count = await rows(page).count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(SONG_COUNT);
  });

  test('filter writes keep the artist in the URL and survive a reload', async ({ page }) => {
    // Guards the hash half of the URL contract. If a filter write drops
    // "#maroon-5", the URL still looks filtered but reopens the artist list,
    // and every copied or refreshed link silently loses its artist.
    await visit(page);
    await openArtist(page);

    await search(page).fill('sugar');
    await expect(page).toHaveURL(`${BASE_PATH}?q=sugar#maroon-5`);

    await page.selectOption('select[name="era"]', 'maroon-5');
    await expect(page).toHaveURL(`${BASE_PATH}?q=sugar&era=maroon-5#maroon-5`);

    const before = await rows(page).count();
    await page.reload();
    await hydrated(page);
    await expect(page.getByTestId('song-table')).toBeVisible();
    await expect(page).toHaveURL(`${BASE_PATH}?q=sugar&era=maroon-5#maroon-5`);
    await expect(rows(page)).toHaveCount(before);
  });

  test('filter edits do not create history entries', async ({ page }) => {
    // Guards replaceState. Under pushState each of these edits becomes a Back
    // step, so returning to the artist list takes six presses instead of one.
    await visit(page);
    await openArtist(page);
    const before = await page.evaluate(() => history.length);

    await search(page).fill('sugar');
    await expect(page).toHaveURL(/q=sugar/);
    await page.selectOption('select[name="era"]', 'maroon-5');
    await expect(page).toHaveURL(/era=maroon-5/);
    await page.selectOption('select[name="type"]', 'album-track');
    await expect(page).toHaveURL(/type=album-track/);
    await page.getByTestId('sort-year').click();
    await expect(page).toHaveURL(/sort=year/);

    expect(await page.evaluate(() => history.length)).toBe(before);

    // And one Back still leaves the artist entirely.
    await page.goBack();
    await expect(cards(page)).toHaveCount(1);
  });

  test('back returns to the artist, forward returns to the list', async ({ page }) => {
    await visit(page);
    await openArtist(page);
    await page.getByTestId('back-to-list').click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`${BASE_PATH}$`));

    await page.goBack();
    await expect(page).toHaveURL(/#maroon-5/);
    await expect(page.getByTestId('song-table')).toBeVisible();

    await page.goForward();
    await expect(cards(page)).toHaveCount(1);
  });

  test('same-artist history traversal resyncs the filters', async ({ page }) => {
    // The case the popstate resync in ArtistDetail exists for: two entries for
    // the same artist mean the component is not remounted, so without the
    // listener the URL says one thing and the table shows another. A search is
    // left mid-debounce to prove the pending timer does not overwrite the
    // restored value.
    await visit(page, './?q=sugar#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();
    const filtered = await rows(page).count();

    await page.evaluate(() => history.pushState(null, '', location.pathname + '#maroon-5'));
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await expect(search(page)).toHaveValue('');
    await expect(rows(page)).toHaveCount(SONG_COUNT);

    // Type without settling the 150ms debounce, then step back immediately.
    await search(page).fill('memories');
    await page.goBack();

    await expect(search(page)).toHaveValue('sugar');
    await expect(rows(page)).toHaveCount(filtered);
    await expect(page).toHaveURL(`${BASE_PATH}?q=sugar#maroon-5`);
  });

  test('serves a real 404 for an unknown path', async ({ page }) => {
    const response = await page.goto('./does-not-exist');
    expect(response.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');
  });

  test('an unknown artist hash degrades to the list', async ({ page }) => {
    await visit(page, './#not-an-artist');
    await expect(cards(page)).toHaveCount(1);
  });
});

test.describe('build output', () => {
  test('loads no artist data until an artist is opened', async ({ page }) => {
    // The whole justification for the lazy registry. If this fails, every
    // visitor is downloading the entire collection to read one page.
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));

    await visit(page);
    expect(requests.filter((u) => u.includes('maroon-5'))).toHaveLength(0);

    await openArtist(page);
    expect(requests.filter((u) => u.includes('maroon-5')).length).toBeGreaterThan(0);
  });

  test('every request succeeds', async ({ page }) => {
    const problems = failOnBrowserErrors(page);
    const bad = [];
    page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
    await visit(page);
    await openArtist(page);
    expect(bad).toEqual([]);
    expect(problems).toEqual([]);
  });
});

// --------------------------------------------------------------- regressions
// One test per defect found in review. The comment names the symptom so a
// future failure is diagnosable without digging up the original report.

test.describe('regressions', () => {
  test('skip link does not navigate away from the open artist', async ({ page }) => {
    // The hash is the router, so a real jump to "#main" resolved "main" as an
    // unknown artist and threw the reader back to the list.
    await visit(page, './#maroon-5');
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
    // decodeURIComponent throws URIError on "#%". Unguarded, that throw
    // escaped the mount effect, the listeners were never attached and the
    // island emptied itself.
    //
    // Waiting for hydration is what gives this test its teeth. Asserting on
    // the prerendered cards alone passed 8 times in 10 with the guard removed,
    // because the assertions finished before the effect had failed.
    const problems = failOnBrowserErrors(page);
    await visit(page, './#%');
    await expect(cards(page)).toHaveCount(1);

    // Prove the island is not merely present but live: routing still works,
    // which it cannot if applyHash threw before attaching its listeners.
    await openArtist(page);
    await expect(page).toHaveURL(/#maroon-5/);
    expect(problems).toEqual([]);
  });

  test('repeat navigation to the current view adds no history entries', async ({ page }) => {
    // pushState fired unconditionally, so clicking the wordmark on the list
    // stacked identical entries and Back appeared to do nothing. The wordmark
    // also needs a real href: with href="#", a click landing before hydration
    // followed it natively and added exactly this junk entry.
    await visit(page);
    const before = await page.evaluate(() => history.length);

    await page.getByTestId('wordmark').click();
    await page.getByTestId('wordmark').click();
    await page.getByTestId('wordmark').click();

    expect(await page.evaluate(() => history.length)).toBe(before);
  });

  test('opening an artist by click moves focus to main', async ({ page }) => {
    await visit(page);
    await openArtist(page);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
  });

  test('arriving on a deep link does not steal focus', async ({ page }) => {
    // The reason focus is requested per navigation rather than fired from an
    // effect on artistId: an effect cannot tell the initial hash resolving on
    // load apart from a user navigating, so it focused main before the reader
    // had touched anything, pushing the skip link out of the first Tab.
    await visit(page, './#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
  });

  test('history navigation moves focus too', async ({ page }) => {
    // Focusing only from the click handlers left Back, Forward and hash links
    // unmounting the focused control with nothing to catch the caret.
    await visit(page);
    await openArtist(page);
    await page.getByTestId('back-to-list').click();
    await expect(cards(page)).toHaveCount(1);

    // Park focus on a real control first, and prove it landed. document.body
    // is not focusable, so blurring into it is a no-op: without this the
    // assertion below is satisfied by focus left over from the click above and
    // passes even when history navigation moves nothing.
    await page.locator('input[name="artist-filter"]').focus();
    expect(await page.evaluate(() => document.activeElement?.name)).toBe('artist-filter');

    await page.goBack();
    await expect(page.getByTestId('song-table')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
  });

  test('clearing filters keeps focus on a real control', async ({ page }) => {
    // Both clear buttons remove themselves by clearing the state that renders
    // them, dropping focus to <body>.
    await visit(page, './#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();

    await search(page).fill('sugar');
    await expect(page).toHaveURL(/q=sugar/);
    await page.getByTestId('clear-filters').click();

    expect(await page.evaluate(() => document.activeElement?.name)).toBe('song-search');
  });

  test('clearing the artist filter keeps focus on a real control', async ({ page }) => {
    await visit(page);
    await page.locator('input[name="artist-filter"]').fill('zzzz');
    await expect(cards(page)).toHaveCount(0);

    await page.getByTestId('clear-artist-filter').click();
    expect(await page.evaluate(() => document.activeElement?.name)).toBe('artist-filter');
  });

  test('artist links carry no query string from the current page', async ({ page }) => {
    // A fragment-only href resolves against the current URL, so a modified
    // click carried this page's filters into the artist.
    await visit(page, './?q=sugar&sort=year#not-an-artist');
    await expect(cards(page)).toHaveCount(1);

    const href = await cards(page).first().getAttribute('href');
    expect(href).toBe(`${BASE_PATH}#maroon-5`);
  });

  test('only the sorted column carries aria-sort', async ({ page }) => {
    await visit(page, './#maroon-5');
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
    //
    // The geometry assertion alone was not enough: without max-height the
    // wrapper never scrolls, scrollTop stays 0, and a header sitting naturally
    // at the top of an unscrolled box satisfies it. So prove the box really is
    // scrollable, really did scroll, and that the rows moved while the header
    // did not.
    await visit(page, './#maroon-5');
    await expect(page.getByTestId('song-table')).toBeVisible();
    const wrapper = page.getByTestId('table-scroll');

    const metrics = await wrapper.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    const firstRowBefore = await rows(page).first().boundingBox();
    await wrapper.evaluate((el) => el.scrollTo(0, 4000));
    expect(await wrapper.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    const firstRowAfter = await rows(page).first().boundingBox();
    expect(firstRowBefore.y - firstRowAfter.y).toBeGreaterThan(100);

    const header = await page.locator('thead th').first().boundingBox();
    const box = await wrapper.boundingBox();
    expect(Math.abs(header.y - box.y)).toBeLessThan(4);
  });

  test('a failed preload raises no unhandled rejection', async ({ page }) => {
    // preload is speculative, so its failures are not the user's problem yet
    // and must not surface as unhandled rejections. A genuinely dead chunk is
    // still unrecoverable without a reload; that is what the boundary is for.
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await visit(page);

    // Assert the interception actually happened. Otherwise a renamed chunk
    // makes the route never match and the absence assertion passes vacuously.
    let intercepted = false;
    await page.route('**/maroon-5*.js', (r) => {
      intercepted = true;
      return r.abort();
    });

    const failed = page.waitForEvent('requestfailed', (r) => r.url().includes('maroon-5'));
    await cards(page).first().hover();
    await failed;
    expect(intercepted).toBe(true);

    // A deterministic event-loop boundary instead of a fixed sleep: an
    // unhandled rejection would have been reported by now.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(errors).toEqual([]);
  });

  test('a dead artist chunk shows the error boundary, not a blank page', async ({ page }) => {
    await visit(page);
    await page.route('**/maroon-5*.js', (r) => r.abort());
    await cards(page).first().click();

    await expect(page.getByText('This artist could not be loaded')).toBeVisible();
    // The shell must survive: only the failed view is replaced.
    await expect(page.getByTestId('wordmark')).toBeVisible();
  });
});
