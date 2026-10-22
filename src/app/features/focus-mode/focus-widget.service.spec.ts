import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateService } from '@ngx-translate/core';
import { FocusWidgetService, getFocusWidgetPhase } from './focus-widget.service';
import { FocusSessionControlService } from './focus-session-control.service';
import { FocusScreen, TimerState } from './focus-mode.model';
import { parseFocusWidgetAction } from '../../../../electron/shared-with-frontend/focus-widget.model';

describe('FocusWidgetService', () => {
  const timer = (purpose: TimerState['purpose']): TimerState => ({
    isRunning: true,
    startedAt: 0,
    elapsed: 0,
    duration: 0,
    purpose,
  });

  it('shows the focus layout for work, breaks and a just-completed session', () => {
    expect(getFocusWidgetPhase(timer('work'), FocusScreen.Main, false)).toBe('work');
    expect(getFocusWidgetPhase(timer('break'), FocusScreen.Break, false)).toBe('break');
    expect(getFocusWidgetPhase(timer(null), FocusScreen.SessionDone, true)).toBe('done');
    expect(getFocusWidgetPhase(timer(null), FocusScreen.SessionDone, false)).toBeNull();
    expect(getFocusWidgetPhase(timer(null), FocusScreen.Main, true)).toBeNull();
    expect(getFocusWidgetPhase(undefined, undefined, false)).toBeNull();
  });

  it('accepts only known widget actions with sane minutes', () => {
    expect(parseFocusWidgetAction({ action: 'toggle' })).toEqual({ action: 'toggle' });
    expect(parseFocusWidgetAction({ action: 'logBreak', minutes: '15' })).toEqual({
      action: 'logBreak',
      minutes: 15,
    });
    for (const bad of [
      null,
      'toggle',
      { action: 'deleteEverything' },
      { action: 'logBreak', minutes: 0 },
      { action: 'logBreak', minutes: -3 },
      { action: 'logBreak', minutes: 'abc' },
      { action: 'logBreak', minutes: 100000 },
    ]) {
      expect(parseFocusWidgetAction(bad)).toBeNull();
    }
  });

  it('routes widget buttons to the shared session controls', async () => {
    const control = jasmine.createSpyObj<FocusSessionControlService>('Control', [
      'toggle',
      'complete',
      'cancel',
      'skipBreak',
      'logBreak',
    ]);
    control.cancel.and.resolveTo();
    control.logBreak.and.resolveTo();
    TestBed.configureTestingModule({
      providers: [
        FocusWidgetService,
        provideMockStore(),
        { provide: FocusSessionControlService, useValue: control },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    });
    const service = TestBed.inject(FocusWidgetService);

    await service.handleAction({ action: 'toggle' });
    await service.handleAction({ action: 'complete' });
    await service.handleAction({ action: 'cancel' });
    await service.handleAction({ action: 'skipBreak' });
    await service.handleAction({ action: 'logBreak', minutes: 15 });

    expect(control.toggle).toHaveBeenCalledTimes(1);
    expect(control.complete).toHaveBeenCalledTimes(1);
    expect(control.cancel).toHaveBeenCalledTimes(1);
    expect(control.skipBreak).toHaveBeenCalledTimes(1);
    expect(control.logBreak).toHaveBeenCalledOnceWith(15 * 60000);
  });
});
