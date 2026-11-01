// Bridge between this PC's own screens (bar, setup, local hub pages) and the app.
// The website never gets it: it runs like in any browser.
const { contextBridge, ipcRenderer } = require("electron");

const local = /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin);
if (local) {
  contextBridge.exposeInMainWorld("spotifood", {
    state: () => ipcRenderer.invoke("state"),
    action: (name, arg) => ipcRenderer.invoke("action", name, arg),
    onState: (fn) => ipcRenderer.on("state", (_e, s) => fn(s)),
  });
}
