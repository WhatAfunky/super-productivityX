import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { FocusSessionTimeService } from './focus-session-time.service';
import { TaskService } from '../tasks/task.service';
import { selectTaskEntities } from '../tasks/store/task.selectors';
import { Task } from '../tasks/task.model';
import { DateService } from '../../core/date/date.service';

describe('FocusSessionTimeService', () => {
  let service: FocusSessionTimeService;
  let store: MockStore;
  let taskService: jasmine.SpyObj<TaskService>;
  const M = 60000;
  const TODAY = '2026-10-10';
  const YESTERDAY = '2026-10-09';
  const OLDER = '2026-10-08';

  const setTask = (timeSpentOnDay: Record<string, number>): void => {
    store.overrideSelector(selectTaskEntities, {
      t1: { id: 't1', timeSpentOnDay } as unknown as Task,
    });
    store.refreshState();
  };

  beforeEach(() => {
    taskService = jasmine.createSpyObj<TaskService>('TaskService', ['removeTimeSpent']);
    TestBed.configureTestingModule({
      providers: [
        FocusSessionTimeService,
        provideMockStore(),
        { provide: TaskService, useValue: taskService },
        {
          provide: DateService,
          // Logical "now": 2026-10-10 00:30, so yesterday is 2026-10-09.
          useValue: { getLogicalTodayDate: () => new Date(2026, 9, 10, 0, 30) },
        },
      ],
    });
    service = TestBed.inject(FocusSessionTimeService);
    store = TestBed.inject(MockStore);
  });

  it('removes the time from today', async () => {
    setTask({ [TODAY]: 50 * M });
    expect(await service.discard('t1', 20 * M)).toBe(20 * M);
    expect(taskService.removeTimeSpent.calls.allArgs()).toEqual([['t1', 20 * M, TODAY]]);
  });

  it('takes the rest from yesterday when the session crossed midnight', async () => {
    setTask({ [TODAY]: 30 * M, [YESTERDAY]: 3 * 60 * M });
    expect(await service.discard('t1', 70 * M)).toBe(70 * M);
    expect(taskService.removeTimeSpent.calls.allArgs()).toEqual([
      ['t1', 30 * M, TODAY],
      ['t1', 40 * M, YESTERDAY],
    ]);
  });

  it('never removes more than was tracked, and ignores older days', async () => {
    setTask({ [TODAY]: 5 * M, [OLDER]: 60 * M });
    expect(await service.discard('t1', 30 * M)).toBe(5 * M);
    expect(taskService.removeTimeSpent).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a task or a positive amount', async () => {
    setTask({ [TODAY]: 5 * M });
    expect(await service.discard(null, 10 * M)).toBe(0);
    expect(await service.discard('t1', 0)).toBe(0);
    expect(await service.discard('missing', 10 * M)).toBe(0);
    expect(taskService.removeTimeSpent).not.toHaveBeenCalled();
  });
});
