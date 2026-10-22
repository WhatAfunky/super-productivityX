import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { LS } from '../../core/persistence/storage-keys.const';
import { parseRestorablePage, RestorablePage } from './last-page.util';

/**
 * Remembers the last main view this device showed, for the "Where I left
 * off" start page. Device-local (localStorage): never synced, and only ids
 * that are already in the URL are stored.
 */
@Injectable({
  providedIn: 'root',
})
export class LastPageService {
  private _router = inject(Router);
  private _destroyRef = inject(DestroyRef);

  init(): void {
    this._router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((e) => {
        const page = parseRestorablePage(e.urlAfterRedirects);
        if (!page) return;
        try {
          localStorage.setItem(LS.LAST_PAGE_URL, page.path);
        } catch {
          // Storage unavailable (private mode, quota): just don't remember.
        }
      });
  }

  read(): RestorablePage | null {
    try {
      return parseRestorablePage(localStorage.getItem(LS.LAST_PAGE_URL));
    } catch {
      return null;
    }
  }
}
