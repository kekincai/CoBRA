import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:8787', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'uv run uvicorn cobra_web.main:app --host 127.0.0.1 --port 8787',
    env: { COBRA_DB_PATH: '.tmp/browser-tests.sqlite3' },
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: false,
  },
});
