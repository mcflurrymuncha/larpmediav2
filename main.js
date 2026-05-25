const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc');

let win;
const clientId = '1508392537914871838'; 

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 680,
    title: "Quellqa Audio",
    frame: false, // CRITICAL: Drops standard OS window frame for custom titlebar
    resizable: true,
    backgroundColor: '#fff5f7',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'dist-web/index.html'));
}

// IPC Window Controls
ipcMain.on('window-control', (event, action) => {
  if (!win) return;
  if (action === 'close') win.close();
  if (action === 'minimize') win.minimize();
});

const rpc = new DiscordRPC.Client({ transport: 'ipc' });

function setInitialPresence() {
  if (!rpc) return;
  rpc.setActivity({
    details: 'dis bitch left me open',
    state: 'Idle',
    largeImageKey: 'quellqa_logo',
    largeImageText: 'Quellqa Audio v1.3.0',
    instance: false,
  }).catch(console.error);
}

ipcMain.on('update-rpc', (event, track) => {
  if (!rpc) return;
  if (track) {
    rpc.setActivity({
      details: `🔊 ${track.title}`,
      state: `by ${track.artist}`,
      largeImageKey: 'quellqa_logo',
      largeImageText: `EQ: Bass Boosted`,
      smallImageKey: track.isPlaying ? 'play_icon' : 'pause_icon',
      smallImageText: track.isPlaying ? 'Cranking Decibels' : 'Paused',
      instance: false,
    }).catch(console.error);
  } else {
    setInitialPresence();
  }
});

rpc.on('ready', () => { setInitialPresence(); });
rpc.login({ clientId }).catch(console.error);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
