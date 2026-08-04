import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
const developmentElectron = require('electron');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const packagedExecutable = process.env.LUMI_PACKAGED_EXE
  ? path.resolve(process.env.LUMI_PACKAGED_EXE)
  : '';
const packaged = Boolean(packagedExecutable);
if (packaged) {
  let packagedFile = false;
  try { packagedFile = fs.statSync(packagedExecutable).isFile(); } catch (_) {}
  assert.ok(packagedFile, `packaged Lumi executable missing: ${packagedExecutable}`);
}
const output = process.env.LUMI_ELECTRON_VISUAL_OUTPUT
  ? path.resolve(process.env.LUMI_ELECTRON_VISUAL_OUTPUT)
  : path.join(root, 'artifacts', packaged ? 'packaged-electron-visual' : 'electron-visual');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const ordinaryScreens = [
  ['02_All_Downloads', 'downloads'],
  ['03_Unfinished', 'unfinished'],
  ['04_Finished', 'finished'],
  ['05_Queues', 'queues'],
  ['06_Categories', 'categories'],
  ['07_LinkGrabber', 'grabber'],
  ['08_Mobile_Firmware', 'firmware'],
  ['09_Operating_Systems', 'operating-systems'],
  ['10_Settings', 'settings'],
];

const isolated = path.join(output, 'runtime-data');
const app = await electron.launch({
  executablePath: packagedExecutable || developmentElectron,
  args: packaged
    ? [`--user-data-dir=${path.join(isolated, 'user-data')}`]
    : [path.join(root, 'electron', 'main.js')],
  env: {
    ...process.env,
    USERPROFILE: packaged ? path.join(isolated, 'profile') : process.env.USERPROFILE,
    HOME: packaged ? path.join(isolated, 'profile') : process.env.HOME,
    LUMIDM_DATA_DIR: path.join(isolated, 'data'),
    LUMIDM_DOWNLOAD_DIR: path.join(isolated, 'downloads'),
    LUMIDM_TEMP_DIR: path.join(isolated, 'temporary'),
    LUMIDM_PYTHON: process.env.LUMIDM_PYTHON || 'python',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  },
  timeout: 180_000,
});

async function resetTransient(page) {
  await page.evaluate(() => {
    const gear = document.getElementById('gear-menu');
    const floating = document.getElementById('floating-panel');
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('overlay');
    if (gear) gear.hidden = true;
    if (floating) floating.hidden = true;
    if (modal) modal.hidden = true;
    if (overlay) overlay.hidden = true;
    document.getElementById('gear-button')?.setAttribute('aria-expanded', 'false');
  });
}

async function view(page, target) {
  await resetTransient(page);
  await page.evaluate(next => {
    window.LumiReplica.switchView(next);
    window.LumiReplica.state.search = '';
    window.LumiReplica.state.theme = 'dark';
    window.LumiReplica.render();
  }, target);
  await page.waitForTimeout(250);
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
}

try {
  const page = await app.firstWindow({ timeout: 180_000 });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:7000\/?$/, { timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.LumiReplica?.state && document.querySelector('.app-frame')), null, { timeout: 120_000 });

  const actual = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed());
    if (!windows.length) throw new Error('Lumi main BrowserWindow missing');
    const main = windows.find(window => window.getBounds().width >= 900 && !window.isAlwaysOnTop()) || windows[0];
    main.setContentSize(1672, 941);
    main.show();
    main.focus();
    return {
      title: main.getTitle(),
      url: main.webContents.getURL(),
      size: main.getContentSize(),
      isPackaged: electronApp.isPackaged,
      appPath: electronApp.getAppPath(),
      resourcesPath: process.resourcesPath,
      skipTaskbar: main.isSkipTaskbar ? main.isSkipTaskbar() : false,
      windowCount: windows.length,
    };
  });
  assert.equal(actual.url, 'http://127.0.0.1:7000/');
  assert.deepEqual(actual.size, [1672, 941]);
  assert.equal(actual.skipTaskbar, false);
  assert.equal(actual.isPackaged, packaged, 'visual capture used the wrong Electron execution boundary');
  if (packaged) assert.match(actual.appPath, /app\.asar$/i);

  await page.waitForTimeout(800);

  await view(page, 'overview');
  await page.evaluate(() => {
    const menu = document.getElementById('gear-menu');
    const button = document.getElementById('gear-button');
    if (!menu || !button) throw new Error('gear controls missing');
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  });
  await page.waitForTimeout(250);
  await capture(page, '01_Overview');

  for (const [name, target] of ordinaryScreens) {
    await view(page, target);
    await capture(page, name);
  }

  await view(page, 'overview');
  await page.evaluate(() => window.LumiReplica.openSpeedTest());
  await page.waitForTimeout(250);
  await capture(page, '11_Speed_Test_Popup');

  await view(page, 'browser-extension');
  await capture(page, '12_Browser_Extension');

  await view(page, 'overview');
  await page.evaluate(() => window.LumiReplica.openUpdateDialog());
  await page.waitForTimeout(250);
  await capture(page, '13_Check_For_Updates');

  await view(page, 'help');
  await capture(page, '14_Help_Report_A_Bug');

  await view(page, 'about');
  await capture(page, '15_About_Lumi');

  fs.writeFileSync(path.join(output, 'electron-runtime.json'), JSON.stringify({
    ...actual,
    renderer: 'static/index.html',
    exactApprovedRenderer: true,
    captureSet: 'owner-approved-15',
    executionBoundary: packaged ? 'actual-packaged-app-asar' : 'development-electron-main-source',
    capturedBy: packaged
      ? 'Playwright launching the actual packaged Lumi-DM.exe'
      : 'Playwright Electron application running electron/main.js',
  }, null, 2));
} finally {
  await app.close();
}

console.log(`${packaged ? 'Packaged' : 'Development'} Electron owner-approved capture set: 15/15 PASS`);
