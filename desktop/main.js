const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell, ipcMain, dialog, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

const store = new Store();
const APP_URL = 'https://www.thecrowsnesttalk.com';
const isDev = process.argv.includes('--dev');

let mainWindow;
let tray;

// ── Auto-updater config ──────────────────────────────────────
autoUpdater.autoDownload = true;          // download silently in background
autoUpdater.autoInstallOnAppQuit = true;  // install when user quits

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update…');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  // Notify via tray
  if (Notification.isSupported()) {
    new Notification({
      title: 'The Crows Nest — Update Available',
      body: `Version ${info.version} is downloading in the background.`,
    }).show();
  }
});

autoUpdater.on('update-not-available', () => {
  console.log('App is up to date.');
});

autoUpdater.on('download-progress', (progress) => {
  console.log(`Download progress: ${Math.round(progress.percent)}%`);
  mainWindow?.setProgressBar(progress.percent / 100);
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow?.setProgressBar(-1); // clear progress bar
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: `The Crows Nest ${info.version} is ready to install.`,
    detail: 'Restart now to apply the update, or it will install automatically next time you quit.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (result === 0) {
    app.isQuitting = true;
    autoUpdater.quitAndInstall();
  }
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err.message);
  mainWindow?.setProgressBar(-1);
  // Don't show dialog for background auto-checks — only surface errors from manual checks
});

// ── Window ──────────────────────────────────────────────────
function createWindow() {
  const bounds = store.get('windowBounds', { width: 1280, height: 800, x: undefined, y: undefined });

  mainWindow = new BrowserWindow({
    title: 'The Crows Nest',
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#313338',
    titleBarStyle: 'default',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: fs.existsSync(path.join(__dirname, 'assets', 'icon.png'))
      ? path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
      : undefined,
    show: false,
  });

  mainWindow.loadURL(APP_URL).catch((err) => {
    console.error('Failed to load URL:', err);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Check for updates 5 seconds after launch (not in dev mode)
    if (!isDev) {
      setTimeout(() => autoUpdater.checkForUpdates(), 5000);
    }
  });

  mainWindow.on('close', (e) => {
    const b = mainWindow.getBounds();
    store.set('windowBounds', b);
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAdminHost(url)) {
      openAdminWindow(url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Restore saved token into localStorage before React reads it
  mainWindow.webContents.on('did-finish-load', () => {
    const savedToken = store.get('authToken');
    if (savedToken) {
      mainWindow.webContents.send('token:restore', savedToken);
    }
  });

  // Inject custom CSS
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    `);
  });
}

// ── Admin portal window ──────────────────────────────────────
// The admin dashboard lives on a separate subdomain (admin.<domain>). Rather
// than handing that off to the OS browser like other external links, open it
// in its own in-app window.
let adminWindow = null;

function isAdminHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname.startsWith('admin.');
  } catch {
    return false;
  }
}

function openAdminWindow(url) {
  if (adminWindow) {
    adminWindow.focus();
    return;
  }
  adminWindow = new BrowserWindow({
    title: 'The Crows Nest — Admin',
    width: 1200,
    height: 800,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  adminWindow.setMenuBarVisibility(false);
  adminWindow.loadURL(url).catch((err) => {
    console.error('Failed to load admin URL:', err);
  });
  // Links clicked from within the admin dashboard still go to the OS browser.
  adminWindow.webContents.setWindowOpenHandler(({ url: innerUrl }) => {
    shell.openExternal(innerUrl);
    return { action: 'deny' };
  });
  adminWindow.on('closed', () => {
    adminWindow = null;
  });
}

// ── Tray ─────────────────────────────────────────────────────
function createTray() {
  // Windows tray needs a proper ICO with 16x16 size included
  const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'tray.ico' : 'tray.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
    // Resize to 16x16 for tray on Windows — prevents blank icon
    if (process.platform === 'win32' && !icon.isEmpty()) {
      icon = icon.resize({ width: 16, height: 16 });
    }
  } else {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open The Crows Nest', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Check for Updates', click: () => checkForUpdatesManually() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('The Crows Nest');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.focus();
    else mainWindow.show();
  });
}

// ── Manual update check ───────────────────────────────────────
function checkForUpdatesManually() {
  if (isDev) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Updates',
      message: 'Auto-update is disabled in dev mode.',
      buttons: ['OK'],
    });
    return;
  }

  autoUpdater.checkForUpdates().then((result) => {
    // update-available and update-downloaded events handle the dialogs
    // If no update info returned, we're up to date
    if (!result?.updateInfo) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates',
        message: 'You\'re already on the latest version!',
        detail: `Current version: ${app.getVersion()}`,
        buttons: ['OK'],
      });
    }
  }).catch((err) => {
    // 404 means no release published yet — not a real error
    const isNoRelease = err.message?.includes('404') || err.message?.includes('Cannot find');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: isNoRelease ? 'Up to Date' : 'Update Check Failed',
      message: isNoRelease
        ? 'You\'re on the latest version!'
        : 'Could not check for updates.',
      detail: isNoRelease
        ? `Current version: ${app.getVersion()}`
        : 'Please check your internet connection and try again.',
      buttons: ['OK'],
    });
  });
}

// ── App menu ──────────────────────────────────────────────────
function createAppMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Check for Updates…', click: checkForUpdatesManually },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: `Version ${app.getVersion()}`, enabled: false },
        { type: 'separator' },
        { label: 'Check for Updates…', click: checkForUpdatesManually },
        { type: 'separator' },
        { label: 'Open in Browser', click: () => shell.openExternal(APP_URL) },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Screen share source picker ──────────────────────────────────
// Electron doesn't show a browser-style OS picker for getDisplayMedia() —
// the app has to supply one itself via setDisplayMediaRequestHandler.
let pickerWindow = null;
let pickerResolve = null;
let pickerSources = [];

function closePicker(result) {
  if (pickerResolve) {
    pickerResolve(result);
    pickerResolve = null;
  }
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.close();
  }
}

function openSourcePicker() {
  if (pickerWindow) {
    pickerWindow.focus();
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    pickerResolve = resolve;
    pickerWindow = new BrowserWindow({
      width: 720,
      height: 520,
      parent: mainWindow,
      modal: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: 'Share Your Screen',
      backgroundColor: '#2b2d31',
      webPreferences: {
        preload: path.join(__dirname, 'picker-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    pickerWindow.setMenuBarVisibility(false);
    pickerWindow.loadFile(path.join(__dirname, 'picker.html'));
    pickerWindow.on('closed', () => {
      pickerWindow = null;
      // If the window was closed without a selection (e.g. the user hit Esc
      // or the close button), treat it as a cancel.
      if (pickerResolve) {
        pickerResolve(null);
        pickerResolve = null;
      }
    });
  });
}

ipcMain.handle('picker:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 300, height: 200 },
    fetchWindowIcons: true,
  });
  pickerSources = sources;
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});

ipcMain.on('picker:selected', (_, id) => closePicker(id));
ipcMain.on('picker:cancelled', () => closePicker(null));

function setupScreenSharePicker() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    openSourcePicker().then((sourceId) => {
      const source = sourceId && pickerSources.find((s) => s.id === sourceId);
      if (!source) {
        callback({});
        return;
      }
      const streams = { video: { id: source.id, name: source.name } };
      // System-audio loopback capture is currently Windows-only in Electron.
      if (process.platform === 'win32' && request.audioRequested) {
        streams.audio = 'loopback';
      }
      callback(streams);
    });
  });
}

// ── IPC ───────────────────────────────────────────────────────
ipcMain.on('token:save', (_, token) => { store.set('authToken', token); });
ipcMain.on('token:clear', () => { store.delete('authToken'); });
ipcMain.on('update:check', () => checkForUpdatesManually());

ipcMain.on('notify', (_, { title, body }) => {
  if (Notification.isSupported()) {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    new Notification({ title, body, ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}) }).show();
  }
});

// ── Lifecycle ─────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  createAppMenu();
  setupScreenSharePicker();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
