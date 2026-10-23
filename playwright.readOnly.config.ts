import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Isolate the deployment-without-a-full-backend path from the normal UI fixture server.
export default defineConfig({
    ...base,
    workers: 1,
    projects: [{ name: 'read-only-services', testDir: './test/service-browser' }],
    use: { ...base.use, baseURL: 'http://127.0.0.1:4174', serviceWorkers: 'block' },
    webServer: {
        command: 'cross-env VITE_NETEASE_API_BASE= VITE_NETEASE_READONLY_API_BASE=/api/netease npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
        url: 'http://127.0.0.1:4174/dev-probe.html',
        reuseExistingServer: false,
        timeout: 120000,
    },
});
