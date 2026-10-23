const { app, BrowserWindow, dialog, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { deviceKey, isAppOrigin, isAulaDevice, hasConfigReport } = require('./hid-policy.cjs');

const APP_ORIGIN = 'aula://app';
protocol.registerSchemesAsPrivileged([{
  scheme: 'aula',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function deviceLabel(device) {
  const key = deviceKey(device);
  const mode = key === '3554:fa09' ? 'dongle 2,4 GHz' : 'USB cabeado';
  const name = device.name || 'AULA F75';
  return `${name} · ${mode} · ${key}`;
}

function registerAppProtocol() {
  const root = path.join(app.getAppPath(), 'web', 'out');
  protocol.handle('aula', async request => {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (url.host !== 'app') return new Response('Not found', { status: 404 });

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const contents = await fs.promises.readFile(filePath);
      return new Response(contents, {
        status: 200,
        headers: {
          'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function showHidChooser(win, details, callback) {
  const candidates = (details.deviceList || []).filter(hasConfigReport);
  if (candidates.length === 0) {
    callback('');
    return;
  }
  if (candidates.length === 1) {
    callback(candidates[0].deviceId);
    return;
  }

  const result = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Conectar teclado AULA F75',
    message: 'Escolha a conexão que deseja usar:',
    buttons: [...candidates.map(deviceLabel), 'Cancelar'],
    cancelId: candidates.length,
    noLink: true,
  });
  const selected = candidates[result.response];
  callback(selected ? selected.deviceId : '');
}

async function createWindow() {
  registerAppProtocol();
  const win = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 760,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: 'AULA F75 Controller',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const session = win.webContents.session;
  session.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    permission === 'hid' && contents === win.webContents && isAppOrigin(requestingOrigin),
  );
  session.setDevicePermissionHandler(({ deviceType, origin, device }) =>
    deviceType === 'hid' && isAppOrigin(origin) && isAulaDevice(device),
  );
  session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    void showHidChooser(win, details, callback).catch(() => callback(''));
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  await win.loadURL(`${APP_ORIGIN}/`);
}

app.whenReady().then(createWindow).catch(error => {
  dialog.showErrorBox('Falha ao abrir AULA F75 Controller', String(error));
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
