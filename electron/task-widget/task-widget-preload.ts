import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('taskWidgetAPI', {
  showMainWindow: () => {
    ipcRenderer.send('task-widget-show-main-window');
  },
  onUpdateContent: (callback: (data: any) => void) => {
    const listener = (event: Electron.IpcRendererEvent, data: any): void =>
      callback(data);
    ipcRenderer.on('update-content', listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('update-content', listener);
    };
  },
  onUpdateFocus: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown): void =>
      callback(state);
    ipcRenderer.on('update-focus', listener);
    return () => {
      ipcRenderer.removeListener('update-focus', listener);
    };
  },
  onUpdateFocusImage: (callback: (dataUrl: string | null) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, dataUrl: string | null): void =>
      callback(dataUrl);
    ipcRenderer.on('update-focus-image', listener);
    return () => {
      ipcRenderer.removeListener('update-focus-image', listener);
    };
  },
  focusAction: (action: unknown) => {
    ipcRenderer.send('task-widget-focus-action', action);
  },
  onUpdateOpacity: (callback: (opacity: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, opacity: number): void =>
      callback(opacity);
    ipcRenderer.on('update-opacity', listener);

    return () => {
      ipcRenderer.removeListener('update-opacity', listener);
    };
  },
});
