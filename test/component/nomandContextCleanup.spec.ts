import fs from 'node:fs';
import type { ElementHandle } from '@playwright/test';
import { expect, test } from './fixtures';

// Removing a shader must release its detached drawing buffers before canvas garbage collection.
test('Nomand releases replaced and unmounted shader contexts', async ({ mount, page }) => {
    const component = await mount('nomandContextCleanup');
    const observations: Array<{ stage: string; connected: boolean; lost: boolean }> = [];
    const evidence = process.env.FOLIA_NOMAND_CLEANUP_EVIDENCE;
    const record = async (stage: string, canvas: ElementHandle<HTMLCanvasElement>) => {
        observations.push(await canvas.evaluate((node, label) => ({
            stage: label,
            connected: node.isConnected,
            lost: (node as HTMLCanvasElement).getContext('webgl2')!.isContextLost(),
        }), stage));
        if (evidence) fs.writeFileSync(evidence, JSON.stringify(observations, null, 2));
    };

    for (let change = 0; change < 2; change += 1) {
        const canvas = component.locator('canvas');
        await expect(canvas).toHaveCount(1);
        await expect.poll(() => canvas.evaluate(node => Boolean(node.parentElement && 'paperShaderMount' in node.parentElement))).toBe(true);
        const previous = (await canvas.elementHandle())! as ElementHandle<HTMLCanvasElement>;
        await record(`attached-${change}`, previous);
        expect(await previous.evaluate(node => node.getContext('webgl2')!.isContextLost())).toBe(false);

        await component.getByRole('button', { name: 'Change effect' }).click();
        await expect.poll(() => previous.evaluate(node => node.isConnected)).toBe(false);
        await record(`replaced-${change}`, previous);
        await expect.poll(() => previous.evaluate(node => node.getContext('webgl2')!.isContextLost())).toBe(true);
        await record(`released-${change}`, previous);
    }

    const last = (await component.locator('canvas').elementHandle())! as ElementHandle<HTMLCanvasElement>;
    await expect.poll(() => last.evaluate(node => Boolean(node.parentElement && 'paperShaderMount' in node.parentElement))).toBe(true);
    await record('attached-final', last);
    expect(await last.evaluate(node => node.getContext('webgl2')!.isContextLost())).toBe(false);
    await page.evaluate(() => window.unmount());
    await expect.poll(() => last.evaluate(node => node.isConnected)).toBe(false);
    await record('unmounted', last);
    await expect.poll(() => last.evaluate(node => node.getContext('webgl2')!.isContextLost())).toBe(true);
    await record('released-final', last);
});
