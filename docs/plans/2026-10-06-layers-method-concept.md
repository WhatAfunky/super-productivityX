# Layers method — concept

**Status:** Draft 1, 2026-10-06. v0 is built on `feat/layers-v0`; see §12 for what shipped and where it differs from this plan. Anything marked **Open** is still undecided.

**Scope of the fork:** a personal change to a fork of Super Productivity. Sync is designed _in mind_ (§7) but is not a focus until v2.

**Mockup:** [2026-10-06-layers-method-mockup.html](2026-10-06-layers-method-mockup.html) — a throwaway, interactive HTML/CSS mockup with fake data (58 layers). Open it in a browser. It is a layout reference, not a visual spec.

---

## 1. Problem

Task lists track what you _have to do_. For a creative project (an animation, a game) that has two failure modes:

1. **Over-specific tasks create friction.** "Finish shot A and C" forces a path you may not want today; "Finish 2 shots today" is abstract enough to motivate. The wording is the problem, not the app — but the app gives the user nowhere to put the _result_.
2. **The gap between the idea and what exists feels insurmountable.** The method's answer is to make something exist, name it, and keep going.

**The Layers Method** (the author's own framework, v1.0, October 2026): a project is one giant piece you keep adding _layers_ to until you declare it finished. A layer is logged when **something meaningful exists that didn't exist before** — a thing created, not a task completed. The four stages (Extract, Anchor, Polish, Assemble) are a mental model, explicitly _not_ tracked in a tool. At the end of a session the only question is: did something exist after that didn't exist before?

This is a retrospective record ("what now exists"), which is what task lists don't have. Add that, keep everything else.

## 2. Goals and non-goals

**Goals**

- Log a **layer** quickly (a short name, optionally a screenshot) and see the project grow as a visual timeline.
- Group layers so a project with hundreds of them stays readable.
- Stay opt-in: a project without Layers looks exactly like today.

**Non-goals**

- No separate "Goal" entity. A goal is an ordinary task written loosely (§4).
- No tracking of the four stages, no phase gates, no folder "done" state. A folder never completes; it only collects layers.
- No nested subfolders (§5.4).
- No streaks, counters or reminders by default.
- No mobile support. Layers are a desktop concept.
- No syncing of screenshots (§7.3).

## 3. Decisions so far

| #   | Decision                                                                         | Why                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Goals are ordinary tasks; **Layer** is the new primitive.                        | Time tracking and focus mode both operate on tasks. A new Goal type would lose both. The friction is wording, not data.                                                 |
| D2  | Folders are the existing project **sections**.                                   | Reuse before new surface. Sections already exist, are named, ordered and per project.                                                                                   |
| D3  | **No subfolders.** Streams (code, art, UI, SFX) are **labels**, not folders.     | Phase and stream are independent axes; a tree can only follow one. A "save system" touches code, UI and SFX and would be filed under one parent.                        |
| D4  | **One label per layer.**                                                         | Unambiguous color, "group by label" is a true partition. Subject ("save system") is found via search and the layer name. Going multi later is a data change (see §7.2). |
| D5  | Labels are **per project**, with a **manager** (rename, recolor, merge, delete). | A game's labels differ from an animation's. Heavy tools live in the manager, light ones on the work screen.                                                             |
| D6  | Labels render as **solid, small, uppercase pills** (osu!lazer "RANKED" style).   | Author's preference. Reusable pill, not a local restyle (§9).                                                                                                           |
| D7  | **Layout A:** a Layers view next to Tasks, plus a small log strip in focus mode. | Keeps focus mode calm. The three-pane focus layout (mockup B, since removed) turned focus mode into a workspace.                                                        |
| D8  | **Opt-in per project, off by default.**                                          | Not every project is creative; "adapt, don't impose".                                                                                                                   |
| D9  | **Desktop only**; screenshots are **device-local**.                              | Author's choice. Avoids syncing binary data.                                                                                                                            |
| D10 | Vision statement and anchor are **v2**.                                          | Core to the method but not needed to test the idea.                                                                                                                     |
| D11 | Merging projects is **v3 or later**, as a general feature.                       | It touches many entities at once, which is the riskiest class of change here (§7.4). Moving a single layer between projects is far cheaper.                             |

## 4. Vocabulary

- **Goal** — a task whose title is written at goal level ("Finish 2 shots today"). Nothing new in code.
- **Layer** — a named thing that now exists, with an optional screenshot, an optional folder and an optional label. Newest first.
- **Folder** — a project **section**. Shared with the Tasks tab (see Open question O1).
- **Label** — a per-project name plus a color from a fixed palette. One per layer.
- **Anchor / Vision statement** — v2.

Relationship between goal and layer: a goal is _prospective_ (what I'm aiming at), a layer is _retrospective_ (what exists now). Completing a goal may offer to log a layer; a layer can also exist with no goal behind it.

## 5. UX

### 5.1 Layers view (mockup tab A1)

A second tab in the project, next to Tasks, shown only when Layers is on for the project.

- **List (left):** grouped **By folder** (default), **By label** or **Timeline** (all layers, newest first — this is also the export order). Each group shows the **newest 8** layers and a "Show N older…" row; groups collapse.
- **Toolbar:** search box (substring on the layer name), label chips that filter (with counts), `＋ Layer`, `＋ Folder`.
- **Row:** thumbnail (or "no image" placeholder), name, label pill, date. In "By label" the folder shows as a quiet outline tag instead.
- **Preview (right):** editable name, label and folder selectors, the screenshot, paste / choose / remove image, "Manage labels…".

### 5.2 Focus mode log strip (mockup tab A2)

One strip at the bottom of focus mode, only when the project has Layers on: layer name, label picker (defaults to the last label used), paste screenshot, Add layer. Nothing else about focus mode changes. It must not make the "hide everything except the task" promise untrue.

### 5.3 Label manager (mockup tab "Label manager")

Table per project: pill preview, name, color swatches, "used by N layers", merge into…, delete. Rename and recolor are single edits; the list updates live. Delete leaves the label's layers unlabeled.

### 5.4 Why one level of folders

A game has two independent axes: phase/stream and subject. Nesting forces a choice and becomes the UX mess we want to avoid. One level of folders + one label + search covers it. Planning ↔ production loops need no special support: a planning layer is just a layer in a planning folder.

### 5.5 Getting a screenshot in

- **v0:** paste from clipboard (OS shortcut, e.g. macOS Cmd+Ctrl+Shift+4, then Cmd+V) or drop/choose a file. The app already has a clipboard-image path (`src/app/core/clipboard-image/`), which stores a local file on desktop and uses IndexedDB on web.
- **v2:** an in-app "capture" button on Electron (needs the OS screen-recording permission and a window/screen picker).

### 5.6 Opt-in and platform gating

- A per-project switch, off by default (a new optional project field, §6.3). Off: no Layers tab, no focus strip.
- Hidden on native mobile and the phone-sized web layout. The slice still exists in the store on every client (it syncs like anything else), the UI just doesn't show it. The exact predicate is decided at implementation (`IS_ANDROID_WEB_VIEW`, `IS_IOS_NATIVE`, `IS_MOBILE` exist).

## 6. Data model

All new fields on persisted models are optional with a runtime default (AGENTS.md rule 11). Nothing here bumps `CURRENT_SCHEMA_VERSION` (rule 10).

### 6.1 `Layer` (new entity slice, modeled on `section`)

| Field       | Type      | Notes                                                                                              |
| ----------- | --------- | -------------------------------------------------------------------------------------------------- |
| `id`        | `string`  |                                                                                                    |
| `projectId` | `string`  | Layers only exist in projects.                                                                     |
| `title`     | `string`  | One short line. User content — never logged (rule 9).                                              |
| `createdAt` | `number`  | Epoch ms. Sorting key (id breaks ties). Not edited.                                                |
| `sectionId` | `string?` | Folder. A missing or dangling id means "unfiled" (§7.2). Fact lives on the layer, not the section. |
| `labelId`   | `string?` | One label. Missing or dangling means "no label".                                                   |
| `imageId`   | `string?` | Opaque id of a device-local screenshot (§7.3). **Not a path or URL.**                              |

No manual order field: layers are a chronological log, not a list to rearrange.

### 6.2 `LayerLabel` (new entity slice)

| Field          | Type      | Notes                                                                       |
| -------------- | --------- | --------------------------------------------------------------------------- |
| `id`           | `string`  |                                                                             |
| `projectId`    | `string`  | Labels are per project (D5).                                                |
| `name`         | `string`  |                                                                             |
| `color`        | `string`  | A key into a fixed palette, not a free hex (readable in both themes).       |
| `mergedIntoId` | `string?` | Alias to another label — how "merge" works without rewriting layers (§7.4). |

### 6.3 Project

One new optional field, e.g. `isLayersEnabled?: boolean`, default `false`. It goes through the existing project form config.

### 6.4 Deliberately not stored

- No `layerIds` on `Section` or `Project`; membership is derived from `layer.sectionId` / `layer.projectId` (AGENTS.md rule 13).
- No per-label layer counts; derived.
- No stage, phase-done flag, or order field.

## 7. State, sync and correctness

Sync is **not a focus until v2**: v0 and v1 add no sync-specific features and no sync tests. But every new persisted slice flows into the op-log automatically, and some choices are one-way doors, so they are made now.

### 7.1 What syncs

`Layer` and `LayerLabel` are ordinary entity slices and sync like `section` does. The `Project.isLayersEnabled` flag syncs with the project. **Screenshots do not sync.**

### 7.2 Shapes chosen for sync safety

- **Facts on the child, membership derived** (rule 13): `layer.sectionId`, `layer.labelId`.
- **Deleting a folder or label never writes to layers.** Layers with a dangling reference are shown as unfiled / unlabeled. No fan-out, no cross-entity op, no new fail-closed conflict (rule 14).
- **One user intent = one op** (rule 3): add layer, edit layer, delete layer, add/edit/delete label are each a single-entity action using the normal entity-update pattern.
- **Optional fields with runtime defaults** (rule 11). `frozen-state.spec.ts` must stay green; if it fails, fix the model, not the fixture.
- **One label per layer (D4) is a one-way door.** Going from `labelId` to a list later changes the wire shape for released clients. If that door should stay open, store `labelIds?: string[]` now and let the UI allow one. Current decision: single `labelId`.

### 7.3 Screenshots: device-local, but keyed by an opaque id

Pasted images are stored as a local file (Electron) or in IndexedDB (web) and referenced by URL today. Syncing that URL would leak a machine path to other devices and be useless there. Instead:

- The layer stores an opaque `imageId`. Each device resolves it locally (the file name or IndexedDB key is the id). If the image is not on this device, the UI shows the "no image on this device" placeholder from the mockup.
- This keeps the door open for syncing image blobs later (v3+), keyed by the same id, without changing the model.
- **To verify at implementation:** `ClipboardImageService` currently picks its own file name and returns a URL. v0 either extends it to accept a caller-supplied id or wraps it.

### 7.4 Label merge is an alias, not a rewrite

Merging "Sound" into "SFX" sets `Sound.mergedIntoId = SFX` — a single-entity edit. Reads resolve a label through the alias chain; counts and filters use the resolved label. The alternative (a meta-reducer that rewrites N layers and deletes the source label) is a multi-entity action, which AGENTS.md rule 14 says to reshape instead of compensating for. Resolution follows the chain with a visited-set, so concurrent merges on two devices (A→B and B→A) cannot loop: a cycle resolves to the label where traversal started, and no data is lost.

### 7.5 Rules this feature must follow

- Effects inject `LOCAL_ACTIONS`, never `Actions` (rule 1); prefer action-based effects (rule 2).
- **Day grouping** in the timeline (if added) goes through `DateService`, not raw `Date` (rule 4).
- **Logging:** `Log.log({ id: layer.id })`, never the title or label name (rule 9).
- **Project delete** must also remove that project's layers and labels. Extend the existing project-delete handling (see `section-shared.reducer.ts`), as one reducer pass.
- No `Section.taskIds`-style lists for layers (rule 13).
- Concurrent edits to one layer resolve via the generic whole-entity path. No per-action resolution logic (rule 12).

### 7.6 Deferred to v2 (sync pass)

- E2E: add/rename layer on two clients and converge; concurrent label rename vs recolor; the "no image on this device" placeholder across two clients; project delete while another client adds a layer.
- Decide whether `Section` deletion warrants anything beyond "layers show as unfiled".
- Confirm the touch-point checklist in §10 against a fresh `section` diff.
- **Blocker for syncing with anything upstream (found in v0):** every op carries an entity type, and the official SuperSync server rejects types it doesn't know (`ALLOWED_ENTITY_TYPES` in `packages/super-sync-server/src/sync/services/validation.service.ts`, "Invalid entityType"). `LAYER` exists only in this fork, so layer ops would be refused by an unmodified server, and official apps on other devices may fail on them too (unverified for Dropbox/WebDAV/file sync). Before turning on sync: self-host the fork's server, or keep every synced device on this fork.
- Orphan cleanup: a layer whose project was deleted on another device in the same sync window is not removed by any repair yet.

## 8. Phasing

**v0 — prove the idea** (no labels, no focus changes)

- `Layer` slice + registration; `isLayersEnabled` on projects + the settings switch.
- Layers tab: By folder and Timeline, newest-8 with "show older", preview pane.
- Add / rename / delete a layer; assign a folder; paste or choose a screenshot.
- Gating off on mobile. Unit tests for the reducer and selectors.

**v1 — labels and focus**

- `LayerLabel` slice; pill component; label picker; By label view; chips filter; search.
- Label manager: rename, recolor, merge (alias), delete.
- Focus mode log strip (A2).
- Offer to log a layer when a goal is completed: a small non-blocking action, not a dialog.

**v2 — method and polish**

- Vision statement (a text field on the project) and an **anchor** star on one layer, with the anchor pinned for comparison.
- In-app capture on Electron.
- Export screenshots in timeline order.
- Opt-in end-of-session "did something exist?" nudge.
- The sync pass (§7.6).

**v3+**

- Move a layer to another project.
- Merge projects (general app feature; layers ride along).
- Syncing screenshot blobs.
- Archive/compact old layers if lists still feel heavy.

## 9. Fit with product principles

- **Avoids feature creep:** reuses sections, the project view, focus mode and the clipboard-image path. Opt-in and off by default.
- **Less noise:** no streaks, no counters, no default reminders; "showing up still matters" is the method's own line.
- **Privacy and offline first:** no telemetry. Screenshots stay on the device.
- **No new dependencies** at the root.
- **Styling:** the label pill is a **reusable component or shared style** (see `docs/styling-guide.md` and the rule against local restyles). Saturated solid pills on every row can get loud on a long list; if so, mute the palette rather than change the shape.
- **The osu!lazer-inspired theme** is a separate, later piece of work (`docs/theming-contract.md`). Only the pill shape is taken from it here.
- **Task component is a hot path:** Layers must not touch `task.component.*`.
- **Translations:** all strings via `T` keys; edit `en.json` only.
- **User docs:** a user-facing feature needs an entry per `docs/documentation-guide.md`.

## 10. Touch points (from the `section` precedent — re-verify before starting)

- `src/app/op-log/core/entity-registry.ts` — register the entities.
- `src/app/op-log/model/model-config.ts` — add both slices to the model config.
- `src/app/op-log/core/action-types.enum.ts` — action types.
- `src/app/op-log/core/types/backup.types.ts`, `src/app/op-log/persistence/extract-entity-keys.ts`, `src/app/op-log/apply/hydration-state.service.ts` — wherever `section` appears.
- `src/app/root-store/meta/task-shared-meta-reducers/section-shared.reducer.ts` and `project-shared.reducer.ts` — project-delete handling.
- `src/app/features/project/project.model.ts`, `project-form-cfg.const.ts` — the opt-in flag.
- `src/app/features/work-view/` — where the Layers tab attaches.
- `src/app/features/focus-mode/` — the log strip (v1).
- `src/app/core/clipboard-image/` — screenshots.

## 11. Open questions

- **O1.** Sections now do double duty: they group tasks in the Tasks tab and layers in the Layers tab. If that is confusing in practice (a game's "This week" task section is not a layer folder), the alternative is separate layer folders — a third new slice. Revisit after using v0.
- **O2.** Should the Tasks tab be called "Goals" in Layers-enabled projects? Default: no, to avoid wording churn.
- **O3.** What exactly counts as "desktop" for gating — Electron only, or desktop browsers too? The clipboard-image path already works on web.
- **O4.** Thumbnails: v0 can scale the stored image with CSS and lazy loading; if big screenshots make lists heavy, generate small thumbnails in v1.
- **O5.** Copy labels from another project, for people who run several game projects. Later.
- **O6.** Single `labelId` vs `labelIds` (§7.2).

## 12. v0 as built (2026-10-06)

What shipped on `feat/layers-v0`, and where it differs from the plan above:

- **Data:** `Layer` slice (`src/app/features/layer/`) with `id`, `projectId`, `title`, `createdAt`, `sectionId?`, `imageId?`; entity type `LAYER`; op codes `LYA`/`LYU`/`LYD`. The slice is typed `LayerState | undefined` in the model config so data written before layers validates unchanged (`frozen-state.spec.ts` stays green). Updates can never change `id`, `projectId` or `createdAt`. Deleting a project removes its layers in the same op.
- **Opt-in:** `Project.isLayersEnabled?`, a switch in project settings shown only where Layers are supported. The settings dialog writes it only on those platforms, so editing a project on mobile can't switch Layers off.
- **Platform (O3 decided for v0):** hidden on the native mobile apps only. Desktop browsers get Layers too; their screenshots go to IndexedDB with the existing 2 MB cap.
- **Tasks ⇄ Layers switch:** an icon button in the header next to the project menu, not the segmented control from the mockup. The header row is tuned tightly for width, and one icon button follows the existing pattern there.
- **Route:** `/project/:id/layers`. If Layers are off, it shows a notice with a "Turn on Layers" button.
- **Screenshots:** paste anywhere on the Layers view (Cmd/Ctrl+V; pastes into text fields are left alone), drop onto the preview, or "Choose image…". Stored through `ClipboardImageService` under ids of the form `layer-<nanoid>`. Only ids in that exact shape are ever loaded or deleted, because synced ids end up in file names. Replacing or removing an image, or deleting a layer, deletes the old file on this device.
- **Known caveat:** Settings → Clipboard images → "delete all" also deletes layer screenshots. The layers then show "No image on this device".
- **Folders:** "Add folder" in the Layers view creates an ordinary project section, so it also shows in the Tasks tab (O1 still open).
- **Not in v0, as planned:** labels, the focus-mode strip, search, vision and anchor.
