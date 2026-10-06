import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { ProjectService } from '../../features/project/project.service';
import { Project } from '../../features/project/project.model';
import { LayersViewComponent } from '../../features/layer/layers-view/layers-view.component';
import { IS_LAYERS_PLATFORM_SUPPORTED } from '../../features/layer/layer.util';
import { T } from '../../t.const';

@Component({
  selector: 'project-layers-page',
  standalone: true,
  imports: [LayersViewComponent, MatButton, MatIcon, TranslatePipe],
  template: `
    @if (currentProject(); as project) {
      @if (isPlatformSupported && project.isLayersEnabled) {
        <layers-view [project]="project"></layers-view>
      } @else {
        <div class="callout disabled-notice">
          <mat-icon aria-hidden="true">layers</mat-icon>
          <div>
            <p>{{ T.F.LAYER.DISABLED_MSG | translate }}</p>
            @if (isPlatformSupported) {
              <button
                mat-flat-button
                color="primary"
                type="button"
                (click)="enable(project)"
              >
                {{ T.F.LAYER.ENABLE | translate }}
              </button>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        overflow: hidden !important;
      }

      .disabled-notice {
        margin: var(--s2);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectLayersPageComponent {
  private readonly _projectService = inject(ProjectService);

  readonly T = T;
  readonly isPlatformSupported = IS_LAYERS_PLATFORM_SUPPORTED;
  readonly currentProject = toSignal(this._projectService.currentProject$, {
    initialValue: null,
  });

  enable(project: Project): void {
    this._projectService.update(project.id, { isLayersEnabled: true });
  }
}
