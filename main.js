const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc');

let win;
// Your specific Quellqa application client ID
const clientId = '1508392537914871838'; 

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 650,
    title: "Quellqa Audio",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'dist-web/index.html'));
}

const rpc = new DiscordRPC.Client({ transport: 'ipc' });

function setInitialPresence() {
  if (!rpc) return;
  rpc.setActivity({
    details: 'Browsing',
    state: 'Idle',
    largeImageKey: 'quellqa_logo',
    largeImageText: 'Quellqa Audio',
    instance: false,
  }).catch(console.error);
}

ipcMain.on('update-rpc', (event, track) => {
  if (!rpc) return;
  
  if (track) {
    rpc.setActivity({
      details: `Listening to ${track.title}`,
      state: `by ${track.artist}`,
      largeImageKey: 'quellqa_logo',
      largeImageText: `Album: ${track.album}`,
      smallImageKey: track.isPlaying ? 'play_icon' : 'pause_icon',
      smallImageText: track.isPlaying ? 'Blasting Ears' : 'Paused',
      instance: false,
    }).catch(console.error);
  } else {
    setInitialPresence();
  }
});

rpc.on('ready', () => {
  setInitialPresence();
});

rpc.login({ clientId }).catch(console.error);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
