import { defineConfig, devices } from '@playwright/test';

const PORT = 4210;
const BASE_URL = `http://localhost:${PORT}/music-discographies/`;

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

  // One browser on purpose. This is a static reference site with no
  // browser-specific code; a second engine would double CI time to re-test the
  // same assertions. Add one here the day a real cross-browser bug appears.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
});
