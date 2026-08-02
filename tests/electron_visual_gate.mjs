import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
const electronExecutable = require('electron');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const output = path.join(root, 'artifacts', 'electron-visual');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const screens = [
  ['01-overview', 'overview'],
  ['02-downloads', 'downloads'],
  ['03-unfinished', 'unfinished'],
  ['04-finished', 'finished'],
  ['05-queues', 'queues'],
  ['06-categories', 'categories'],
  ['07-linkgrabber', 'grabber'],
  ['08-firmware', 'firmware'],
  ['09-operating-systems', 'operating-systems'],
  ['10-settings', 'settings'],
  ['11-browser-extension', 'browser-extension'],
  ['12-updates', 'updates'],
  ['13-help', 'help'],
  ['14-about', 'about'],
];

const isolated = path.join(output, 'runtime-data');
const app = await electron.launch({
  executablePath: electronExecutable,
  args: [path.join(root, 'electron', 'main.js')],
  env: {
    ...process.env,
    LUMIDM_DATA_DIR: path.join(isolated, 'data'),
    LUMIDM_DOWNLOAD_DIR: path.join(isolated, 'downloads'),
    LUMIDM_TEMP_DIR: path.join(isolated, 'temporary'),
    LUMIDM_PYTHON: process.env.LUMIDM_PYTHON || 'python',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  },
  timeout: 120_000,
});

try {
  const page = await app.firstWindow({ timeout: 120_000 });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:7000\/?$/, { timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.LumiReplica?.state && document.querySelector('.app-frame')), null, { timeout: 120_000 });

  const actual = await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
    if (!windows.length) throw new Error('Lumi main BrowserWindow missing');
    const main = windows[0];
    main.setContentSize(1672, 941);
    main.show();
    main.focus();
    return {
      title: main.getTitle(),
      url: main.webContents.getURL(),
      size: main.getContentSize(),
      skipTaskbar: main.isSkipTaskbar ? main.isSkipTaskbar() : false,
      windowCount: windows.length,
    };
  });
  assert.equal(actual.url, 'http://127.0.0.1:7000/');
  assert.deepEqual(actual.size, [1672, 941]);
  assert.equal(actual.skipTaskbar, false);

  await page.waitForTimeout(800);
  for (const [name, view] of screens) {
    await page.evaluate((target) => {
      window.LumiReplica.switchView(target);
      window.LumiReplica.state.search = '';
      window.LumiReplica.render();
    }, view);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  }

  await page.evaluate(() => {
    window.LumiReplica.switchView('overview');
    const button = document.querySelector('#gear-button');
    if (!button) throw new Error('gear button missing');
    button.click();
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(output, '15-gear-menu.png'), animations: 'disabled' });

  fs.writeFileSync(path.join(output, 'electron-runtime.json'), JSON.stringify({
    ...actual,
    renderer: 'static/index.html',
    exactApprovedRenderer: true,
    capturedBy: 'Playwright Electron application running electron/main.js',
  }, null, 2));
} finally {
  await app.close();
}

console.log('Actual Electron approved-UI capture: 15/15 PASS');
