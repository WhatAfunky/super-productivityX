import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LayerService } from '../layer.service';
import { T } from '../../../t.const';

/**
 * Shows a layer's device-local screenshot. Three states: no image set
 * (renders `emptyText`), image set but not on this device (e.g. synced from
 * another machine), and the image itself.
 */
@Component({
  selector: 'layer-image',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (url(); as src) {
      <img
        [src]="src"
        [alt]="alt()"
        draggable="false"
      />
    } @else if (imageId() && isResolved()) {
      <span class="placeholder">{{ T.F.LAYER.NO_IMAGE_ON_DEVICE | translate }}</span>
    } @else if (!imageId()) {
      <span class="placeholder">{{ emptyText() }}</span>
    }
  `,
  styleUrls: ['./layer-image.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayerImageComponent {
  private _layerService = inject(LayerService);

  readonly imageId = input<string | null | undefined>(null);
  readonly alt = input<string>('');
  readonly emptyText = input<string>('');

  readonly T = T;
  readonly url = signal<string | null>(null);
  readonly isResolved = signal(false);

  constructor() {
    effect((onCleanup) => {
      const imageId = this.imageId();
      let isStale = false;
      onCleanup(() => (isStale = true));
      this.url.set(null);
      this.isResolved.set(false);
      if (!imageId) return;
      void this._layerService.resolveImageUrl(imageId).then((url) => {
        if (isStale) return;
        this.url.set(url);
        this.isResolved.set(true);
      });
    });
  }
}
