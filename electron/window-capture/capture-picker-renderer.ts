// Runs as a plain <script> (no imports); types come from capture-picker-api.d.ts.
type PickerUpdate = Parameters<Parameters<Window['capturePickerAPI']['onUpdate']>[0]>[0];

const api = window.capturePickerAPI;
const grid = document.getElementById('grid') as HTMLElement;
const useBtn = document.getElementById('use') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement;
const refreshBtn = document.getElementById('refresh') as HTMLButtonElement;
const emptyEl = document.getElementById('empty') as HTMLElement;
const permissionEl = document.getElementById('permission') as HTMLElement;
const permissionText = document.getElementById('permission-text') as HTMLElement;
const settingsBtn = document.getElementById('open-settings') as HTMLButtonElement;
let selectedId: string | null = null;

const setText = (id: string, text: string): void => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

const render = (data: PickerUpdate): void => {
  const l = data.labels;
  if (l) {
    document.title = l.title;
    setText('title', l.title);
    setText('hint', l.hint);
    refreshBtn.textContent = '↻ ' + l.refresh;
    cancelBtn.textContent = l.cancel;
    useBtn.textContent = l.use;
    emptyEl.textContent = l.empty;
    permissionText.textContent = l.permission;
    settingsBtn.textContent = l.openSettings;
  }
  permissionEl.hidden = data.permission === 'granted';
  if (!data.sources.some((s) => s.id === selectedId)) selectedId = null;
  useBtn.disabled = !selectedId;
  emptyEl.hidden = data.sources.length > 0;
  grid.replaceChildren(
    ...data.sources.map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'win' + (s.id === selectedId ? ' sel' : '');
      const img = document.createElement('img');
      img.src = s.thumbnail;
      img.alt = '';
      const name = document.createElement('span');
      name.textContent = s.title;
      name.title = s.title;
      b.append(img, name);
      b.addEventListener('click', () => {
        selectedId = s.id;
        grid.querySelectorAll('.win').forEach((el) => el.classList.remove('sel'));
        b.classList.add('sel');
        useBtn.disabled = false;
      });
      b.addEventListener('dblclick', () => api.choose(s.id));
      return b;
    }),
  );
};

api.onUpdate(render);
useBtn.addEventListener('click', () => {
  if (selectedId) api.choose(selectedId);
});
cancelBtn.addEventListener('click', () => api.cancel());
refreshBtn.addEventListener('click', () => api.refresh());
settingsBtn.addEventListener('click', () => api.openSettings());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.cancel();
  if (e.key === 'Enter' && selectedId) api.choose(selectedId);
});
