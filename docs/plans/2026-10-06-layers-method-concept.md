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
- Focus mode: an **Add layer** button opening the shared Add layer dialog (decided 2026-10-06; replaces the inline strip from mockup A2, so there is one way to add a layer).
- Offer to log a layer when a goal is completed: a small non-blocking action, not a dialog.

**v1.1 — small additions** (decided 2026-10-07)

- "Duplicate" on the selected layer: same name + " copy", same folder and label, a new `createdAt` (so it goes on top), and the **same screenshot**. The image is copied to a new `imageId` rather than shared: deleting or replacing one layer's image deletes its file, so a shared id would silently strip the other layer.

- **Folder reordering from the Layers view** (asked for 2026-10-07): Drag a folder by its title, the same gesture as the Tasks tab, plus Move up / Move down in a small menu on each folder header (keyboard-friendly). The order is shared, so a move in either view shows in both. Folders are project sections, which already keep an order (`updateSectionOrder`, the same action the Tasks tab uses when you drag a section title), so this reuses the existing op and its conflict handling. No new persisted field. The Layers view already follows that order today.

- **Optimizations** (agreed 2026-10-08):
  1. Thumbnails: store a small thumbnail next to each screenshot and use it in the list; load the full image only in the preview. Cap or release the cached image URLs.
  2. Re-encode large screenshots (e.g. WebP) on save, so desktop browsers stay under the 2 MB web limit and disk use drops.
  3. No orphaned or wrongly deleted images: deleting a project also deletes its layers' screenshot files on this device, and the clipboard-images "delete all" leaves layer screenshots alone.
- **QoL** (agreed 2026-10-08):
  - Paste to create: Cmd/Ctrl+V with no layer selected opens Add layer with the screenshot attached.
  - Click the preview screenshot to enlarge it (reuse the app's image viewer).
  - Keyboard in the Layers view: ↑/↓ select, Enter rename, Delete delete (with confirm).
  - Remember the view mode (By folder / By label / Timeline) per project on this device.
  - **New layer shortcut**, default Ctrl/Cmd+N, rebindable in Settings → Keyboard shortcuts (a new optional key in the keyboard config, with a default). Desktop app only: browsers reserve Cmd/Ctrl+N for a new window.
- Not doing: a "hide empty folders" toggle.

**v2 — the last planned phase** (scope capped 2026-10-08)

Organisation stops at four tools: folders, labels, groups, manual order. Nothing further is added there. Suggested build order: method (vision, anchor, export, nudge), then organisation (groups, manual order), then focus mode (break stopwatch, ▶ on a layer), then the sync pass.

- Vision statement (a text field on the project) and an **anchor** star on one layer, with the anchor pinned for comparison.
- In-app capture on Electron.
- Export screenshots in timeline order.
- Opt-in end-of-session "did something exist?" nudge.
- The sync pass (§7.6).
- **Flowtime break stopwatch** (decided 2026-10-08): in Flowtime, Pause becomes a break. While paused, the clock shows "On break · mm:ss" counting up, and Resume continues the same session, so there's no need to finish it to take a break. Display only: break time is not recorded or fed into take-a-break tracking. Derive it from the existing pause state, with no new persisted field if the pause start is already known.
- **Play on a layer** (decided 2026-10-08): a ▶ on hover, like task rows. It starts a focus session on a goal linked to the layer ("Work on: <layer title>"), reusing it while it's open and creating it otherwise. The session shows the layer and its screenshot, and time is tracked on that goal like any task. Layers get no time of their own (rejected: a new tracking target across time tracking, history and sync). Design point: store the link on the layer (e.g. `focusTaskId?`), not on Task (core model, plugin API). "Create goal + link" touches two entities, so it needs one meta-reducer action per AGENTS.md rule 3, or a shape that avoids the cross-entity write.
- **Manual order (up/down) inside a folder** (decided 2026-10-07), built with layer groups: each layer stores its own sort key (e.g. a fractional index, set on drag), never a list of ids on the folder (rule 13). **By folder** follows the manual order; **Timeline** stays strictly by date and remains the export order.
- **Layer groups** (requested 2026-10-06 after using v0): bundle related layers inside a folder. Placed after labels (v1) on purpose: "By label" may cover part of the need, and a group is a new persisted shape, so design it once we know which axis labels leave uncovered. Confirmed shape: like Photoshop / Clip Studio Paint layer groups — select several layers and bundle them into a named, collapsible group. Open: can groups nest, and can a layer be in only one group?

**v3+**

- Move a layer to another project.
- Merge projects (general app feature; layers ride along).
- Syncing screenshot blobs.
- Archive/compact old layers if lists still feel heavy.

**v3.1 — merge layers** (requested 2026-10-08, not started)

Select several layers and merge them into one layer whose screenshot is a grid of theirs. Placed in v3.1, not v3.2, because it is medium-sized and mostly reuses existing parts:

- **Selection:** the By folder multi-select from v2 step 2 (layers only; groups can't be merged).
- **Image:** compose the screenshots onto one canvas in display order, then save it through `LayerImageService` (WebP re-encode, thumbnail, orphan sweep). The canvas grid is the only new piece.
- **Ops:** one `addLayer` for the merged layer, then one `deleteLayer` per original, all single-entity, with no new action type and no model change. The add comes first, so a partial apply leaves duplicates, never a loss.

To decide at design time (mockup first):

1. Keep the originals or delete them (and their screenshot files) after merging? With delete, the confirm dialog is the only safety net, since layers have no undo.
2. Title (prefilled with the topmost layer's, editable?) and date: now, or the newest merged layer's date so the Timeline keeps its place?
3. Grid layout: columns = ceil(√n) with each screenshot fitted into equal cells, or a layout that respects aspect ratios? Background colour and gaps? A cap on how many layers (e.g. 9)?
4. Screenshots are device-local: a selected layer with no image on this device leaves an empty cell or is skipped. Warn before merging?
5. Folder, label, group and position come from the topmost selected layer?

**v3.1 — focus view changes** (requested 2026-10-08, not started)

- **Add a task from focus mode, in any mode** (Flowtime, Pomodoro, Countdown; before and during a session). It adds a goal/task to the focused goal's project without leaving focus mode or switching what is being worked on. Today the task switcher can create a task, but it uses the active work context (not necessarily the project) and switches focus to the new task, which interrupts the session. Likely shape: a small "+" next to the existing Add layer button that opens a one-line input, with one `addTask` op into the project (short syntax as usual). To decide: Layers projects only, or every project? Add to the top or the bottom of the list?
- **Remove the show/hide notes icon** (the `chat` button in focus mode, `show-notes-btn`). It also appears as an entry in the small-screen menu. To decide: remove both, which makes the notes panel unreachable from focus mode, and only for Layers projects or everywhere? Focus mode is a core screen shared by all projects.
- **Leaving focus mode keeps the session** (requested 2026-10-08). The user mainly uses focus mode to track time per project and per layer, so going back to the Layers view must not stop the timer. Today the back arrow (`exitToPlanning`) dispatches `cancelFocusSession`, which ends the session and stops tracking. Close (✕, top right) and Escape already do the non-destructive version: `hideFocusOverlay` keeps the session and tracking running, and the header focus button shows it and reopens it. Likely change: the back arrow hides the overlay the same way, so ending a session is left to the existing complete (`done_all`) button or pausing tracking. To decide: everywhere or Layers projects only, and whether a separate "end session" control is still needed.
- **Highlight the layer being worked on** (requested 2026-10-08). After leaving focus mode, the Layers view marks the layer whose goal is being tracked, so it's clear which layer the running session belongs to. Derived only, with no persisted field: the layer whose `focusTaskId` equals the current task (or the paused task during a break or pause). Shown as a "working on" marker on its row (like the running indicator on task rows) and in the preview header, with ▶ shown as active. Covers only layers started with ▶; a task focused another way has no layer to mark. To decide: when the layer is inside a collapsed group, mark the group (or expand it)? Should the marker also show in Timeline and By label, or only By folder? Should clicking the marker reopen focus mode?
- **Cancel a session and discard its time** (requested 2026-10-09). A forgotten session inflates the goal's time. Today the back arrow cancels the session, but the minutes already tracked stay on the task, because tracking writes time as it goes. With the back arrow becoming non-destructive (above), add an explicit **Cancel session** with a confirm ("Discard 1:42 tracked in this session?"). It ends the session and subtracts the session's tracked time from the goal, as one task time update. To decide: discard all of it, or "keep the first N minutes" (more useful when you only forgot to stop)? How to handle a session that crosses midnight (time is stored per day)? **Exists today:** Settings → Idle time tracking (currently off for this user) asks on return after ~5 min away whether to keep that time. It covers being away from the computer, not leaving the timer running while working on something else.
- **Less clutter from "Work on: X" goals** (requested 2026-10-09). Each ▶ creates a goal per layer in the project's task list (and the goals strip). Options:
  1. **Recommended: one collapsed parent per project.** Layer goals become subtasks of a single "Layers" task in the project. Per-layer time is kept (subtasks track their own time), the parent shows the total for the project, and the task list shows one row. It uses the existing subtask building block, with no new model field or tracking target. To decide: parent title; whether it may appear in Today; whether to fold existing "Work on:" tasks under it once.
  2. Hide layer goals from task lists and the goals strip by filtering out tasks some layer points at. Zero clutter, but it means changing core task-list selectors (hot path), and they would still show in Today, the planner and search.
  3. Layers get their own time, with no tasks at all. Rejected in v2 (a new tracking target across time tracking, history and sync).
- **Log a forgotten break in Flowtime** (requested 2026-10-10). When the user forgot to press pause, they enter the break length afterwards ("I took 15 min") and it is subtracted from the Flowtime clock and from the goal's tracked time. Today nothing covers this: the −1/+1 minute buttons only change a Countdown/Pomodoro target, are hidden in Flowtime, and never touch tracked time. Shares its core with **Cancel session** (subtract time from the goal), so build the two together. Likely shape: "Log a break…" next to Pause during a Flowtime session, a minutes field capped at the session's elapsed time, then one task time update plus a timer adjustment (the elapsed time feeds Flowtime's break-length rules, so those follow too). Display only, like the break stopwatch: the break itself isn't recorded anywhere. To decide: Flowtime only, or every mode? Also allow it after the session ends, on the session-done screen? Midnight crossing as for Cancel session.
- **Idle check only during focus sessions** (requested 2026-10-10). The user wants the idle prompt only while a focus session runs. Not available exactly today. Settings → Idle has two related switches: "Only trigger idle time dialog when the current task is selected" (asks only while a task is being tracked) and "Suppress idle dialog during focus mode sessions" (the opposite of this request). Since ▶ always tracks the layer's goal, the first switch already gives nearly this; the difference is that it also asks when a task is tracked outside focus mode. **First step: try that switch (with idle time tracking on).** If the gap matters, add the narrower rule. That would be a new optional field on the synced global idle config (`isOnlyOpenIdleDuringFocusMode?`, default false), plus one check in `idle.effects.ts` beside the existing focus check. Or better, replace the three switches with one "When to ask" choice, but that changes a shared settings model, which costs more (AGENTS.md: persisted config). To decide after trying the existing switch.

**v3.1 decisions (2026-10-10):** the focus-mode changes apply **everywhere**, not only in Layers projects. **Cancel session** discards all of the session's tracked time; Log a break covers partial cases. Layer goals go under **one "Layers" parent task per project**, and existing "Work on:" goals are moved under it once. The notes icon **and** the small-screen menu entry are removed from focus mode. Build order: (1) focus sessions: back arrow keeps the session, Cancel session, Log a break, highlight the focused layer; (2) focus view: add a task, remove notes; (3) goal parent; (4) merge layers, after a mockup. The idle change waits until the user has tried the existing switch.

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
- **O2. Decided (2026-10-06):** in Layers-enabled projects only, tasks are called "Goals/Tasks" (header toggle "Show goals/tasks", add-bar placeholder "A goal/task title…", goals strip heading). Everywhere else, including Today, Planner and focus mode, they stay "tasks". The same item can therefore carry both names depending on the view.
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
- **Added after v0, before v1 — Add layer dialog:** the inline add bar is replaced by an **Add layer** button next to **Add folder**. It opens a dialog with a name field and a folder picker, defaulting to the selected layer's folder (or "No folder").
- **Added after v0, before v1 — goals strip:** the Layers view shows the project's open goals/tasks above the add bar, with a done checkbox and nothing else, so it doesn't become a second task list. A Hide/Show button collapses it. It starts shown, and the choice is remembered per device in localStorage (`SUP_LAYERS_GOALS_STRIP_HIDDEN`), never synced.

## 13. v1 as built (2026-10-06)

- **Data:** `LayerLabel` slice (entity `LAYER_LABEL`, op codes `LLA`/`LLU`/`LLD`): `id`, `projectId`, `name`, `color` (a palette key), `mergedIntoId?`. It is typed optional in the model config, like `layer`. `Layer.labelId?` is new and optional. Deleting a project removes its labels in the same op.
- **Merge = alias** (§7.4): `merge` sets `mergedIntoId` on the source label, one single-entity op, and no layer is rewritten. `resolveLayerLabel` follows the chain. A missing link (target deleted) resolves to "no label". A cycle from concurrent merges stops at the starting label, and both labels stay visible in the manager.
- **Label look:** a left-edge colour strip on each row (Photoshop / Clip Studio Paint style) plus the osu!-style solid pill (`layer-label-pill`, the single place pills are styled). The palette is fixed (10 keys in `layer-label.util.ts`), so it can be retuned without touching data.
- **Layers view:** By folder / **By label** / Timeline (text-only buttons so three fit), label filter chips with counts, and name search. While searching or filtering, every hit shows (no "newest 8" cap) and empty groups hide. A label picker sits in the preview, and **Labels…** opens the manager. Group headers use the shared `task-section` heading style.
- **Label manager** (dialog): add (palette colour auto-picked), rename, recolour, merge into… (confirmed), delete (confirmed: "its N layers become unlabeled"), and a "used by N layers" count per label.
- **Add layer dialog:** gains a Label picker. From the Layers view, folder and label default to the selected layer's; from focus mode or the snack, to the project's newest layer's.
- **Focus mode:** an **Add layer** icon button (and an entry in the small-screen menu) while a session runs, shown only for Layers projects. `LayerService` is resolved on click, so focus mode takes on no new start-up dependencies.
- **Goal-done snack:** `LayerUiEffects.offerLayerOnGoalDone$` listens to `LOCAL_ACTIONS` only (remote and replayed completions never prompt). It fires for top-level goals in Layers projects, not for bulk "mark done", and shows "Done. Did something new come to exist?" with a **Name the layer** button that opens the dialog.
- **Verified:** Angular suite 16,871 passing (2 skipped, cold cache), layer specs 47, shared-schema 95, server validation spec 61. Every flow above was also exercised in the browser.

## 14. v1.1 as built (2026-10-08)

- **Screenshots:** a new `LayerImageService` handles screenshot storage (on top of `ClipboardImageService`).
  - Images over 1 MB are re-encoded to WebP at full resolution, kept only if smaller (GIFs are untouched). Measured: a 4.9 MB PNG screenshot was stored as 403 KB.
  - Each image gets a derived `<imageId>-thumb` WebP, at most 256 px. List rows load thumbnails and the preview loads the full image. Screenshots from v1 get their thumbnail generated on first view.
  - Decoded images sit in bounded LRU caches (120 thumbnails, 8 full images) that revoke what they evict.
- **Cleanup:** after a local project delete, `LayerUiEffects.deleteImagesOfDeletedProject$` deletes `layer-` files that no layer references and that are older than 60 s, so a screenshot being saved can't be caught. Remote deletes and app start never sweep. The clipboard-images manager neither lists nor deletes layer screenshots.
- **Duplicate:** the screenshot is copied to its own file first, then a single `addLayer` op adds the copy (" copy" suffix, same folder and label, new `createdAt`).
- **Folders:** reorder by dragging the title (CDK, same as the Tasks tab) or via Move up / Move down in a folder menu. Both use the existing `updateSectionOrder`. This is offered only in By folder and only while nothing is filtered.
- **Paste to create:** with no layer selected, a pasted image opens Add layer, previews the image and attaches it.
- **Preview:** click the full image to enlarge it (the shared `enlargeImg` directive).
- **Keyboard:** ↑/↓ move the selection through the rows on screen, Enter selects the name for renaming, and Delete/Backspace deletes (with confirm). Ignored while typing, inside dialogs, and on other buttons.
- **View memory:** the view mode is remembered per project in localStorage (`SUP_LAYERS_VIEW_MODE_BY_PROJECT`).
- **Shortcut:** `addNewLayer` in the keyboard config (optional key), defaulting to `Meta+N` on macOS and `Ctrl+N` elsewhere (the app's "Ctrl" is the physical Control key). It works in Layers projects, and its folder and label default to the Layers view's selection when that view is open (`registerSelectionDefaults`). `LayerService` is resolved lazily in the shortcut service.
- **Verified:** Angular suite 16,881 passing (cold cache), layer specs 57. Every flow above was also exercised in the browser, including a real mouse drag of a folder.

## 15. v2 step 1 (method) as built (2026-10-08)

- **Vision:** `Project.layerVision?` (free text, at most 2000 chars, enforced in the UI). A Vision card sits at the top of the Layers view: click the pencil to edit, and it saves on blur, silently. Long text is clamped to 5 lines.
- **Anchor:** `Project.layerAnchorId?`, a single pointer on the project, so changing the anchor is one project update. A dangling id means no anchor. Toggle it with the ★ in the preview. The anchor shows in the Vision card (click to select it) and as a ★ on its row.
- **Compare:** with a non-anchor layer selected and an anchor that has a screenshot, **Compare with anchor** shows both full images side by side.
- **Export:** `LayerExportService` plus an in-repo store-only ZIP writer (`zip-store.util.ts`, CRC-32, UTF-8 names, no new dependency). It exports this device's screenshots oldest-first as `NNN YYYY-MM-DD <title>.<ext>`, with an `index.md` listing every layer (folder, label, title, file). Downloaded via a blob link; Electron shows its default save dialog. With no screenshots on the device it shows a snack instead.
- **Session nudge:** `Project.isLayerSessionNudgeEnabled?`, off by default, in project settings under Layers ("Ask after focus sessions"). `LayerUiEffects.offerLayerAfterFocusSession$` (`LOCAL_ACTIONS`, `completeFocusSession`) reads the focused goal, or the paused one as a fallback, and offers **Name the layer**.
- **Verified:** Angular suite 16,889 passing (cold cache), layer specs 65; the ZIP is read back and CRC-checked in tests. Every flow above was also exercised in the browser.

## 16. v2 step 2 (groups and manual order) as built (2026-10-08)

- **Model:** a new `LayerGroup` slice (`LAYER_GROUP`, feature `layerGroup`): `{ id, projectId, sectionId?, parentGroupId?, name, createdAt, sortKey? }`. `Layer` gains optional `groupId?` and `sortKey?`. Membership is stored on the child (the layer's `groupId`, the group's `parentGroupId`), so there are no id lists to conflict. Actions are `[LayerGroup] Add/Update/Delete LayerGroup` (codes `LGA`/`LGU`/`LGD`). The reducer trims the name, keeps `id`/`projectId`/`createdAt` immutable, refuses self-parenting and cascades on project delete.
- **Read-time healing:** `buildGroupIndex` drops a missing parent or breaks a cycle by making the group top level. A nested group's folder is its root's folder, and a layer whose group is gone shows loose in its folder. So any partially applied or concurrent edit still renders as a valid tree, and nothing is hidden.
- **Nesting:** at most 3 levels (`MAX_LAYER_GROUP_DEPTH`), counting the height of any groups being wrapped. Groups live inside one folder, and grouping needs siblings of one container. In both cases the selection bar shows a hint instead of a popup.
- **Grouping:** click to select, Cmd/Ctrl-click to toggle, Shift-click for a range, then **Group** and a name. That is one `addLayerGroup` (placed at the first item's position) plus one update per child. **Ungroup** moves the children up one level, then deletes the group. Rename via the group ⋮ menu or by double-clicking the name. Collapse with the chevron (view-only, not persisted).
- **Manual order:** fractional base-36 `sortKey`s (`sort-key.util.ts`). Unkeyed siblings show newest first, above keyed ones. A container stays in date order until its first drag, which keys every sibling once; after that a move is one update of the moved item. New layers and duplicates in a keyed container get a key above the first sibling (`topKeyFor`), which re-spreads keys when they grow past 12 characters. Moving a layer to another folder clears its `groupId`.
- **Where it shows:** the tree, drag and multi-select are only in By folder with no search or label filter. Timeline, By label and search stay flat.
- **Sync shape:** every change is a loop of single-entity ops followed by a persistence yield (rule 6); there is no cross-entity write. A partial apply leaves a valid but less organised tree. The official sync server does not accept `LAYER_GROUP` yet (same as `LAYER`/`LAYER_LABEL`); that is step 4.
- **Verified:** Angular suite 16,905 passing (cold cache), layer specs 81, shared-schema 95, server validation spec 61. In the browser: grouping, 3-level nesting with the 4th refused, mixed-container hint, real-mouse drag inside a nested group, rename, collapse, ungroup, new layer on top of a keyed folder, and flat Timeline / By label / search.

## 17. v2 step 3 (focus mode) as built (2026-10-08)

- **Flowtime break stopwatch:** in Flowtime, while a session is paused, the clock face shows "On break · m:ss", counting up from the pause, in the slot Pomodoro uses for its cycle counter. Resume continues the same session. It is component state only (`isFlowtimeBreak`, `breakElapsed`): nothing is stored, tracked or synced, and closing the overlay resets it. Countdown and Pomodoro are unchanged.
- **▶ on a layer:** a play button on each row (shown on hover or keyboard focus) and in the preview header. `LayerFocusService.workOn` reuses the goal in `Layer.focusTaskId?` while it is open. When the goal is done, archived or missing, it creates "Work on: <title>" in the layer's project (short syntax off, so `#`/`@` in a title stay text) and points the layer at it. It then makes the goal current and opens focus mode. If focus mode is off in app features, ▶ only starts tracking, like the existing task "Focus" entry.
- **In focus mode:** when the focused goal is a layer's goal, its screenshot thumbnail and title show under the goal (`linkedLayer`, derived by scanning layers for `focusTaskId`, only for Layers projects).
- **Sync shape:** "create goal + link" is two single-entity ops (`addTask`, then `updateLayer`), not a meta-reducer. Either one alone is valid state: a plain goal in the project, or a dangling link that the next ▶ replaces. The step 4 sync pass reviews this against AGENTS.md rule 3. The other path is a combined action, which would need its own conflict resolution and E2E (rule 14).
- **Verified:** Angular suite 16,909 passing (cold cache), `LayerFocusService` specs 4. In the browser: first ▶ creates and links the goal, a second ▶ reuses it, the linked layer card shows its thumbnail, the overlay is skipped with focus mode off, and Flowtime pause / break counter / resume works on the same session.

## 18. Anchor disabled (2026-10-08)

After trying it, the user won't use the anchor, so its UI is commented out in `layers-view.component.{html,ts,scss}`. Each disabled block is marked "ANCHOR (disabled 2026-10-08, kept to restore later)". The parts disabled are the anchor row in the Vision card, the ★ toggle in the preview, the ★ on rows, and **Compare with anchor**, which needs an anchor. `Project.layerAnchorId?` stays in the model, so existing data still validates and the feature can come back by uncommenting. Nothing reads it now. Vision, export and the session nudge are unchanged.

## 19. v3: move a layer to another project, as built (2026-10-08)

- **UI:** a "Move to project" button in the preview header opens a menu of the other unarchived, visible projects that have Layers on. If there are none, it says so. After a move the selection clears and a snack says "Moved to <project>".
- **Op:** a dedicated `moveLayerToProject` action (`[Layer] Move Layer To Project`, code `LYM`, one LAYER update op). `updateLayer` still can't change `projectId`, so ordinary edits keep that invariant. The reducer sets `projectId` and `labelId`, and clears `sectionId`, `groupId`, `sortKey` and `focusTaskId`, since folder, group, order and goal all belong to the old project. The layer lands unfiled, in date order. `createdAt`, title and screenshot are kept, and the image id is device-wide, so the file needs no copy.
- **Label:** the layer's effective label (merges followed) carries over by name, case-insensitively. It uses the target's label with that name, or creates one with the same colour. That makes at most two single-entity ops (add label, move), and either one alone is valid state.
- **Verified:** reducer, service and op-log specs (5,128 in `layer` + `op-log`); in the browser, a layer labelled "UI" moved to another project, which got its own "UI" label.

## 20. v3.1 step 1 (focus sessions) as built (2026-10-10)

- **Back arrow keeps the session:** on the focus and break screens the back arrow now dispatches `hideFocusOverlay`, like ✕ and Escape, instead of `cancelFocusSession`. The session and tracking keep running, and the header focus button or ▶ brings the overlay back. New tooltip: "Back (the session keeps running)". The session-done screen's "Back to Planning" button is unchanged.
- **Cancel session:** a `timer_off` button during a session (in the ⋮ menu on small screens). A confirm names the exact amount ("discard the 22s it tracked on …"). It then dispatches `cancelFocusSession`, which stops tracking and flushes pending time, and `FocusSessionTimeService.discard(goal, elapsed)` takes the session's elapsed work time off the goal. That uses the generic `TaskService.removeTimeSpent` op, which flushes pending batched time first, so a replay can't add the minutes back. It takes from today first, then yesterday (a session crossing midnight), and never goes below zero. Time tracked between ▶ and pressing Start (auto-start off) isn't part of the session and stays.
- **Log a break (Flowtime):** a `free_breakfast` button during a Flowtime session asks "How long was the break?" in minutes. It is capped at the session's elapsed time. A local, non-persisted `logFlowtimeBreak` action moves the clock back (elapsed and `startedAt` together while running), and `discard` takes the same amount off the goal.
- **Focused layer highlight:** `focusedLayerId` is the layer whose `focusTaskId` is the current task, or the task focus mode paused (pause or break). Derived only. Its row gets a `timer` icon and a tint, its ▶ stays visible and active, and a collapsed group around it shows the icon. It works in every view. ▶ on that layer ("Back to focus mode") only reopens the overlay: it no longer calls `setCurrentId`, which would resume a paused session.
- **Sync:** no new persisted field or op type. The only synced write is the existing `removeTimeSpent`.
- **Verified:** Angular suite 16,927 passing; new specs for `FocusSessionTimeService`, `logFlowtimeBreak`, the component's cancel and log-break, and `LayerFocusService`'s reopen. In the browser: back arrow → overlay hidden, session running, layer highlighted; ▶ reopened it untouched; Cancel removed exactly the stated 22 s; Log a break moved the clock and the goal's time back by the same amount.
