import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { installBaseState, mockNeteaseApi } from './helpers/appFixtures';
import { waitForAppMounted } from '../helpers/appState';

// Isolated synthetic controls/settings checks: never opens or modifies a user's library.
test.use({ hasTouch: true, serviceWorkers: 'block' });
test('iPad quick controls and settings fit touch and visible viewport', async ({ page }) => {
    await installBaseState(page, { neteaseMode: 'guest' });
    await mockNeteaseApi(page, 'guest');
    await page.addInitScript(() => { delete (window as any).electron; });
    await page.goto('/');
    await waitForAppMounted(page);
    const baseline = process.env.FOLIA_PHASE1_CAPTURE === 'before';
    const out = process.env.FOLIA_PHASE1_EVIDENCE || '/tmp/folia-phase1-evidence';
    fs.mkdirSync(out, { recursive: true });
    const stage = baseline ? 'before' : 'after';
    await page.evaluate(async () => {
        const load = (name: string) => import(/* @vite-ignore */ name);
        const [React, controls, themes] = await Promise.all([
            load('/dev/probes/reactTestRuntime.ts'),
            load('/src/components/shared/QuickControlChip.tsx'), load('/src/services/baseThemes.ts'),
        ]);
        const host = document.body.appendChild(document.createElement('div'));
        host.id = 'phase1-controls';
        Object.assign(host.style, { position: 'fixed', top: '20px', left: '20px', zIndex: '9999', display: 'flex', gap: '8px', background: '#444', padding: '16px' });
        const createRoot = React.createRoot;
        createRoot(host).render(React.default.createElement(React.default.Fragment, null,
            React.default.createElement(controls.QuickControlChip, { label: 'Frame', title: 'Phase1 frame', isDaylight: false, onClick: () => host.dataset.clicked = 'chip' }),
            React.default.createElement(controls.QuickControlToggle, { label: 'Phase1 effect', theme: themes.DEFAULT_THEME, active: true, onToggle: () => host.dataset.clicked = 'toggle' }, '★')));
    });
    await page.setViewportSize({ width: 1180, height: 820 });
    const controls = page.locator('#phase1-controls button');
    await expect(controls).toHaveCount(2);
    const sizes = await controls.evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    await page.locator('#phase1-controls').screenshot({ path: `${out}/${stage}-touch-controls.png` });
    await controls.first().tap();
    await expect(page.locator('#phase1-controls')).toHaveAttribute('data-clicked', 'chip');
    await controls.last().tap();
    await expect(page.locator('#phase1-controls')).toHaveAttribute('data-clicked', 'toggle');
    await page.locator('#phase1-controls').evaluate(node => node.remove());
    await page.evaluate(async () => {
        const name = '/src/stores/useSettingsModalStore.ts';
        const module = await import(/* @vite-ignore */ name);
        module.useSettingsModalStore.getState().openSettings('options');
    });
    const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(dialog).toBeVisible();
    const layouts = [];
    for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 1024, height: 600 }, { width: 600, height: 400 }]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(250);
        const box = await dialog.boundingBox();
        layouts.push({ viewport, box });
        await page.screenshot({ path: `${out}/${stage}-settings-${viewport.width}x${viewport.height}.png` });
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(-1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    fs.writeFileSync(`${out}/${stage}-touch-layout.json`, JSON.stringify({ sizes, layouts }, null, 2));
    if (!baseline) sizes.forEach(size => { expect(size.height).toBeGreaterThanOrEqual(44); expect(size.width).toBeGreaterThanOrEqual(44); });
});
