const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

if (!app.requestSingleInstanceLock()) app.quit();

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 420,
    minHeight: 560,
    title: "Homework Lens",
    backgroundColor: "#F0F4F8",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));

  // Links open in the browser; the app window never navigates away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) {
      e.preventDefault();
      if (url.startsWith("https://")) shell.openExternal(url);
    }
  });
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
