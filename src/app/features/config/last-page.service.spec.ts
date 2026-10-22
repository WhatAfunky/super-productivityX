import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { LastPageService } from './last-page.service';
import { LS } from '../../core/persistence/storage-keys.const';

describe('LastPageService', () => {
  let service: LastPageService;
  let events: Subject<unknown>;

  const navigate = (url: string): void => events.next(new NavigationEnd(1, url, url));

  beforeEach(() => {
    localStorage.removeItem(LS.LAST_PAGE_URL);
    events = new Subject();
    TestBed.configureTestingModule({
      providers: [LastPageService, { provide: Router, useValue: { events } }],
    });
    service = TestBed.inject(LastPageService);
    service.init();
  });

  afterEach(() => localStorage.removeItem(LS.LAST_PAGE_URL));

  it('remembers the last main view, ignoring other pages', () => {
    navigate('/project/p1/layers');
    navigate('/config');
    expect(localStorage.getItem(LS.LAST_PAGE_URL)).toBe('/project/p1/layers');
    expect(service.read()).toEqual({
      kind: 'project',
      id: 'p1',
      path: '/project/p1/layers',
    });
  });

  it('reads nothing when nothing (or junk) is stored', () => {
    expect(service.read()).toBeNull();
    localStorage.setItem(LS.LAST_PAGE_URL, 'javascript:alert(1)');
    expect(service.read()).toBeNull();
  });
});
