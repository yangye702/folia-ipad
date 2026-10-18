import { expect, test } from '@playwright/test';
import { installBaseState, mockNeteaseApi } from './helpers/appFixtures';
import { waitForAppMounted } from '../helpers/appState';

test.use({ serviceWorkers: 'block' });

// Real matching window + hook + provider. Only upstream replies are controlled; no music is imported.
test('QQ failures differ from zero matches and opt-in summaries can be selected by touch', async ({ page }) => {
    await installBaseState(page, { neteaseMode: 'guest' });
    await mockNeteaseApi(page, 'guest');
    await page.addInitScript(() => { delete (window as any).electron; });
    const sent: string[] = [];
    let scenario: 'refused' | 'empty' | 'http' | 'recovery' = 'refused';
    await page.route('**/api/lyric-proxy?**', async route => {
        const query = route.request().postDataJSON()?.request?.param?.query;
        sent.push(query);
        const recovered = scenario === 'recovery' && query === '幸福不遠';
        const body = scenario === 'empty' || recovered
            ? { code: 0, request: { code: 0, data: { body: { item_song: recovered ? [{ id: 42, mid: 'fixture-mid', title: '幸福不远', singer: [{ name: '郭书瑶' }], album: { name: 'Honey' } }] : [] } } } }
            : { code: 0, request: { code: 2001 } };
        await route.fulfill({ status: scenario === 'http' ? 502 : 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/?qqLyricDebug=1');
    await waitForAppMounted(page);
    await page.evaluate(async () => {
        const load = (name: string) => import(/* @vite-ignore */ name);
        const [{ default: React }, client, { useLyricMatchSearch }, { LyricMatchWindow }] = await Promise.all([
            load('/node_modules/.vite/deps/react.js'), load('/node_modules/.vite/deps/react-dom_client.js'),
            load('/src/components/modal/lyric-match/useLyricMatchSearch.ts'), load('/src/components/modal/lyric-match/LyricMatchWindow.tsx'),
        ]);
        const createRoot = client.createRoot ?? client.default.createRoot;
        const song = { id: 'synthetic-search-target' };
        function Probe() {
            const search = useLyricMatchSearch(song, { title: '幸福不远', artist: '郭书瑶', album: '', durationMs: 0 }, { initialSource: 'qq' });
            return React.createElement(LyricMatchWindow, { search, isDaylight: true, onClose() {}, preview: { title: 'QQ test', artist: '', album: '' }, savingLabel: 'Save', onSave: async () => {} });
        }
        createRoot(document.body.appendChild(document.createElement('div'))).render(React.createElement(Probe));
    });
    const window = page.locator('[data-ponder="lyric-match"]');
    await expect(window.getByText('QQ Music rejected the search request.', { exact: true })).toBeVisible();
    await window.locator('summary').click();
    const output = window.getByRole('textbox', { name: 'QQ lyric search diagnostics' });
    await expect.poll(() => output.inputValue()).toContain('2001');
    const search = window.locator('input[type="text"]');
    scenario = 'empty';
    await search.fill('幸福不远'); await window.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(window.getByText('No results found. Try a different search query.', { exact: true })).toBeVisible();
    await expect.poll(async () => JSON.parse(await output.inputValue()).requests.at(-1)?.resultCount).toBe(0);
    scenario = 'http';
    await search.fill('幸福不遠'); await window.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(window.getByText('QQ search proxy returned an HTTP error.', { exact: true })).toBeVisible();
    await expect.poll(async () => JSON.parse(await output.inputValue()).requests.at(-1)?.httpStatus).toBe(502);
    scenario = 'recovery';
    await search.fill('幸福不远 - 郭书瑶'); await window.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(window.getByText('Honey', { exact: false })).toBeVisible();
    await expect.poll(async () => JSON.parse(await output.inputValue()).requests.at(-1)?.outcome).toBe('success');
    await window.getByRole('button', { name: 'Select diagnostics', exact: true }).click();
    expect(await output.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBeGreaterThan(0);
    const fullSearch = ['幸福不远 - 郭书瑶', '幸福不遠 - 郭書瑤', '幸福不远', '幸福不遠'];
    expect(sent).toEqual([...fullSearch, '幸福不远', '幸福不遠', '幸福不遠', ...fullSearch]);
});
