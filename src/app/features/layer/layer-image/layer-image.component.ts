import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LayerImageService } from '../layer-image.service';
import { EnlargeImgDirective } from '../../../ui/enlarge-img/enlarge-img.directive';
import { T } from '../../../t.const';

/**
 * Shows a layer's device-local screenshot. Three states: no image set
 * (renders `emptyText`), image set but not on this device (e.g. synced from
 * another machine), and the image itself. List rows use the small thumbnail;
 * the preview uses the full image, which can be clicked to enlarge.
 */
@Component({
  selector: 'layer-image',
  standalone: true,
  imports: [TranslatePipe, EnlargeImgDirective],
  template: `
    @if (url(); as src) {
      @if (variant() === 'full') {
        <img
          class="isEnlargeable"
          [src]="src"
          [alt]="alt()"
          [enlargeImg]="src"
          draggable="false"
        />
      } @else {
        <img
          [src]="src"
          [alt]="alt()"
          draggable="false"
        />
      }
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
  private _layerImageService = inject(LayerImageService);

  readonly imageId = input<string | null | undefined>(null);
  readonly variant = input<'thumb' | 'full'>('thumb');
  readonly alt = input<string>('');
  readonly emptyText = input<string>('');

  readonly T = T;
  readonly url = signal<string | null>(null);
  readonly isResolved = signal(false);

  constructor() {
    effect((onCleanup) => {
      const imageId = this.imageId();
      const variant = this.variant();
      let isStale = false;
      onCleanup(() => (isStale = true));
      this.url.set(null);
      this.isResolved.set(false);
      if (!imageId) return;
      const resolve =
        variant === 'full'
          ? this._layerImageService.resolveFull(imageId)
          : this._layerImageService.resolveThumbnail(imageId);
      void resolve.then((url) => {
        if (isStale) return;
        this.url.set(url);
        this.isResolved.set(true);
      });
    });
  }
}
