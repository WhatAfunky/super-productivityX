import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { Section } from '../../section/section.model';
import { MAX_LAYER_TITLE_LENGTH } from '../layer.util';
import { T } from '../../../t.const';

export interface DialogAddLayerData {
  sections: readonly Section[];
  /** Pre-selected folder; null means "No folder". */
  defaultSectionId: string | null;
}

export interface DialogAddLayerResult {
  title: string;
  sectionId: string | null;
}

@Component({
  selector: 'dialog-add-layer',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelect,
    MatOption,
    MatButton,
    TranslatePipe,
  ],
  template: `
    <h1 mat-dialog-title>{{ T.F.LAYER.ADD | translate }}</h1>
    <form
      #formEl="ngForm"
      (ngSubmit)="submit()"
    >
      <mat-dialog-content class="fields">
        <mat-form-field>
          <mat-label>{{ T.F.LAYER.NAME | translate }}</mat-label>
          <input
            matInput
            name="title"
            required
            cdkFocusInitial
            [(ngModel)]="title"
            [maxlength]="MAX_TITLE_LENGTH"
            [placeholder]="T.F.LAYER.ADD_PLACEHOLDER | translate"
          />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ T.F.LAYER.FOLDER | translate }}</mat-label>
          <mat-select
            name="sectionId"
            [(ngModel)]="sectionId"
          >
            <mat-option [value]="NO_FOLDER">{{
              T.F.LAYER.NO_FOLDER | translate
            }}</mat-option>
            @for (section of data.sections; track section.id) {
              <mat-option [value]="section.id">{{ section.title }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button
          mat-button
          type="button"
          (click)="cancel()"
        >
          {{ T.G.CANCEL | translate }}
        </button>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="!title.trim()"
        >
          {{ T.F.LAYER.ADD | translate }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .fields {
        display: flex;
        flex-direction: column;
        min-width: min(360px, 80vw);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogAddLayerComponent {
  private _matDialogRef =
    inject<MatDialogRef<DialogAddLayerComponent, DialogAddLayerResult>>(MatDialogRef);
  readonly data = inject<DialogAddLayerData>(MAT_DIALOG_DATA);

  readonly T = T;
  readonly MAX_TITLE_LENGTH = MAX_LAYER_TITLE_LENGTH;
  // mat-select shows a null value as "nothing selected", so "No folder" is ''
  // inside the dialog and null outside it.
  readonly NO_FOLDER = '';
  title = '';
  // A default that no longer exists (folder deleted meanwhile) falls back to none.
  sectionId: string =
    this.data.defaultSectionId &&
    this.data.sections.some((s) => s.id === this.data.defaultSectionId)
      ? this.data.defaultSectionId
      : this.NO_FOLDER;

  submit(): void {
    const title = this.title.trim();
    if (!title) return;
    this._matDialogRef.close({ title, sectionId: this.sectionId || null });
  }

  cancel(): void {
    this._matDialogRef.close(undefined);
  }
}
