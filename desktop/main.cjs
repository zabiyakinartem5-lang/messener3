const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(value) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(value, null, 2));
}
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 850, minHeight: 600,
    title: 'Messenger',
    backgroundColor: '#111827',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const url = readConfig().serverUrl;
  if (url) win.loadURL(url);
  else win.loadFile(path.join(__dirname, 'setup.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('page-title-updated', (event) => { event.preventDefault(); win.setTitle('Messenger'); });
}
ipcMain.handle('messenger:save-server', (_event, raw) => {
  let parsed;
  try { parsed = new URL(String(raw).trim()); } catch { throw new Error('Введите корректный адрес сервера'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Нужен адрес http:// или https:// без логина и пароля');
  const serverUrl = parsed.origin;
  writeConfig({ serverUrl });
  win.loadURL(serverUrl);
  return true;
});
ipcMain.handle('messenger:current-server', () => readConfig().serverUrl || '');
app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
