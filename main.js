const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc');

let win;
const clientId = '1508392537914871838'; 

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 600,
    title: "Quellqa",
    frame: false,
    resizable: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'dist-web/index.html'));
}

ipcMain.on('window-control', (event, action) => {
  if (!win) return;
  if (action === 'close') win.close();
  if (action === 'minimize') win.minimize();
});

const rpc = new DiscordRPC.Client({ transport: 'ipc' });

function setInitialPresence() {
  if (!rpc) return;
  rpc.setActivity({
    details: 'idle in the menus',
    state: 'quellqa v2',
    largeImageKey: 'quellqa_logo',
    instance: false,
  }).catch(console.error);
}

// Fixed to feed the album info straight to the RPC deck layout
ipcMain.on('update-rpc', (event, track) => {
  if (!rpc) return;
  if (track && track.isPlaying) {
    rpc.setActivity({
      details: `${track.title.toUpperCase()} // ${track.artist.toUpperCase()}`,
      state: `${track.album.toUpperCase()}`,
      largeImageKey: 'quellqa_logo',
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
