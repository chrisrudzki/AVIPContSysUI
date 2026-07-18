const { app, BrowserWindow } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(
      path.join(__dirname, "dist/index.html")
    );
  }
}

app.whenReady().then(createWindow);