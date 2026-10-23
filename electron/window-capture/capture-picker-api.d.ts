import {
  CapturePermission,
  CapturePickerLabels,
  CapturePickerSource,
} from '../shared-with-frontend/window-capture.model';

interface CapturePickerUpdate {
  sources: CapturePickerSource[];
  labels: CapturePickerLabels | null;
  permission: CapturePermission;
}

interface CapturePickerAPI {
  onUpdate: (callback: (data: CapturePickerUpdate) => void) => void;
  choose: (id: string) => void;
  cancel: () => void;
  refresh: () => void;
  openSettings: () => void;
}

declare global {
  interface Window {
    capturePickerAPI: CapturePickerAPI;
  }
}

export {};
