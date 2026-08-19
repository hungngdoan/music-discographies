import { defineConfig, devices } from '@playwright/test';

import astroConfig from './astro.config.mjs';

const PORT = 4210;
// Derived from astro.config.mjs rather than repeated, so renaming the repo is
// one edit there instead of a hunt through the test config as well.
const BASE_URL = `http://localhost:${PORT}${astroConfig.base.replace(/\/?$/, '/')}`;

export default defineConfig({
  testDir: './tests',

  // The suite asserts on the deployed artefact, not on a dev server: base-path
  // rewriting, code splitting and the 404 page only behave correctly in a real
  // build, and those are exactly the things most likely to break silently.
  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    timeout: 120_000,
    // Deliberately not the usual `!process.env.CI`. With reuse enabled, any
    // preview server already listening on this port satisfies the check, the
    // build never runs, and the suite silently grades a stale dist. That is
    // exactly how this config was first written, and it reported 25 failures
    // against code that was actually correct. A rebuild costs about two
    // seconds; a port clash now fails loudly instead of lying quietly.
    reuseExistingServer: false,
  },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },

  // Chromium only, as an accepted limit rather than a claim of safety. The
  // suite does touch engine-sensitive behaviour: the async Clipboard API,
  // position: sticky inside a scroll container, focus and history semantics,
  // and dynamic-import failure caching. None of that is verified on Gecko or
  // WebKit. Adding an engine is the fix if a cross-browser bug ever appears;
  // until then the cost of doubling CI is not obviously worth it for a static
  // reference site.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A retry rescues a genuinely flaky infrastructure blip, but on its own it
  // also quietly launders a real race into a green "flaky" run. failOnFlakyTests
  // keeps the retry and still fails the build when one is used, so a race shows
  // up as a red CI rather than a passing badge nobody looks at.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
});
