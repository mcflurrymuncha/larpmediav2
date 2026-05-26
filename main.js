const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc');

let win;
const clientId = '1508392537914871838'; 

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 600,
    title: "QUELLQA V5 // STABLE",
    frame: false,
    resizable: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'dist-web/index.html'));
  
  if (process.platform === 'win32') {
    setThumbarButtons(false);
  }
}

function setThumbarButtons(isPlaying) {
  if (!win || process.platform !== 'win32') return;

  try {
    win.setThumbarButtons([
      {
        tooltip: 'Back',
        icon: path.join(__dirname, 'icon.ico'), 
        flags: [],
        click() { win.webContents.send('media-command', 'prev'); }
      },
      {
        tooltip: isPlaying ? 'Pause' : 'Play',
        icon: path.join(__dirname, 'icon.ico'),
        flags: [],
        click() { win.webContents.send('media-command', 'play-pause'); }
      },
      {
        tooltip: 'Next',
        icon: path.join(__dirname, 'icon.ico'),
        flags: [],
        click() { win.webContents.send('media-command', 'next'); }
      }
    ]);
  } catch (e) {
    console.error("SMTC Thumbar setup failed:", e);
  }
}

// --- IPC WINDOW OPERATIONS MATRIX ---

ipcMain.on('window-control', (event, action) => {
  if (!win) return;
  if (action === 'close') win.close();
  if (action === 'minimize') win.minimize();
});

ipcMain.on('sync-native-media', (event, data) => {
  if (!win || !data) return;
  setThumbarButtons(data.isPlaying);
});

// --- DISCORD TELEMETRY DISPATCH ---

const rpc = new DiscordRPC.Client({ transport: 'ipc' });

function setInitialPresence() {
  if (!rpc) return;
  rpc.setActivity({
    details: 'idle in the menus',
    state: 'quellqa audio',
    largeImageKey: 'quellqa_logo',
    instance: false,
  }).catch(console.error);
}

ipcMain.on('update-rpc', (event, track) => {
  if (!rpc) return;
  if (track && track.isPlaying) {
    rpc.setActivity({
      details: `${track.title} // by ${track.artist}`,
      state: `on ${track.album}`,
      largeImageKey: track.rpcArt && track.rpcArt.startsWith('data:') ? track.rpcArt : 'quellqa_logo',
      instance: false,
    }).catch(console.error);
  } else {
    setInitialPresence();
  }
});

rpc.on('ready', () => { setInitialPresence(); });
rpc.login({ clientId }).catch(console.error);

// --- HARDWARE LIFECYCLE ROUTERS ---

app.whenReady().then(() => {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');

  createWindow();

  globalShortcut.register('MediaPlayPause', () => {
    win?.webContents.send('media-command', 'play-pause');
  });
  globalShortcut.register('MediaNextTrack', () => {
    win?.webContents.send('media-command', 'next');
  });
  globalShortcut.register('MediaPreviousTrack', () => {
    win?.webContents.send('media-command', 'prev');
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
