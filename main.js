const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 650,
    title: "Quellqa Audio",
    autoHideMenuBar: true, // Hides the old-school file/edit menu bar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Loads the built web files
  win.loadFile(path.join(__dirname, 'dist-web/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
