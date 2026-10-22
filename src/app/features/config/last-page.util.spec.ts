import { parseRestorablePage } from './last-page.util';

describe('parseRestorablePage', () => {
  it('accepts the main views and ignores query and fragment', () => {
    expect(parseRestorablePage('/project/p1/layers?x=1')).toEqual({
      kind: 'project',
      id: 'p1',
      path: '/project/p1/layers',
    });
    expect(parseRestorablePage('/project/p1/tasks')?.kind).toBe('project');
    expect(parseRestorablePage('/tag/TODAY/tasks')).toEqual({
      kind: 'tag',
      id: 'TODAY',
      path: '/tag/TODAY/tasks',
    });
    expect(parseRestorablePage('/planner#top')).toEqual({
      kind: 'planner',
      path: '/planner',
    });
  });

  it('rejects everything else', () => {
    for (const url of [
      null,
      '',
      '/config',
      '/search',
      '/project/p1/worklog',
      '/project/p1/layers/extra',
      '/tag/t1/worklog',
      'https://example.com/planner',
      '/planner/x',
    ]) {
      expect(parseRestorablePage(url)).toBeNull();
    }
  });
});
