import {
  FocusWidgetAction,
  FocusWidgetState,
} from '../shared-with-frontend/focus-widget.model';

interface TaskWidgetContentData {
  title: string;
  time: string;
  mode: 'pomodoro' | 'focus' | 'task' | 'idle';
}

interface TaskWidgetAPI {
  showMainWindow: () => void;
  onUpdateFocus: (callback: (state: FocusWidgetState | null) => void) => () => void;
  onUpdateFocusImage: (callback: (dataUrl: string | null) => void) => () => void;
  focusAction: (action: FocusWidgetAction) => void;
  onUpdateContent: (callback: (data: TaskWidgetContentData) => void) => () => void;
  onUpdateOpacity: (callback: (opacity: number) => void) => () => void;
}

declare global {
  interface Window {
    taskWidgetAPI: TaskWidgetAPI;
  }
}

export {};
