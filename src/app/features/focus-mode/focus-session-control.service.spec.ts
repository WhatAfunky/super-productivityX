import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Action } from '@ngrx/store';
import { signal } from '@angular/core';
import { FocusSessionControlService } from './focus-session-control.service';
import { FocusSessionTimeService } from './focus-session-time.service';
import { FocusModeService } from './focus-mode.service';
import { TaskService } from '../tasks/task.service';
import { selectPausedTaskId } from './store/focus-mode.selectors';
import { FocusModeMode } from './focus-mode.model';
import * as a from './store/focus-mode.actions';

describe('FocusSessionControlService', () => {
  let service: FocusSessionControlService;
  let store: MockStore;
  let dispatched: Action[];
  let discard: jasmine.Spy;
  const mode = signal(FocusModeMode.Flowtime);
  const isPaused = signal(false);
  const elapsed = signal(10 * 60000);
  const currentTaskId = signal<string | null>('t1');

  beforeEach(() => {
    mode.set(FocusModeMode.Flowtime);
    isPaused.set(false);
    elapsed.set(10 * 60000);
    currentTaskId.set('t1');
    discard = jasmine.createSpy('discard').and.resolveTo(0);
    TestBed.configureTestingModule({
      providers: [
        FocusSessionControlService,
        provideMockStore(),
        { provide: FocusSessionTimeService, useValue: { discard } },
        {
          provide: FocusModeService,
          useValue: { mode, isSessionPaused: isPaused, timeElapsed: elapsed },
        },
        { provide: TaskService, useValue: { currentTaskId } },
      ],
    });
    service = TestBed.inject(FocusSessionControlService);
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectPausedTaskId, 'paused');
    store.refreshState();
    dispatched = [];
    spyOn(store, 'dispatch').and.callFake(((x: Action) => {
      dispatched.push(x);
    }) as unknown as MockStore['dispatch']);
  });

  it('toggle pauses a running session and resumes a paused one', () => {
    service.toggle();
    expect(dispatched[0]).toEqual(a.pauseFocusSession({ pausedTaskId: 't1' }));
    isPaused.set(true);
    service.toggle();
    expect(dispatched[1]).toEqual(a.unPauseFocusSession());
  });

  it('the goal falls back to the paused task while tracking is off', () => {
    currentTaskId.set(null);
    expect(service.goalTaskId()).toBe('paused');
  });

  it('complete ends Flowtime through its own action, other modes directly', () => {
    service.complete();
    expect(dispatched[0]).toEqual(a.endFlowtimeSession({ pausedTaskId: 't1' }));
    mode.set(FocusModeMode.Pomodoro);
    service.complete();
    expect(dispatched[1]).toEqual(a.completeFocusSession({ isManual: true }));
  });

  it('cancel ends the session, then discards its elapsed time from the goal', async () => {
    await service.cancel();
    expect(dispatched).toEqual([a.cancelFocusSession()]);
    expect(discard).toHaveBeenCalledOnceWith('t1', 10 * 60000);
  });

  it('logBreak is capped at the elapsed time and ignores nothing-to-cut', async () => {
    await service.logBreak(60 * 60000);
    expect(dispatched).toEqual([a.logFlowtimeBreak({ amountMs: 10 * 60000 })]);
    expect(discard).toHaveBeenCalledOnceWith('t1', 10 * 60000);
    elapsed.set(0);
    await service.logBreak(60000);
    expect(dispatched.length).toBe(1);
  });

  it('skipBreak passes the goal on', () => {
    service.skipBreak();
    expect(dispatched[0]).toEqual(a.skipBreak({ pausedTaskId: 't1' }));
  });
});
