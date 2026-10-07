import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostBinding,
  input,
} from '@angular/core';
import { LayerLabel } from '../layer-label.model';
import { getLayerLabelColor } from '../layer-label.util';

/**
 * A label as a small, bold, uppercase solid pill (after osu!lazer's
 * RANKED / LOVED tags). The one place label pills are styled; reuse it rather
 * than restyling pills locally.
 */
@Component({
  selector: 'layer-label-pill',
  standalone: true,
  template: `{{ label().name }}`,
  styles: [
    `
      :host {
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: middle;
        padding: 0 var(--s);
        border-radius: var(--radius-sm);
        /* Palette fills are bright in every theme, so the text stays dark. */
        color: var(--c-dark-90);
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-bold);
        letter-spacing: var(--letter-spacing-wide);
        line-height: var(--s2);
        text-transform: uppercase;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayerLabelPillComponent {
  readonly label = input.required<Pick<LayerLabel, 'name' | 'color'>>();
  readonly bgColor = computed(() => getLayerLabelColor(this.label().color));

  @HostBinding('style.background-color') get hostBgColor(): string {
    return this.bgColor();
  }

  @HostBinding('attr.title') get hostTitle(): string {
    return this.label().name;
  }
}
