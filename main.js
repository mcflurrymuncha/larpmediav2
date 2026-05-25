const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const DiscordRPC = require('discord-rpc');
const ytdl = require('ytdl-core'); // Moved directly to the top engine imports

let win;
const clientId = '1508392537914871838'; 

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 600,
    title: "QUELLQA",
    frame: false,
    resizable: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'dist-web/index.html'));
  
  // Set up taskbar transport control overlays for Windows OS
  if (process.platform === 'win32') {
    setThumbarButtons(false); // Initialize with standby state
  }
}

// Native Windows System Media Control Engine
function setThumbarButtons(isPlaying) {
  if (!win || process.platform !== 'win32') return;

  try {
    win.setThumbarButtons([
      {
        tooltip: 'Previous Track',
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
        tooltip: 'Next Track',
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

// Windows Media Playback Hook Sync
ipcMain.on('sync-native-media', (event, data) => {
  if (!win || !data) return;
  // Dynamically update taskbar controls to match active state
  setThumbarButtons(data.isPlaying);
});

// Resolve YouTube Music URLs into direct raw audio stream pipelines
ipcMain.handle('resolve-ytmusic', async (event, trackUrl) => {
  try {
    if (!ytdl.validateURL(trackUrl)) {
      return { success: false, error: 'INVALID_YOUTUBE_URL' };
    }

    const info = await ytdl.getInfo(trackUrl);
    
    // Filter out visual elements to extract the highest quality audio-only container node
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    const highestAudioFormat = ytdl.chooseFormat(audioFormats, { quality: 'highestaudio' });

    // Extract thumbnails cleanly for the geometric cover art module
    const thumbnails = info.videoDetails.thumbnails;
    const cleanCoverArt = thumbnails && thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';

    return {
      success: true,
      streamUrl: highestAudioFormat.url,
      title: info.videoDetails.title,
      artist: info.videoDetails.author.name || "UNKNOWN ARTIST",
      album: "YouTube Music Stream",
      coverArt: cleanCoverArt
    };
  } catch (error) {
    console.error("YouTube Music stream extraction failed:", error);
    return { success: false, error: error.message };
  }
});

// --- DISCORD TELEMETRY DISPATCH ---

const rpc = new DiscordRPC.Client({ transport: 'ipc' });

function setInitialPresence() {
  if (!rpc) return;
  rpc.setActivity({
    details: 'idle in the menus',
    state: 'quellqa v4.0 // beta',
    largeImageKey: 'quellqa_logo',
    instance: false,
  }).catch(console.error);
}

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

// --- HARDWARE LIFECYCLE ROUTERS ---

app.whenReady().then(() => {
  // Force Windows to keep background throttling from sleeping the audio processing threads instantly
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');

  createWindow();

  // Register native keyboard media listeners to send back down into the web canvas
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
