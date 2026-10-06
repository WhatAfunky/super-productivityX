import { EntityState } from '@ngrx/entity';

/**
 * A layer records that something meaningful now exists in a project
 * (the Layers method, docs/plans/2026-10-06-layers-method-concept.md).
 *
 * Membership is stored on the layer itself (`projectId`, `sectionId`) and
 * derived everywhere else — no project or section keeps a list of layer ids.
 * A `sectionId` that no longer resolves to a section of the project means
 * "unfiled"; nothing rewrites layers when a section is deleted.
 */
export interface Layer {
  id: string;
  projectId: string;
  title: string;
  /** Epoch ms; the sort key (newest first). Never edited. */
  createdAt: number;
  /** Folder = a section of the same project. Missing or dangling → unfiled. */
  sectionId?: string | null;
  /**
   * Opaque id of a device-local screenshot (ClipboardImageService storage).
   * Never a path or URL, so a synced layer leaks nothing about the machine
   * and another device just shows "no image on this device".
   */
  imageId?: string | null;
}

export type LayerState = EntityState<Layer>;
