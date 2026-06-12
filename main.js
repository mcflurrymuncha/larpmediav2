const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc');
const fs = require('fs');

let win;
const clientId = '1508392537914871838'; 

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 620,
    title: "LarpMedia",
    frame: false,
    resizable: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  win.loadFile(path.join(__dirname, 'dist-web/index.html'));
  win.once('ready-to-show', () => { setThumbarButtons(false); });
}

function setThumbarButtons(isPlaying) {
  if (!win || process.platform !== 'win32') return;
  try {
    win.setThumbarButtons([
      { tooltip: 'Previous Track', icon: 'media-skip-backward', click() { win.webContents.send('media-command', 'prev'); } },
      { tooltip: isPlaying ? 'Pause' : 'Play', icon: isPlaying ? 'media-pause' : 'media-play', click() { win.webContents.send('media-command', 'play-pause'); } },
      { tooltip: 'Next Track', icon: 'media-skip-forward', click() { win.webContents.send('media-command', 'next'); } }
    ]);
  } catch (e) {}
}

ipcMain.on('window-control', (event, action) => {
  if (!win) return;
  if (action === 'close') win.close();
  if (action === 'minimize') win.minimize();
});

ipcMain.on('sync-native-media', (event, data) => {
  if (win && data) setThumbarButtons(data.isPlaying);
});

// DISCORD RPC LINK
const rpc = new DiscordRPC.Client({ transport: 'ipc' });
function setInitialPresence() {
  rpc?.setActivity({ details: 'Browsing Library', state: 'v11.0.0', largeImageKey: 'quellqa_logo', instance: false }).catch(() => {});
}
ipcMain.on('update-rpc', (event, track) => {
  if (!rpc) return;
  if (track && track.isPlaying) {
    rpc.setActivity({ type: 2, details: `${track.title} // ${track.artist}`, state: `${track.album}`, largeImageKey: 'quellqa_logo', instance: false }).catch(() => {});
  } else {
    setInitialPresence();
  }
});
rpc.on('ready', () => { setInitialPresence(); });
rpc.login({ clientId }).catch(() => {});

// DIRECT RAW AUDIO EXTRACTOR (Bypasses all loading restrictions)
ipcMain.handle('select-music-dir', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'm4a'] }]
  });
  
  if (result.canceled) return [];
  
  const parsedFiles = [];
  for (const filePath of result.filePaths) {
    try {
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).replace('.', '');
      
      // Read file into raw memory buffer
      const fileBuffer = fs.readFileSync(filePath);
      // Turn raw buffer into direct streamable audio string
      const base64Audio = `data:audio/${ext === 'mp3' ? 'mpeg' : ext};base64,${fileBuffer.toString('base64')}`;

      parsedFiles.push({
        name: fileName,
        path: filePath,
        audioDataUrl: base64Audio
      });
    } catch (err) {
      console.error("Failed to extract data for file:", filePath, err);
    }
  }
  return parsedFiles;
});

app.whenReady().then(() => {
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
