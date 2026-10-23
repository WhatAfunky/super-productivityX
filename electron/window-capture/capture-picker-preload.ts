import { contextBridge, ipcRenderer } from 'electron';

// The picker only talks to the main process; it never sees the main window.
contextBridge.exposeInMainWorld('capturePickerAPI', {
  onUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('capture-picker-update', (_event, data: unknown) => callback(data));
  },
  choose: (id: string) => ipcRenderer.send('capture-picker-choose', id),
  cancel: () => ipcRenderer.send('capture-picker-cancel'),
  refresh: () => ipcRenderer.send('capture-picker-refresh'),
  openSettings: () => ipcRenderer.send('capture-picker-open-settings'),
});
