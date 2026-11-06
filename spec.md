# Framebag Pattern Tool — Specification v1.0 (as built)

Working title. A minimal tool, run in the browser from a folder or from GitHub Pages (v1.0 for GitHub), to trace a framebag side panel from a scaled photo, design the bag (seam allowance, gusset, notches, straps and bolt holes, a split or clip line, v1.0), and print it at true size with a cut list: tiled on A4 or Letter, or on large sheets up to A0 or Arch E (v0.7).

**Changes made while building v0.1**

- Target browser is **Firefox** on macOS Catalina; Safari and Chrome are not targets.
- The PDF is written by a small module of our own (`js/pdfwriter.js`) instead of jsPDF, so the tool has no third-party code at all.
- Assembly uses a **trim line and a placement line** (§7.2): each page is cut along its left/top edge and laid on the neighbour's placement line; registration marks sit on that line so their halves meet.
- A plain mouse wheel zooms at the cursor (trackpad scrolling still pans).
- The Outline section also shows the cut-piece area.

**Changes in v0.1.1**

- Right-click (or Ctrl+click) on a point opens a menu with **Delete point**; on an edge, **Add point**. The Corner section has a **Delete point** button.
- The **Image**, **Scale** and **Display** sections moved out of the panel into a CAD-style bar at the bottom (§5.1, §5.6). The panel keeps Outline, Corner, Seam allowance and Print.
- A **Photo** toggle shows or hides the photo. Loading or replacing the photo is in the top bar.

**Changes in v0.2**

- Curved edges as circular arcs through a round handle, and *Curve through* (replaced in v0.3, see below).
- **Fixed panel, no scrolling** (§5.6): 01 Seam allowance, 02 Offset (uniform, plus a dropdown to give one edge its own offset), 03 the selected point or edge, 04 Pattern summary. The edge table is gone; the PDF overview keeps it.
- **Print settings** moved behind a gear button next to Export PDF (§5.1), with *Reset to defaults*. Export PDF stays clickable while blocked and says why.
- **Reset scale** next to the scale in the status bar, and on the scale line's right-click menu.

**Changes in v0.3**

- **Smooth points replace curve handles and *Curve through*.** v0.2's arcs through three points fixed their end directions independently of their neighbours, so the outline kinked where a curve met the next edge or the next curve. Now every point is a **corner** or **smooth** (§4.1, §6.1): at a smooth point the outline keeps one direction, with no kink, and stays smooth through the offsets, the rounded corners and the seam allowance. Curves are still circular arcs, so all offsets stay exact.
- A segment next to a smooth point can be **kept straight**; the curve then leaves it tangentially (a straight tube that bends).
- **Edges run from corner to corner** over any smooth points. The Edge dropdown, the specific offsets, the edge lengths on the canvas and in the PDF, and the selection all refer to these edges, so a curved tube traced with several points is one edge with one offset.
- Trace: hold **⌥ (Alt)** while placing for a smooth point; a point added on a curve is smooth.
- Project files are format version 2. Version 1 files (v0.1–v0.2) open as before; each curve handle becomes a smooth point at the handle's spot, which gives exactly the same curve. The letters of the points after it move on by one.

---

## v1.0 for GitHub (as built)

Prepared 6 Nov 2026 (`framebag-pattern-v1.0-github.zip`) to publish the tool from a GitHub repository, `framebag-pattern`, on GitHub Pages, and to download it from there. Still v1.0: file format version 2, no change to the project data.

### A. Hosting

- The repository's top folder is the site: GitHub Pages publishes branch `main`, folder `/ (root)`, at `https://<username>.github.io/framebag-pattern/`. An empty `.nojekyll` there turns off GitHub's Jekyll build, so the files are served exactly as they are.
- The same files run from a downloaded folder (`file://`) as before; nothing depends on being online.
- **Version tags:** the stylesheet and the scripts in `index.html` are loaded as `…?v=1.0`. A new release raises the number, so a browser holding cached files (GitHub Pages lets browsers keep them about 10 minutes) loads the new ones with the new page instead of mixing the two. `tests/geometry.html` loads its scripts without tags.
- Autosave, units and display settings are kept per address: the online version and each downloaded copy have their own.

### B. Keeping the autosave

- `FB.project.persistStorage()`: `navigator.storage.persisted()`, else `persist()`; resolves to `'kept'`, `'refused'` or `'unsupported'`, never rejects.
- Asked once a visit, never on load: after the first autosave that stores work (anything but `'none'`), on the next `pointerup` or `keyup` (capturing, on the window), so the request comes with a gesture. Chrome and Edge decide silently by their own rules; Firefox asks the person ("store data in persistent storage").
- A refusal is remembered in `localStorage` (`framebag-pattern.persist-refused`, its time) and not asked again for 30 days; a grant clears it.
- Nothing else changes in autosave: one slot, the restore bar, files by Save and Open. Saving into the same file (Chrome, Edge), several recent projects and a reminder to save are left for later.

### C. PDF

- **Overview, Settings:** the *Resolution* line (1 px = … mm) is gone; the reference length stays.
- **Overview, under the edges:** a last line, *Total area, all pieces*: the cut list's total.
- **Cut list:** the table is *Piece, Qty, Size, Area*. Each row's area is all its pieces (a side panel or a part counts twice), in m² to three decimals or ft² to two, seam allowance included; straps and bolt holes have none. Then, under a thin grey rule, **Total** in bold, with "All the pieces above[, except the straps]. Add extra for laying them out on the fabric." The subtitle reads "Every size and area includes the 10.0 mm seam allowance."
- `FB.pdf.cutAreas(d)` gives `{ panel: [mm² for each piece of the side panel], strip, total }`, with total = 2 × Σ panel + strip, and the strip = cut length × cut width.
- `FB.units.areaNum` and `FB.units.areaUnit` give the number and the unit apart; `FB.units.area` is unchanged.
- The ² is drawn as a small raised 2 (`textSup` in `pdf.js`): some stand-ins for Helvetica (TeX Gyre Heros, on some Linux systems) name that glyph `two.superior`, and viewers using them leave it out.

### D. Logo

- `img/logo.png` is shown 24 px high at its own width (`height="24"` and no `width`), so a logo of any proportions fits. `img/logo-tab.png` is the browser tab's icon.
- If `img/logo.png` is missing, the File button reads **File** (`#logo-text`) instead of showing a broken image.
- The README explains how to make and replace both files, and that deleting `logo.png` leaves **File**.

### E. Small screens

- Below 900 × 500 px (`@media (max-width: 899px), (max-height: 499px)`) a notice covers the page: "Made for a computer", the 1280 × 700 window the tool needs, a mouse or trackpad and a keyboard, and **Continue anyway**, which lifts it for the browser session (`sessionStorage` key `framebag-pattern.small-ok`; class `small-ok` on `<html>`).

### F. Licence and README

- `LICENSE`: the MIT License, word for word so GitHub recognises it, "Copyright (c) 2026 Matteo Garbellini".
- The logo files are not covered: © 2026 Matteo Garbellini, all rights reserved. Said in the README's *Licence* section and in `img/README.md`, next to the files.
- README: at the top, links to the online version and to the download (`https://github.com/<username>/framebag-pattern/archive/refs/heads/main.zip`, the latest `main`; earlier versions under Releases), with `YOUR-USERNAME` until the account is known. New sections: *Use it online* (GitHub logs visitors' IP addresses; Firefox's question about persistent storage), *Download your own copy* (open, update, separate autosaves), *Tools at a glance*, *Replace the logo with your own*, *Your own online version* (fork and turn on Pages), *Licence*. Updated: the cut list's areas, autosave, the version tags under *For development*.

### G. Where the changes go

- `index.html`: `?v=1.0` on the stylesheet and the scripts; the logo without `width`, and `#logo-text`; the small-screen notice.
- `css/style.css`: `.logo-text`; the small-screen notice.
- `js/app.js`: the request to keep the storage; the missing logo; the small-screen notice.
- `js/project.js`: `persistStorage`.
- `js/units.js`: `areaNum`, `areaUnit`.
- `js/pdf.js`: no Resolution line; `cutAreas`; the total area on the overview; the Area column and the Total row in the cut list; `textSup`.
- `tests/`: the cut list's areas (a whole panel, a split one, m² and ft²): 70 tests. `geometry.html` also loads `pdfwriter.js` and `pdf.js`.
- `README.md`, `LICENSE`, `img/README.md`, this section.

### H. Acceptance criteria added

18. Works online from `https://` (GitHub Pages) in Firefox, Chrome and Edge, as it does from `file://`.
19. The cut list's total area is twice the side panel's cut area (each part's, when split) plus the gusset strip's cut length × cut width (verified in `tests/geometry.html`).

---

## Changes in v1.0 (as built)

Built 5–6 Nov 2026 (`framebag-pattern-v1.0.zip`), in two rounds: first the two steps, notches and the gusset; then, after review, points on the stitch line (notches, straps, bolt holes, the join anywhere), the split/clip line, the cut list, one gusset strip only and the units switch. File format stays version 2, with a new optional field `design`; v0.7 opens v1.0 files without it, and files from the first round open with no marks and no split line. Where §1–§12 below still describe older behaviour, the v0.4–v1.0 sections are the current one.

### A. Two steps: 01 Trace and 02 Design

- **Top bar:** a centred selector, **01 Trace | 02 Design**, numbered like the panel's sections: the current step in red with a 2 px red underline, the numbers grey. 01 Trace is the default. Buttons with `aria-pressed`; `D` opens 02 Design; each tab's title says what the step holds.
- `FB.editor.setMode('trace' | 'design')`, `getMode()`; bus event `mode`; `<html data-mode>`; stage class `mode-design`.
- **01 Trace** works as before: photo, scale, outline, offsets, corners, names. Its panel: 01 Offset, 02 Selection (point or edge), 03 Outline (finished perimeter, finished size). A seam allowance error is also shown under 03 Outline, with "Change it in 02 Design."
- **02 Design** tools: Select, Split (`K`) and Measure (`DESIGN_TOOLS`); the command line hides Trace and Guide, and shows Split only here. A trace tool (`T`, `P`, `G`, `S`, the Scale button, Level photo, Clear outline) goes back to 01 Trace; `K` comes to 02 Design. The 01 Trace tab brings back the tool last used there. Loading a photo, opening a project and New project start in 01 Trace.
- In 02 Design the outline stays as traced: nothing on it can be moved, inserted, deleted, closed or cycled. What 02 Design adds sits on the stitch line.
- **Canvas in 02 Design:** traced outline, and for each piece of the side panel its stitch line and cut line (with their toggles); the part of the outline a clip leaves out, faint (grey, dotted); the notches (black, 1.5 px); straps and bolt holes; corner letters outside the cut line (split junctions grey); each run's name and length along the stitch line, half way along it (left out when the run is under 60 screen px); a split line keeping both pieces gets its length beside it. Points, angles, guides and previews are not drawn; the *Angles* and *Guides* toggles are disabled, titled "Shown in 01 Trace". The loupe shows the pieces and their notches.
- **Not ready** (no closed, scaled outline): the panel is dimmed under "Finish 01 Trace first: close the outline and set the scale."; its settings can still be changed.
- **Selection** (`dsel`, separate from 01 Trace's): a run, with the spot clicked on it; a mark; the join; or the split line. An edge selected in one step is selected in the other.

### B. Select shows the arrow

- With the Select tool the canvas pointer is the normal arrow (`cursor: default`) and no crosshair is drawn. Space and the middle button still pan with the hand.

### C. The design data

```
design: {
  gusset:  { width: 60, join: null | point index | [x, y] },
  notches: { corners: true, spacing: null | mm },
  marks:   [ { kind: 'notch', at: [x, y] },
             { kind: 'strap', at: [x, y], width: mm },
             { kind: 'bolts', at: [x, y], count: 1–3, spacing: mm } ],
  strapWidth: mm,
  split:   null | { p1: [x, y], p2: [x, y], keep: 'both' | 'left' | 'right' }
}
```

- Positions are image px, like the guides: marks stay on the frame when offsets, radii or the scale change, and turn with the photo when it is levelled. Each is projected onto the stitch line when derived.
- `join`: a corner's point index (it follows the corner's rounding), a spot on the stitch line, or null for the first corner. Inserting or deleting points keeps an index on its point; deleting that point clears it.
- `split.keep`: the side of the line through p1 and p2, seen from p1 towards p2 ('left': cross(p2 − p1, q − p1) > 0); 'both' keeps both pieces.
- New projects: width 60 mm (2 1/2 in), join at the first corner, corner notches on, none between, no marks (straps 25 mm, 1 in, to start), no split line.
- On opening: width 5–500 mm; `join` an integer point index or two finite numbers, else null; `corners` false only if false; `spacing` 10–2000 mm or null; at most 200 marks, unknown kinds and marks without a position dropped, strap width 5–200 mm, holes 1–3, spacing 10–500 mm (64 when missing); a split line needs two distinct points. The first round's `pieces` ('edges') is ignored: the gusset is always one strip.
- *Clear outline* clears the join, the marks and the split line. The seam allowance is still `project.seamAllowance`.

### D. Geometry (`js/design.js`, `FB.geom.designGeometry`, as `d.design`)

- Positions are arc lengths `s` along a closed **chain** of lines and arcs, in the direction the outline was traced; `chainAt`, `chainPart`, `nearestOn` (the nearest point and its `s`).
- **Stations**, where the corner notches go: the middle of each corner's rounding arc, or the corner's vertex where the stitch line turns sharply. Smooth points have none.
- **Split line:** the infinite line through p1 and p2 crosses the stitch line; the two crossings either side of the middle of p1–p2 are its ends, the one nearer p1 first. An end within 0.5 mm of a corner's station along the stitch line (`CORNER_SNAP`) is that corner: moved onto it, with its letter and point index, a corner of each piece, and no second station there. Other ends are lettered after the last point (`pointLabel(n)`, then `pointLabel(n + 1)`: E and F on four corners). Fewer than two crossings: no split, and the message "The split line does not cross the outline…". The two pieces: the stitch line from one end to the other, closed by the straight line back.
- **The bag** (what the gusset goes round): the whole stitch line, with the split ends as extra stations ('split') when both pieces are kept; or, for a clip, the kept piece, its split ends sharp corners ('clip').
- **Runs** go from station to station along the bag; each has a name ("B–E"), a title (its edge's name, else the name), its length, and whether it is a whole traced edge.
- A **notch** runs from the stitch line out along the outward normal to the cut line (a ray against the flattened cut line of the piece it is on): the seam allowance along an edge or round a rounded corner, further at a sharp corner, where the cut line is mitred (10 mm becomes 14.1 mm at 90°). Drawn at least 3 mm (`NOTCH_MIN`).
- **Notches:** at every station when *At every corner* is on (split junctions always); between stations, each run in k = max(1, round(length / spacing)) equal parts; and each notch mark.
- **Marks:** projected onto the whole stitch line, then onto the bag; on a part a clip leaves out, hidden. Straps have a centre and a width; bolt holes `count` holes `spacing` apart, centred on the mark.
- **Join:** a corner's station; or a spot (within 0.5 mm of a station: that station); missing or clipped off: the first station. A **double notch** there: two notches `NOTCH_PAIR` = 4 mm apart along the stitch line, each square to it, instead of a station's single one.
- **Gusset:** one strip, `cutLen` = bag length + 2 × seam allowance, `cutWidth` = width + 2 × seam allowance; its marks at `t` = seam allowance + (`s` − `s` of the join) from its left end, the join's station again at the far end; its straps and bolt holes (`mounts`) by their centres; each run's stretch of it (`parts`; a run holding a join between corners is in two).
- **Pieces of the side panel:** the whole panel; the kept piece of a clip; or the two pieces of a split, each with its own cut line (`seamOffset`) and stations (its corners inside, and its two split ends), runs and notches, the marks and the join mapped onto it. A piece whose seam allowance does not fit blocks the export: "The seam allowance does not fit along the split line…".
- `counts = { corners, split, between, marks }`.

### E. Panel: 02 Design

- **01 Seam allowance:** *Width* (titled: added outside the stitch line, on the side panels and on the gusset); *Side panel, cut* W × H, or *Side panel, cut in 2* with both sizes; messages about the pieces.
- **02 Gusset:** *Width*, "finished, seam to seam"; *Ends meet at*: Corner A…, the split ends ("Split line, E"), and "On <edge>" when the join is between corners; the drawing; "Strip, cut 1411.7 × 80.0 mm", titled with how the length and width are made up (the seam allowance at both ends).
- **The drawing** (SVG, the panel's width, to the strip's length): a 12 px bar notched into both long edges (stations 40 % of its height deep, others 25 %), the letters under their notches (one closer than 10 px to the last is left out), straps as grey bands to scale, bolt holes as dots on its middle. Each run's part takes a click (selects that edge; shaded under the pointer, drawn with a 2 px outline when selected, as on the canvas); a strap or a hole selects its mark (red when selected).
- **03 Notches:** *At every corner*, with the count on the right; *Between corners*, its small text "evenly: 15 in all" once there are some (empty: none).
- **04 Selection:** "Click the stitch line to add a notch, a strap or bolt holes there. Split (K) draws a line across the panel." when nothing is selected. An edge: its title and *Length* (notch to notch), then **+ Notch**, **+ Strap**, **+ Bolt holes**, **Ends meet here** at the spot clicked (a red circle on the canvas; off along a clip line). A mark or the join: *From <corner>* (editable, with the distance to the next corner under it), a strap's *Width*, bolt holes' *Holes* "2 × 64.0 mm"; *Delete*. The split line: *Keep* (Both pieces, Piece with B, C, D…), *Length*, *Delete split line*.
- The Design panel fits a 1280 × 700 window in every state.

### F. On the canvas: marks and the split line

- **Select** in 02 Design: a click selects, in this order, an end of the selected split line, a mark (the last placed on top), the double notch, the split line, an edge's run (with the spot). Dragging a mark or the double notch slides it along the stitch line (the double notch snaps to corners within 10 px); dragging an end of the split line slides it along the outline. The command line says where: "Strap: 120.0 mm from B, 331.6 mm to C."
- **Arrow keys** move the selected mark or the join 1 mm along the stitch line (Shift: 10 mm); **Delete** removes the selected mark or split line; **Esc** clears the selection.
- **Right-click:** on the stitch line, *Add notch / strap / bolt holes here* and *Ends meet here*; on a mark, *Delete …*; on the split line, *Delete split line*.
- **Split** (`K`): drag across the panel. While dragging, the line through the two ends is drawn faintly across the canvas (red, dash-dot, like a new guide) and the cut it makes in red, 2 px, from one crossing of the stitch line to the other, with end ticks and its length; the command line gives the length, or asks to draw across the outline. Each end snaps within 10 px: to a corner of the whole stitch line (a square, 12 px, "Snap: corner B", the corner's letter red), else onto the stitch line (a circle, "on the stitch line"); ⌘ or the Snap toggle places freely. Shift, as with the Guide tool, keeps the line horizontal or vertical from the first end, and then it only snaps where that line crosses the stitch line (×, "intersection"); pressing or releasing Shift while dragging applies at once. A new line replaces the old one, keeps both pieces and is selected; the tool goes back to Select. The Split tool snaps from hovering, before the press.
- **Dragging an end** of the selected split line keeps it on the stitch line; it snaps to corners (□); with Shift it goes to the crossing, nearest the pointer, of the horizontal or vertical line through the other end with the stitch line (×).
- **Drawn:** notch marks as notches (red when selected); straps as a band across the tube, as wide as the strap, from the stitch line out past the cut line (grey, red when selected); bolt holes as circles with a cross (red when selected); the selected split line heavier, with square handles at its ends.

### G. PDF

- `VERSION = 'v1.0'`.
- **Pieces:** the side panel is printed as its pieces: the whole panel; the kept piece of a clip; or the two parts of a split, the second moved across the split line by 2 × seam allowance + 15 mm, clear of the first. The layout plans all pieces (`planLayout` takes several cut lines). Each piece: traced outline (for a part, the traced outline on its side of the split line), stitch and cut lines, notches (0.3 mm, from the stitch line to the cut line), letters, edge lengths (a whole traced edge by its finished length as before, a part of one by its length notch to notch) and a pattern label, with "Part 1 of 2" under the piece's name.
- **Overview:** the pieces in the drawing with their notches (0.2 mm); under the edges, the stitch line all round and each piece's size; settings *Gusset* ("One strip, 60.0 mm wide"), *Notches* ("4 at corners, 2 at the split line, 15 between, double at G"), *On the stitch line* ("2 straps, 2 bolt holes, 1 notch"), *Split line* ("E–F, 370.3 mm: clipped, the piece with B, C, D kept", or "two pieces"); in *Lines*, "Notch: snip into the seam allowance" and "Double notch: where the gusset’s ends meet", full size.
- **Cut list** (the page after the overview, on its paper): title, "Every size includes the 10.0 mm seam allowance."; a table *Piece, Qty, Size*, with a grey note: the side panel or each part ×2, "One as printed, one turned over: drive and non-drive side."; the gusset strip ×1; straps by width; bolt holes. Then the **gusset strip**: "Ends meet at A" (or on which edge, how far from its corner); a drawing across the page, to scale unless very thin (8–14 mm high), its cut outline with the stitch line dashed inside it (the seam allowance along both edges and at both ends), notches into both long edges with the letters under them, straps as grey bands and bolt holes as circles; *Notches, from the left end* (letter in bold or a grey dot, and the distance; up to 6 columns of 31.7 mm, 4 rows each until all 6 are used); *Straps and bolt holes, centres from the left end* (3 columns). Last, *Cutting and sewing*, in steps. A block that does not fit goes on a page *Cut list, continued*.
- Print settings: "5 pages + overview, cut list"; the export message: "… plus the overview and the cut list."

### H. Units: one switch

- The logo menu's two items *Millimetres* and *Inches* became one row: **Units** with a **mm | in** switch (the chosen half filled black; `menuitemradio`, `aria-checked`), grouped with *Full screen*. The menu stays open after a switch, so the change shows.

### I. Where the changes go

- `index.html`: the step selector; the panel split into `#panel-trace` and `#panel-design` (with 04 Selection); the Split tool; the units switch; `js/design.js`.
- `css/style.css`: the selector, the arrow for Select, notches, marks, the spot, the clipped part, the gusset drawing, the units switch, the tools per step.
- `js/design.js` (new): chains, stations, the split line and its pieces, runs, notches, marks, the join, the gusset; `NOTCH_PAIR`, `NOTCH_MIN`, `CORNER_SNAP`; `d.design.corners`, the whole stitch line's corners, for snapping.
- `js/geometry.js`: `d.finishedSize`; design errors in `d.errors` and the export blocker; `planLayout` with several cut lines.
- `js/units.js`, `js/state.js`, `js/project.js`: the design data, its defaults and its checks on opening.
- `js/editor.js`: the steps and their tools, the design selection, hit-testing, dragging along the line, the Split tool, the right-click menu, arrow keys and Delete in 02 Design, drawing.
- `js/inspector.js`: the two panels, the gusset drawing, 04 Selection.
- `js/statusbar.js`: *Angles* and *Guides* disabled in 02 Design.
- `js/app.js`: the selector, `D`, `K`, levelling turns the marks and the split line, Clear outline.
- `js/pdf.js`, `js/printsettings.js`: pieces, notches, the cut list page, settings, legend, page count.
- `tests/`: stations and runs, notches between corners, notch length to the cut line, the double notch, the gusset matching the side panel, the join between corners, marks, split, clip, a split line from a corner, a split line missing the outline, a curved frame, saving and opening: 69 tests.
- README.

### J. Acceptance criteria added

14. The marks on the gusset match the side panel's notches: the distance between two marks equals the length of stitch line between the two notches (verified in `tests/geometry.html`).
15. 02 Design cannot change the traced outline; switching steps changes nothing in the project.
16. A strap or bolt hole placed on the photo stays at that spot on the frame when offsets or corner radii change.
17. A clip keeps one piece with its own seam allowance along the clip line; a split prints two parts that do not overlap.

---

## Changes in v0.7 (as built)

Built 5 Nov 2026 (`framebag-pattern-v0.7.zip`). File format stays version 2, with new optional fields `outline.edgeNames`, `print.paper`, `print.showLabel` and `label`; v0.6 opens v0.7 files without them. Targets: **Firefox, Chrome and Edge, on macOS, Windows and Linux**; the Mac with ⌘ stays the primary platform.

### A. Mac, Windows and Linux (`js/platform.js`)

- **Detection:** `navigator.userAgentData.platform` (Chrome, Edge) or `navigator.platform` (Firefox, Safari). A Mac or iOS name gives `mac`, otherwise `windows` or `linux`; `<html data-os>` is set.
- **Primary modifier** `FB.platform.mod(e)`: `metaKey` on a Mac, `ctrlKey` elsewhere. It places freely (no snapping). Keyboard shortcuts accept either modifier as before; `Ctrl+Y` redoes too.
- **Ctrl+click** opens the right-click menu only on a Mac; on Windows and Linux it places freely.
- Pressing or releasing the modifier lets go of or takes up a snap at once, while hovering or dragging, as Shift and ⌥ do.
- **Alt** on Windows and Linux: its keydown and keyup are prevented while the pointer is over the canvas or a drag is on, so the browser's menu does not open.
- **Key names:** texts are written with Mac symbols; `FB.platform.keys()` turns them into Ctrl/Alt names (`⌘Z` → `Ctrl+Z`, `⇧⌘Z` → `Ctrl+Y`, `⌥` → `Alt`) for hints and toasts, and at start for every `title` and `kbd` in the page.
- **Mouse wheel in Chrome and Edge:** they report mouse wheels and trackpads in pixels (`deltaMode` 0), so v0.6 panned on a mouse wheel there. A mouse notch is now recognised by `wheelDeltaY` in steps of 120 that is not −3 × `deltaY` (what macOS trackpads report) and has no `deltaX`; notches = `wheelDeltaY` / 120, zoom 1.2 per notch, with or without a modifier. Firefox keeps `deltaMode` (lines = mouse).
- **Messages** name no browser ("This browser can’t read this image", "The browser did not allow full screen"). A `.heic`/`.heif` photo that cannot be read gets its own message: HEIC opens only in Safari; export it as JPEG, or set the iPhone to Camera → Formats → Most Compatible.
- Tested in Chromium with the platform set to Mac and to Windows: key names, shortcuts, free placement, wheel cases, the whole flow and the PDFs. Real Windows and Edge still to be checked by hand.

### B. Millimetres or inches (`js/units.js`)

- **Logo menu:** *Millimetres* and *Inches*, between the photo items and *Full screen* (`menuitemradio`, the chosen one ticked ✓); choosing one closes the menu. Remembered in `localStorage` (`framebag-pattern.units`) like the display toggles, not in the project, which stays in mm. Default: mm.
- **Showing:** mm with one decimal ("412.5 mm"); inches to the nearest 1/16, reduced ("24 5/8 in", "3/8", "−1 1/2", "0"). The resolution in decimals ("0.0197 in"); area in ft² with two decimals instead of m².
- **Reading** (`FB.units.parse`): decimal comma and typographic minus; inches as "24 5/8", "24-5/8", "24.625" or "5/8"; a unit typed with the value (mm, cm, m, in, inch, inches, ") wins over the menu's choice. Fractions only for inches.
- **Fields** (`bindNumber`): a field confirmed with its text unchanged since it was focused keeps its exact value, so 10 mm shown as 3/8 in is not rounded by Enter. Arrow steps: the field's step in mm, or 1/16 in (Shift: × 10, or 1/2 in), rounded to what the unit shows (0.01 mm, 1/16 in).
- **Everywhere:** panel, scale field and length popover, the unit after every field (`.unit`), canvas (edge lengths, scale line, measure), messages (radius reduced, low resolution), toasts, print settings and PDF (edge labels, tables, settings, label, check square).
- **New projects** start at round values in the unit: 10 mm seam allowance, 10 mm margin, 15 mm overlap and A4; or 3/8 in, 3/8 in, 5/8 in and Letter. *Reset to defaults* in the print settings uses the current unit.
- Changing the unit derives the geometry again (messages contain lengths) and refreshes every view.

### C. Paper sizes

- `FB.geom.PAPERS`, portrait, mm: A4 210 × 297, A3 297 × 420, A2 420 × 594, A1 594 × 841, A0 841 × 1189; Letter 215.9 × 279.4, Legal 215.9 × 355.6, Tabloid 279.4 × 431.8, Arch C 457.2 × 609.6, Arch D 609.6 × 914.4, Arch E 914.4 × 1219.2. `print.paper` holds the id; files without one (v0.6 and before) are A4.
- **Print settings:** *Paper* at the top lists the papers of the current unit ("A4, 210 × 297 mm", "Letter, 8.5 × 11 in"), with the project's paper on top when it belongs to the other unit. The layout line reads "2 × 3, A4 landscape, 36°".
- `planLayout(..., { paper: [w, h] })` tries that sheet in portrait and landscape, as before.
- **Overview page:** A4, or Letter with a US paper; its layout follows the page's height; the subtitle names the paper.
- **Large sheets** (shorter side over 300 mm: A2 and up, Arch C and up) are for a copy shop. Each such page gets a check square in its first free corner (bottom-left, bottom-right, top-left, top-right of the visible area; 8 mm in from the edges, 4 mm clear of the cut line, outside the piece); half size if a full one does not fit, none if neither does. The overview's assembly steps mention the copy shop.
- **One page:** no page letter, info line or mini-map on it; the assembly says "no trimming or taping".
- **Check square:** 10 cm ticked every centimetre, or 4 in ticked every 1/4 in (longer at each 1/2 and 1 in) when lengths are in inches.

### D. Edge names

- `outline.edgeNames[i]` per segment: a string (at most 40 characters) or null. Like the offsets, an edge uses the first name set on its segments and the panel writes it to all of them. A point inserted on an edge leaves the name on both halves; deleting a point joins the two names (the first set wins).
- Derived: `sd.name` stays the corner letters ("B–C"); `sd.label` is the given name or ''; `sd.title` is the label, else the letters.
- **Panel,** edge selected: a *Name* field, free text (placeholder: the letters); title "Top tube (B–C), curved"; the Edge dropdown and the "Specific:" list use the title.
- **Canvas:** the name before the length at the middle of each edge; the name with the *Labels* toggle, the length with *Lengths*.
- **PDF:** edge labels "Top tube  461.1 mm"; the edge table lists names, with the letters and "curved" in grey (names shortened with … to fit). The offset error names edges by title.

### E. Pattern label

- `project.label = { piece: 'Side panel', side: '' | 'drive' | 'nondrive', note: '' }`, saved with the project; `print.showLabel` (on by default). The first v0.7 build stored `cut` and `front` instead; on opening, `front: 'right'` becomes the drive side and `'left'` the non-drive side.
- **Side** is the side of the bike the photo shows. On a bike with the drivetrain on the right, a photo of the drive side has the front on the right, one of the non-drive side has it on the left; that gives the arrow's direction.
- **Print settings,** group *Pattern label*: Piece, Side ("Not marked", "Drive side", "Non-drive side"), Note; checkbox *Include pattern label* with the others. *Reset to defaults* leaves the label alone.
- **Printed inside the piece:** the piece (14 pt bold), "Includes 10.0 mm seam allowance" (or "No seam allowance"), the project name and the note (7.5 pt grey, wrapped at 70 mm), and with a side marked, "DRIVE SIDE" or "NON-DRIVE SIDE" (8 pt bold) over a 36 mm arrow to the bike's front.
- **Placement** (`FB.geom.placeBlock`): the block, upright in the photo's frame, where it fits inside the finished outline (flattened at 0.5 mm) with 6 mm clear all round and is furthest from it; a grid of 1/40 of the shorter side, then refined five times finer. If it does not fit: piece and side only, 4 mm clear; else no label, and a note on the overview.
- On the pages the label turns with the pattern, half a turn more if it would read upside down; the arrow keeps pointing to the bike's front.
- Overview settings: "Pattern label: Side panel, drive side".

### F. Where the changes go

- `js/platform.js` (new): detection, `mod`, `MOD_KEY`, `keys`, `localize`.
- `js/units.js` (new): `num`, `len`, `fine`, `area`, `parse`, `step`, `snap`, `defaults`, `set`, `using` (tests).
- `index.html`: the two new scripts (platform first, units after geometry); *Millimetres* and *Inches* in the logo menu; Paper, *Include pattern label* and the *Pattern label* group in the print settings; the Name field in the edge section.
- `css/style.css`: `.text-in`, `.pp-group`, `.tick` (the menu's tick); print settings 300 px wide, scrolling on short windows.
- `js/geometry.js`: lengths in messages through units, `sd.label`/`sd.title`, `PAPERS`, `paperById`, `isLargePaper`, paper in `planLayout`, `placeBlock`.
- `js/state.js`: defaults per unit, `edgeNames`, `print.paper`, `print.showLabel`, `label`, `SIDES`.
- `js/project.js`: names, paper and label in files; photo messages.
- `js/editor.js`: modifiers, Alt, the free key, the wheel, units on the canvas, names in edge labels, names kept on insert and delete.
- `js/inspector.js`: units in fields and values, the unchanged-field rule, `bindText`, the edge name.
- `js/statusbar.js`: the unit after every length field.
- `js/printsettings.js`: paper, label fields (piece, side, note), defaults per unit.
- `js/pdf.js`: paper, overview size, units, names, label, check squares on large sheets; `VERSION = 'v0.7'`.
- `js/app.js`: key names at start and in toasts, the units items in the logo menu, recompute on a unit change, *Clear outline* clears the names.
- `tests/`: units (showing, reading, round trip, defaults), paper layout, edge names, label placement, saving and opening: 55 tests.
- README.

### G. Acceptance criteria added

11. Works from `file://` in Chrome and Edge on Windows: keys named Ctrl and Alt, Ctrl places freely, the mouse wheel zooms and a touchpad pans.
12. Switching between millimetres and inches changes no value in the project, and a field confirmed unchanged keeps its value.
13. A frame bag side panel (about 650 × 450 mm cut) fits on one A1 or Arch D sheet, with its own check square.

---

## Changes in v0.6 (as built)

Built 5 Nov 2026 (`framebag-pattern-v0.6.zip`). File format stays version 2. Moving a guide snaps when the guide passes within 10 screen px of an outline point or an intersection anywhere along its length (not only near the pointer). Switching tools clears an old command-line message.

### A. Bars and keys

- **Command line** (second row from the bottom): hint, warnings and tools are vertically centred in the 27 px row (`align-items: center`, no top padding).
- **Status bar:** Photo and Scale stay at the left; the display toggles go back to the right end (`margin-left: auto`). The space in between is left free for later.
- **Trace is `T`** (it was `P`, left over from v0.1's "place points"); `P` keeps working.

### B. Snapping, revised

- Guides are infinite: their two defining points are **no longer snap targets**. □ is only for the outline's points (when drawing guides or measuring).
- **Square line:** when drawing from a start point S (the previous point in Trace, the first end of a guide or a measurement), the pointer snaps onto the line through S square to a reference: in Trace, the previous segment (so the corner shows exactly 90.0°); in all three, any guide or straight edge passing through S. It engages within 10 screen px of that line; marker ⊥.
- Where a square line crosses a guide or a straight edge, the pointer snaps there (rank 2, marker ⊥).
- The perpendicular foot from S onto a guide or straight edge stays.
- **Shift and snaps:** with Shift, only snaps on the Shift line count (where it crosses guides or the outline), so the corner stays exactly 90°; otherwise the plain Shift position. Shift while dragging a point ignores snaps.
- Ranks: 1 outline point; 2 intersection, and square line × guide or edge; 3 perpendicular (foot or square line); 4 on a guide. Lower rank wins, then the nearest.
- Test: Trace A, B, then place C near the square to A–B: the angle at B reads 90.0°.

### C. Moving guides

- Select tool: press on a guide (not on a point or the outline) and drag: it moves parallel to itself (along its normal only). It snaps so it passes through an outline point or an intersection (of two other guides, or of another guide with the outline). One undo step; Esc cancels the move.

### D. Levelling the photo by the wheel axles

- Logo menu: **Level photo…** (needs a photo). Click the centre of one wheel's axle, then the other's (press, refine with the loupe, release, as when tracing). Between the clicks a dashed line shows its tilt in degrees. The photo then turns so the two axles are level; Esc cancels.
- How: the photo is redrawn rotated by −θ (θ = tilt of the axle line, folded into −90°…90°) about its centre, on a canvas just big enough for the rotated rectangle, white outside, stored as JPEG 0.92. The outline points, the scale line and the guides are rotated with it (`q' = R(−θ)(q − c) + c'`), so lengths, angles and the scale are unchanged. One undo step; the view fits the new photo; toast "Photo levelled: turned 2.3°. ⌘Z undoes it." Below 0.05°: "The axles are already level."
- Each levelling resamples the photo once (very slightly softer); level once if possible.

### E. Where the changes go

`css/style.css` (A), `index.html` (Trace T, Level photo item), `js/app.js` (T key, level action, rotation of photo and coordinates), `js/editor.js` (snap rules B, guide moves C, level mode D, hints, loupe), README.

---

## Changes in v0.5 (as built)

Built 4 Nov 2026 (`framebag-pattern-v0.5.zip`). File format stays version 2 (optional `guides` field). Where §1–§12 below still describe the v0.3/v0.4 bars and tools, this section and the v0.4 one are the current behaviour.

### A. Bottom bars

- **Status bar** (bottom row), all groups packed to the left, in this order: **Photo** (toggle, opacity) · **Scale** · display toggles (Traced, Finished, Cut line, Labels, Lengths, Angles, **Guides**, Scale line, Loupe). The **zoom readout is removed** (not useful). No `margin-left: auto`: free space stays at the right end, so full screen adds no gaps in between.
- **Tools** move from the top bar to the right end of the **command line** (second row from the bottom), packed right: `Select V  Trace P  Guide G  Measure M` and a **Snap** toggle. Same row height as now: plain text in the command line's size, grey; active tool in accent red; no underline, no padding that grows the row. The hint and warnings stay on the left of that row; the command line's tool name (`#st-tool`) is dropped, since the tools on the right show the active one. The top bar keeps only logo menu + project name (left) and Undo / Redo / Export PDF / ⚙ (right).
- **Scale button toggles**: clicking "Scale" (or pressing S) while the Scale tool is active leaves it and returns to the tool used before (Trace if none), closing the length field; the label turns back to black. Nothing changes in the scale. Setting a length in the field also returns to the previous tool.

### B. Guides and snapping (like AutoCAD object snaps)

No rulers: a ruler needs an origin, and on a photo it means nothing (same reason the x, y readout went).
- **Guide tool** (`G`): press, drag, release to draw a **guide**, an infinite construction line through the two points. Snaps apply at both ends (the second end also snaps perpendicular from the first); Shift makes it horizontal or vertical. A guide shorter than 5 screen px is not made.
- Guides are drawn thin, grey, dash-dot (the CAD centre-line style), across the whole canvas, under the outlines; also in the loupe. Display toggle **Guides** (status bar) hides them, and hidden guides do not snap. Guides are not printed.
- **Select a guide**: click it with Select (points and the outline win when they are closer); it turns black. `Delete` removes it; right-click a guide → **Delete guide**. Logo menu: **Clear guides** (disabled without guides). All undoable.
- Saved with the project: `"guides": [{ "p1": [x, y], "p2": [x, y] }]` in image px (optional; older files have none).
- **Snapping**, within 10 screen px of the pointer, while placing points (Trace), dragging points (Select), drawing guides and measuring:
  1. **Endpoint** (□): the two points that define each guide; when drawing guides or measuring, also the outline's points.
  2. **Intersection** (×): guide with guide, guide with the traced outline (its drawn polyline, so curves too).
  3. **Perpendicular** (⊥): from the point the new line starts at (the previous point in Trace, the first end of a guide or measurement) to a guide or a straight outline segment.
  4. **On guide** (⧗): the nearest point on a guide.
  Lower number wins; equal kinds: the nearest. A snap wins over Shift; without a snap, Shift applies as before. Points being placed in Trace never snap onto existing outline points (they would coincide).
- **Feedback, kept quiet:** only the one active snap is marked: a small accent-red glyph (□ × ⊥ ⧗) at the snap point, with a white halo; the command line says "Snap: endpoint / intersection / perpendicular / on guide. Hold ⌘ to place freely." No other markers.
- **Snap toggle** in the command line (on by default, remembered like the display toggles). Holding **⌘** while placing or dragging places freely for that action.

### C. Where the changes go

`index.html` (bars, Guide tool, Snap and Guides toggles, Clear guides item), `css/style.css` (packed status bar, command-line tools, `.ln-guide`, `.snap`), `js/editor.js` (guide tool, guide drawing/hit test/selection/delete, snap engine `findSnap`, markers, hints, loupe, Scale toggle), `js/app.js` (G key, S toggles, Clear guides, `[data-tool]` clicks), `js/state.js` + `js/project.js` (`guides`), README.

---

## Changes in v0.4 (as built)

Built 4 Nov 2026 (`framebag-pattern-v0.4.zip`). The file format stays version 2. Where §1–§12 below still describe the v0.3 top bar, tool buttons or status bar, this section is the current behaviour. Not done: the inside angles are not printed on the tile pages (only on the overview page).

### A. Inside angles

- Every **corner** shows its **inside angle**, one decimal ("90.0°"), measured between the directions in which the traced outline arrives at and leaves the corner (the tangents, for curved segments). On a closed outline it is the angle inside the shape (0–360°, above 180° at concave corners); on an open outline the angle between the two segments (0–180°). Smooth points and the ends of an open outline have none.
- **Canvas:** a small grey label inside each corner, on the bisector, opposite the corner letter (letters sit outside). New display toggle **Angles** after "Lengths" in the status bar, on by default, remembered like the other toggles.
- **While placing** a point (Trace), the angle the rubber band makes at the previous point is shown live next to that point; when inserting a point on the outline, the angle at the new point. While dragging a point, the labels update live.
- **Panel**, *Corner B*: read-only row "Inside angle 90.0°" above the corner radius. The panel must still fit without scrolling at 1280 × 700.
- **PDF overview**, Settings: line "Inside angles" listing every corner, e.g. "A 72.4°, D 101.3°".
- **Geometry:** `computeDerived` adds `d.angles[i]` (degrees, `null` for smooth points and open ends): `tIn` = tangent at the end of segment *i−1*'s last piece, `tOut` = tangent at the start of segment *i*'s first piece, `turn = atan2(cross(tIn, tOut), dot(tIn, tOut))` in degrees; closed: `180 − sgn · turn`; open: `180 − |turn|`. Tests: square 90° everywhere (both windings); L shape 270° at the concave corner; triangle angles sum to 180°.

### B. Shift snaps to 90°

Like AutoCAD's Shift (ortho), applied to the corner being formed:
- **Placing a new last point** (Trace, open outline): with Shift the new segment runs at a multiple of 90° to the previous segment, so the corner at the previous point is square (or the line runs straight on). The first segment snaps to horizontal or vertical (photo axes). Math: `d = P − B`, reference `u = norm(B − A)` (or `[1, 0]` without A); of the axes `u` and `perp(u)` take the one with the larger `|dot(d, axis)|`; `P' = B + axis · dot(d, axis)`.
- **Dragging a point, or inserting one on the outline**, when it has two neighbours A and C: with Shift the corner at that point becomes 90°: it moves to the nearest point of the circle with diameter AC (Thales): `M = (A + C)/2`, `P' = M + |AC|/2 · norm(P − M)`. An end point of an open outline snaps like a new last point (reference: its neighbour's other segment).
- Shift does nothing where the corner it would square is a smooth point. Snapping works on the straight lines between points; next to a curved segment the shown angle (tangents) may differ slightly.
- Shift is read from the pointer events and from keydown/keyup (like ⌥), so pressing it mid-drag snaps at once. Shift + arrows still nudge by 10 px.

### C. Top bar: logo, File menu, smaller tools

```
[logo ▾] Project name                Select V  Trace P  Measure M          Undo  Redo  [Export PDF][⚙]
```

- Bar height unchanged (48 px).
- **Logo** `img/logo.png`: the maker's logo, supplied by the user as a PNG (a black glyph on white). Prepared once with a script: crop to the glyph (pixels darker than mid-grey; faint stray marks dropped), black on transparent, 48 px high (2× for Retina). Shown 24 px high, left of the project name, 16 px from the left edge. The logo is the File menu's button, followed by a small grey ▾ (red on hover and while the menu is open). If the file is missing when resuming, ask the user for the PNG again.
- **Browser tab icon** `img/logo-tab.png`: the same glyph, from a second PNG supplied by the user, on a white square with rounded corners (radius 22 %), 64 px, so it stays visible on dark tab bars. Drawn at 512 px and scaled down.
- **File** menu replaces New / Open / Save / Load photo. Clicking the logo opens it below the logo, styled like the right-click menu; it closes on Esc (checked before the other Esc actions), a click elsewhere, or choosing an item. Items, with shortcuts in grey:
  - New project
  - Open… ⌘O
  - Save ⌘S
  - Load photo… (Replace photo… once there is one)
  - Clear outline: removes all points, their edge offsets and straight flags, and reopens the outline. Keeps photo, scale, uniform offset, seam allowance and print settings. Undoable; toast "Outline cleared. ⌘Z brings it back." Disabled without points.
  - Rules separate New/Open/Save, the photo, and Clear outline.
  - No ⌘N (Firefox keeps it for new windows).
- **Tools:** Select, Trace, Measure as plain 13 px text buttons with the key in grey, active tool in accent red with the 2 px underline; centred. The Scale tool button leaves the top bar (see D).

### D. Bottom bar

- The cursor position (x, y) is removed: absolute coordinates on a photo can't be used for anything. Zoom % stays at the left.
- **Full screen** (added after v0.4's first build): a "Full screen" item in the logo menu, and the key `F`, put the page into the browser's own full-screen mode (Fullscreen API on the whole document, like a video site: no tabs, toolbars or bookmarks; Firefox's ⌃⌘F window full screen on macOS keeps them). The item reads "Exit full screen" while it is on; `F`, the item or `Esc` leaves it. While it is on, Firefox reserves `Esc` for leaving full screen (pages cannot keep it), so Esc no longer cancels a drag there; `⌘Z` after the drag does. If Firefox refuses, a toast says so.
- **Scale** group: the label "Scale" becomes the Scale tool's button (key S still works), accent red while the tool is active; then the length field; then, in red only when needed, "Not set" / "Enter the length"; then Reset. The resolution text ("1 px ≈ 0.500 mm") is removed (the low-resolution warning on the command line stays).
- Display toggles: add **Angles** after Lengths.

### E. Where the changes go

- `index.html`: logo `<img>` and favicon link; File button + `#file-menu`; tools without Scale; status bar without `#st-pos`, Scale label as `button[data-tool=scale]`, `#st-res` only for the red messages, Angles toggle; corner section row `#corner-angle`.
- `css/style.css`: `.logo`, File button and menu (reuse `.ctx`), smaller `.tool`, active state of the status-bar Scale button.
- `js/app.js`: File menu open/close, Esc order (print settings, File menu, then editor), actions `clear-outline` and the menu items, `updateChrome` (photo item label, Clear outline disabled, tool highlight includes the status-bar Scale button).
- `js/editor.js`: angle labels (`display.angles`), live angle while placing, Shift snapping for place / insert / drag, Shift keydown/keyup like ⌥, `updateStatus` without position.
- `js/statusbar.js`: no resolution text; Scale button.
- `js/inspector.js`: inside angle row.
- `js/geometry.js`: `d.angles`; tests in `tests/geometry-tests.js`.
- `js/pdf.js`: "Inside angles" settings line; `VERSION = 'v0.4'`.
- README: top bar and File menu, Shift, angles, bottom bar.

---

## 1. Purpose and scope

**Job of the tool:** accurately capture the inner outline of a bike frame from a photo, adjust it, and print it at 1:1 with seam allowance. Everything else (gusset, zipper position, straps, notches, curved details) is done by hand on the printout.

**In scope**

- Load a photo, set the scale from a reference line of known length.
- Trace an outline as a closed shape with any number of points (minimum 3). Points are corners or smooth points; curved tubes are traced with smooth points and give smooth curves made of circular arcs.
- Precise point placement and editing (thin crosshair, magnifier loupe, nudging).
- Zoom and pan that never affect the scale.
- Offsets per edge (uniform default plus specific offsets), applied before seam allowance.
- Rounded corners (radius per corner).
- Uniform seam allowance.
- Tiled A4 PDF with overlap, registration marks, page labels, and an overview page with a 10 cm check square.
- Save / load a project file; autosave of the current session.

**Out of scope** (see §11 Roadmap)

- Gusset patterns, seam/split markers, notches, zipper panels.
- Free-form splines with control points off the outline (béziers). Curves pass through the traced points and are built from circular arcs.
- Perspective / skew correction (planned for v2, using a rectangular reference).
- Paper sizes other than A4; SVG/DXF export; multiple panels per project.

---

## 2. Platform and technology

- **Runs locally from a folder.** The user opens `index.html` by double-clicking. No installation, no local server, no build step, no network access required. Since v1.0 for GitHub, the same folder is also published on GitHub Pages and downloaded from there (see that section).
- **Target:** MacBook Pro on macOS 10.15 Catalina, in Firefox.
- **Language:** plain JavaScript (ES2019-level syntax), HTML, CSS. Scripts are loaded with classic `<script>` tags in a fixed order (ES modules are avoided because browsers block them on `file://` pages).
- **Rendering:** the editor uses SVG for all vector geometry, on top of the photo.
- **PDF:** written by our own small module, `js/pdfwriter.js` (vector paths, clipping, dashes, standard Helvetica text). No third-party dependencies; offset, curve and corner geometry are implemented in our own code (§6).
- **All code written from scratch.** No code or assets from other pattern tools.

### Folder structure

```
framebag-pattern/
  index.html
  README.md              how to use, keyboard shortcuts, photo tips
  css/style.css
  js/state.js            project state, undo/redo history
  js/geometry.js         pure geometry: curves, offsets, fillets, seam allowance, tiling
  js/editor.js           SVG view, zoom/pan, tools, loupe, interaction
  js/inspector.js        right-hand panel: seam allowance, offsets, selection, summary
  js/statusbar.js        bottom bar: command line, photo, scale, display toggles
  js/printsettings.js    print settings behind the gear next to Export PDF
  js/pdf.js              PDF generation
  js/project.js          save/load file, autosave, conversion of older files
  js/pdfwriter.js        minimal PDF writer
  js/app.js              wiring and keyboard shortcuts
  tests/geometry.html    browser-run tests for geometry.js and file conversion
  tests/geometry-tests.js
  spec.md                this document
```

---

## 3. Coordinate systems and data model

### 3.1 Coordinate systems

| System | Used for | Notes |
|---|---|---|
| **Image px** | Traced points, scale line endpoints | Source of truth for anything placed on the photo. Re-calibrating never moves points relative to the photo. |
| **mm** | Everything real-world: lengths, offsets, radii, seam allowance, PDF | Derived: `mm = px × scale`, where `scale = referenceLengthMm / distancePx(scaleP1, scaleP2)`. Square pixels assumed. |
| **Screen px** | Display only | Controlled by the view transform (zoom, pan). Never stored in the project. |

**Units in the UI:** millimetres everywhere, shown with one decimal (e.g. `412.5 mm`).

### 3.2 Project data (saved file)

```json
{
  "format": "framebag-pattern",
  "version": 2,
  "name": "Anna — Gravel 56",
  "created": "2026-11-04T10:00:00Z",
  "modified": "2026-11-04T10:30:00Z",
  "image": { "dataUrl": "data:image/jpeg;base64,…", "width": 4032, "height": 3024 },
  "scale": { "p1": [812.4, 1204.0], "p2": [1712.9, 1210.3], "lengthMm": 500.0 },
  "outline": {
    "closed": true,
    "points": [
      { "x": 1020.5, "y": 980.2, "radius": 20, "smooth": false },
      { "x": 1660.0, "y": 1020.4, "radius": 0, "smooth": true },
      { "x": 2310.0, "y": 1015.7, "radius": 25, "smooth": false },
      { "x": 1540.3, "y": 2104.9, "radius": 15, "smooth": false }
    ],
    "uniformOffset": -3.0,
    "edgeOffsets": [null, null, -5.0, null],
    "edgeStraight": [false, false, false, false]
  },
  "seamAllowance": 10.0,
  "print": { "marginMm": 10, "overlapMm": 15, "optimiseLayout": true,
             "showTraced": true, "showLengths": true },
  "view": { "photoOpacity": 0.8 }
}
```

- A **segment** runs from point *i* to point *i+1* (wrapping). An **edge** runs from one corner to the next and holds one or more segments.
- `smooth`: the point is smooth (§4.1). The first and last points of an open outline are always corners.
- `edgeOffsets[i]` is stored per segment; an edge uses the first value set on its segments, `null` everywhere means "use `uniformOffset`". The panel writes the same value to every segment of the edge.
- `edgeStraight[i]`: segment *i* is kept straight even though it touches a smooth point.
- `radius` belongs to the corner at that point, in mm, applied to the finished outline. `0` = sharp. Smooth points keep their radius for when they become corners again.
- **Version 1** files (v0.1–v0.2) are converted when opened (and when an autosave is restored): each `edgeCurves[i]` handle becomes a smooth point inserted after point *i*, which reproduces the old arc exactly, and both halves keep the edge's offset.
- **Image import:** on load, the photo is drawn to a canvas once to apply its EXIF orientation and stored as a normalised JPEG (quality 0.92, original resolution). This guarantees identical coordinates across browsers.

---

## 4. The three outlines

The tool derives three closed outlines, in this order:

1. **Traced outline** — the outline as clicked on the photo (inside edge of the tubes), passing through every point. Straight segments and circular arcs; it turns sharply only at corners.
2. **Finished outline** (= stitch line) — the traced outline with the offsets applied, then corners rounded with their radii.
3. **Cut line** — the finished outline offset outward by the seam allowance.

**Offset sign convention:** positive = outward (panel gets larger), negative = inward (panel gets smaller). The UI shows the hint "− smaller / + larger".

### 4.1 Corners and smooth points

- A **corner** is where two tubes meet: the outline changes direction and the corner can be rounded.
- A **smooth point** sits along a curved tube: the outline keeps its direction through it, with no kink.
- A segment is **curved** when at least one of its ends is smooth, unless it is kept straight; otherwise it is straight. A segment between two corners is always straight.
- A smooth point between two straight segments acts as a corner.

---

## 5. User interface

### 5.1 Layout

```
┌─────────────────────────────────────────────────────────────┬──────────────────┐
│ Logo▾ Name                   Select Trace Measure           │ Undo Redo PDF ⚙  │  top bar
├─────────────────────────────────────────────────────────────┼──────────────────┤
│                                                             │ 01 Seam allowance│
│                    canvas (photo + SVG)                     │ 02 Offset        │
│                                                             │ 03 Point / Edge  │
│                                                             │ 04 Pattern       │
├─────────────────────────────────────────────────────────────┴──────────────────┤
│ Trace  hint for the current tool                          ■ scale warnings     │  command line
├────────────────────────────────────────────────────────────────────────────────┤
│ Zoom 250 % │ ■ Photo ──●── 80 % │ Scale S [500.0] mm Reset │ ■ Traced ■ Finished │  status bar
│ ■ Cut line ■ Labels ■ Lengths ■ Angles ■ Scale line □ Loupe                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Canvas on the left, fills the window. Inspector on the right, fixed width (~320 px), sized to fit without scrolling.
- **Export PDF** and, next to it, a gear button opening the **print settings**: margin (mm, default 10), overlap (mm, default 15), "Optimise layout", "Include traced outline", "Include edge lengths" (all on by default), the resulting page count and grid, and *Reset to defaults*. Settings are saved with the project. While something blocks the export, Export PDF looks unavailable; clicking it says why.
- **Command line** (upper row of the bottom bar): active tool, one-line hint, scale warnings in red.
- **Status bar** (lower row), always visible, in groups separated by thin rules: cursor position in mm (in px until the scale is set) and zoom; **Photo** toggle and opacity slider (file name and size in the toggle's tooltip); **Scale** reference length (editable) and resolution, or "Not set" / "Enter the length" in red, and **Reset**; **display toggles** for traced outline, finished outline, cut line, point labels, edge lengths, scale line and loupe while hovering.

### 5.2 Visual design (Swiss style)

- **Typeface:** Helvetica Neue / Helvetica (system font, no download). Tabular figures for all numbers.
- **Colour:** black, white, two greys, one accent red (≈ `#E2001A`) for the active tool, the selected point and warnings. No gradients, no shadows, no rounded buttons.
- **Grid:** 8 px base unit; inspector sections numbered `01 … 04` with flush-left labels and right-aligned values.
- **Controls:** text labels; the only icon is the gear for print settings. Inputs are plain underlined fields; the edge dropdown is underlined the same way.
- **On the canvas:** all lines and points get a 1 px white halo so they stay readable on any photo.
  - Traced outline: thin black, 1 px.
  - Finished outline: accent red, 1.5 px.
  - Cut line: black, 1 px dashed.
  - Corners: 5 px hollow squares; smooth points: 6 px hollow circles; the selected point is filled accent red.
  - Point letters: bold, outside the outline for corners; regular and grey, inside the outline for smooth points (clear of the edge lengths, which sit outside).
  - Selected edge: the whole edge from corner to corner, 3 px black.
  - Scale line: grey, with end ticks and its length label.

### 5.3 Tools

| Tool | Key | Behaviour |
|---|---|---|
| **Select** | `V` | Click a point to select it, drag to move it. Click the outline to select the edge there (for its offset and length). Click empty space to deselect. |
| **Trace** | `P` | Press to start placing a point, drag to refine, release to commit. Hold `⌥` (Alt) for a smooth point. Clicking on an existing segment inserts a point there; on a curve the new point is smooth. Clicking the first point (or `Enter`) closes the outline. |
| **Scale** | `S`, or "Scale" in the status bar | Press-drag-release from one end of the reference to the other. Then a field asks for the real length in mm. Endpoints stay editable by dragging (in Scale tool). |
| **Measure** | `M` | Press-drag-release to measure any distance in mm. Temporary; not saved. Used to check the scale against a second known dimension. |
| **Pan** | hold `Space` | Drag to pan. Also: two-finger scroll on the trackpad. |
| **Menu** | right-click or `Ctrl`+click | On a point: **Make B smooth** / **Make B a corner** (not for the ends of an open outline) and **Delete point**. On the outline: **Add point** on that segment, and **Make B–C straight** / **Make B–C curved** for that segment (between two corners, *Make curved* adds a smooth point half way, ready to drag onto the tube). On the scale line: **Reset scale**. Works with any tool. Esc or a click elsewhere closes it. |

### 5.4 Precision features

- **Cursor:** thin 1 px crosshair spanning ~24 px, no hand or arrow cursor over the canvas.
- **Hit area vs. visual size:** points look small (5 px) but are picked within 8 screen px; the nearest point wins.
- **Loupe:** while the mouse button is held in Trace, Scale, Measure or while dragging a point, a circular magnifier (≈ 140 px diameter, 4× the current zoom) appears offset up-left of the cursor, showing the photo and lines with a crosshair at the exact placement position. `L` toggles "loupe always on while hovering".
- **Nudge:** arrow keys move the selected point by 1 image px; `Shift` + arrow by 10 px.
- **Cycle points:** `Tab` / `Shift+Tab` selects the next / previous point (centring the view on it if off-screen).
- **No snapping** (no grid snap, no angle snap).

### 5.5 Zoom and pan

- Pinch on the trackpad, a mouse wheel, or `Ctrl`/`⌘` + scroll: zoom centred on the cursor. Range 10 %–3200 %. Two-finger scrolling on the trackpad pans.
- `+` / `−` zoom in/out centred on the view, `0` fit photo to window, `1` 100 % (1 image px = 1 screen px).
- Zoom and pan are view-only and are never part of the scale or the undo history.

### 5.6 Inspector sections

Photo, scale and display controls live in the status bar (§5.1). **Load photo… / Replace photo…** is in the top bar (replacing confirms if an outline exists).

The panel is fixed: it never scrolls at usual window sizes.

**01 Seam allowance** — one field (mm), default 10.

**02 Offset**
- **Uniform** offset (mm), with the hint "− smaller, + larger".
- **Edge** dropdown listing every edge from corner to corner (edges with their own offset show it) and, next to it, that edge's own offset. Empty means it follows the uniform offset (shown in grey as placeholder). Choosing an edge selects it on the canvas; selecting the outline on the canvas sets the dropdown.
- Below: the edges with their own offset, e.g. "Specific: A–D −5.0"; clicking one selects it.

**03 Selection** — titled after what is selected:
- *Corner B*: radius field (mm), "Make smooth", "Apply to all corners", "Delete point". If the radius doesn't fit, it is clamped and a warning shows the effective value.
- *Smooth point B*: "The outline runs through this point without a kink.", "Make corner", "Delete point".
- *Edge A–D* (", curved" when any part is curved): traced and finished length from corner to corner, along the curves, and "Make B–C straight" / "Make B–C curved" for the segment that was clicked.
- Nothing selected: a one-line hint.

**04 Pattern** — perimeter of the finished outline including rounded corners (useful for cutting the gusset by hand), bounding size of the cut piece, its area, and outline errors.

### 5.7 Points and labels

- Points are labelled A, B, C … in drawing order. Labels are generated, not stored. Edges are named after the corners they run between ("A–D").
- Deleting a point (`Delete` / `Backspace`, the right-click menu, or "Delete point" in the panel) removes it; the two segments at it become one, kept straight only if both were.
- Making a point smooth whose two segments are both kept straight lets both curve again.
- Minimum 3 points for a closed outline. Deleting below 3 reopens the outline.

### 5.8 Keyboard shortcuts (summary)

`V` Select · `P` Trace · `⌥` + place: smooth point · `Shift` + place or drag: square corner (90°) · `F` full screen · `S` Scale · `M` Measure · right-click point/edge menu · `Space` pan · `L` loupe toggle · `Enter` close outline · `Esc` cancel current action / deselect · `Delete` delete point · arrows nudge · `Tab` next point · `⌘Z` undo · `⇧⌘Z` redo · `⌘S` save project · `⌘O` open project · `⌘E` export PDF · `0` fit · `1` 100 % · `+`/`−` zoom.

### 5.9 Undo / redo

Every change to the project state (points and their type, offsets, radii, seam allowance, scale, image, settings) is undoable. View changes (zoom, pan, loupe, display toggles, photo visibility and opacity) are not. Dragging a point is one undo step; a nudge sequence on the same point within 1 s is merged into one step. History depth: 200.

---

## 6. Geometry

All geometry runs in mm on the traced points converted from image px. Implemented in `geometry.js` as pure functions, covered by tests.

Every piece of the traced outline, the finished outline and the cut line is either a **straight line** or a **circular arc**. Arcs keep all steps exact: offsets of arcs are concentric arcs.

### 6.1 Traced outline from corners and smooth points

- **Direction at a smooth point:** if one of its two segments is straight, the direction of that segment; otherwise the direction at the point of the circle through the point and its two neighbours, computed as `|v|/|u| · u + |u|/|v| · v` with `u` and `v` the chords to and from the point (points in a line give their common direction).
- **Curved segments:**
  - one smooth end: the circular arc through both ends that leaves (or reaches) the smooth end in its direction;
  - two smooth ends: a **biarc**, two arcs meeting tangentially, matching both directions. The joint is chosen with equal tangent lengths α: with `V` the chord and `t₀`, `t₁` the directions, `α = |V|² / (V·(t₀+t₁) + √((V·(t₀+t₁))² + 2(1 − t₀·t₁)|V|²))`; where that has no solution (parallel directions pointing away from the chord) the joint is the middle of the chord, which is tangential in exactly that case.
- An arc within 0.01 mm of its chord that also leaves within 0.006° of its direction is drawn as a line.
- Consequences: the outline passes through every point; points on one circle, all smooth, give that circle; a smooth point between two corners gives the arc through all three points (v0.2's curve).

### 6.2 Orientation

Compute the signed area of the traced outline (curves included) and normalise to a consistent winding, so that each piece's outward normal is well defined regardless of the clicking direction.

### 6.3 Offsets per edge → finished outline (before rounding)

1. Each edge (corner to corner) has one offset *d* (its own or the uniform one). Every piece of the edge moves by *d* outward: a line shifts along its outward normal; an arc keeps its centre and its radius changes by *d* (grows when it bulges outward, shrinks when it bulges inward).
2. At a corner, the new vertex is the intersection of the two moved pieces meeting there (line–line, line–circle or circle–circle; the one nearest the moved corner).
3. Where neighbouring pieces meet almost in line (angle < 1°), such as at smooth points and inside biarcs, the average of their moved ends is used; with equal offsets on both sides it lies on both moved pieces, so the finished outline stays smooth there.
4. Where the moved pieces at a corner miss each other (a tight curve next to a corner), a straight piece keeps its moved end and the other piece follows it; an arc rebuilt this way keeps its direction at a smooth end.
5. **Validation:** the result must be a simple (non-self-intersecting) outline with the same winding, no piece reduced to (almost) nothing or turned round, no arc reduced to nothing or turned inside out. Otherwise show an error in the panel, highlight the offending segments in accent red, and disable export.

### 6.4 Rounded corners (fillets)

At each corner with radius *r* > 0 (smooth points have none):

- The rounding circle has its centre *r* away from both adjacent pieces, on the inside of the turn: the intersection of the two pieces moved by *r* (line–line, line–circle or circle–circle). It touches each piece where the perpendicular from its centre meets it. For two straight pieces with interior angle θ this is the familiar tangent distance `t = r / tan(θ/2)`.
- Works for convex and concave corners, and between straight and curved pieces. The pieces next to a corner are always whole segments (a biarc needs two smooth ends).
- **Fit check:** on every segment, the lengths used by the roundings at both ends must not exceed its length (along the curve for arcs). If they do, both radii are reduced by the same factor, found by bisection; a corner takes the smaller factor of its two segments. The panel shows the effective radius and a warning.

The finished outline is a closed path of straight pieces and circular arcs; with every corner rounded it has no kink anywhere.

### 6.5 Seam allowance → cut line

Offset the finished path outward by the seam allowance *s*, piece by piece and analytically:

- Straight pieces: shifted by *s* along the outward normal.
- Arcs (rounded corners and curves): concentric; the radius grows by *s* where the arc bulges outward and shrinks by *s* where it bulges inward. A rounding that shrinks to nothing (concave corner with *r ≤ s*) leaves a sharp corner; a curve that does is an error.
- Pieces that meet tangentially still meet after the offset and are left as they are.
- Elsewhere, where neighbouring pieces no longer meet, both are extended or trimmed to their intersection. At outward corners whose mitre would reach further than 4 × *s*, and where no usable intersection exists, they are bevelled instead.

### 6.6 Derived values

- Edge lengths (traced and finished): from corner to corner, along the curves; the finished length runs between the moved corners, before rounding.
- Perimeter of the finished outline (lines + arc lengths).
- Bounding box of the cut line.
- Arcs are flattened to polylines only for display and PDF output (max. 0.1 mm deviation from the true arc).

---

## 7. PDF output

### 7.1 Page grid

- A4 (210 × 297 mm), portrait or landscape.
- Printable content area per page = page minus margin on all sides (default margin 10 mm).
- Tiles step by `content size − overlap` (default overlap 15 mm), so neighbouring pages share an overlap strip.
- **Optimise layout (on):** the pattern is rotated in 1° steps (0–179°) for both portrait and landscape; the combination with the fewest pages wins, ties go to the smallest angle. Off: 0°, portrait.
- Tiles that contain no part of the pattern are skipped.

### 7.2 Each pattern page

- The pattern lines in the tile, at exact scale:
  - Cut line: solid, 0.5 mm.
  - Finished outline (stitch line): dashed, 0.25 mm.
  - Traced outline (optional): dotted, 0.15 mm, grey.
- Corner letters (A, B, C …) inside the finished corners, and finished edge lengths half way along each edge (optional); a curved edge's length is measured along it, printed along the curve and marked "curved". Smooth points get no letter.
- The overlap strips that go under the next page (right and bottom) are tinted light grey; a thin **placement line** marks where they start.
- Edges that go over a neighbour (left and top) carry a dashed **trim line** at the edge of the printable area.
- **Registration marks** (circle with cross, 6 mm) at every tile-grid intersection and at the midpoint of each shared tile edge, centred on the placement line, so one page shows the whole mark and its neighbour the half next to its trim line.
- Assembly: cut each page along its trim line, lay it on the neighbour with the cut edge on the placement line so the half marks complete the circles, and tape. Work row by row from the top left.
- Page label in a corner, e.g. **B2**, with project name and "page 3 of 7", plus a small mini-map of the page grid with the current page filled.

### 7.3 Overview page (first page)

- Project name, date.
- Small drawing of the whole pattern with the page grid and page labels.
- **10 × 10 cm check square**, with the text "Print at 100 % / Actual size. Check this square before cutting."
- Settings summary: reference length used, uniform offset, specific edge offsets, corner radii, smooth points, seam allowance.
- Edge table (traced / offset / finished, per edge from corner to corner), finished perimeter, cut-piece bounding size.

### 7.4 File

Saved as `<project name>.pdf` via the browser download.

---

## 8. Project files and autosave

- **Save project:** downloads `<project name>.framebag.json` (photo included, so the file is self-contained), format version 2.
- **Open project:** file picker; validates `format` and `version` (1 or 2; version 1 is converted, §3.2); a file from a newer version shows a clear error.
- **Autosave:** the current project is saved to the browser's IndexedDB after each change (debounced 1 s) and offered for restore on next launch ("Restore last session?"). Autosave is a safety net, not a replacement for saving files. Since v1.0 for GitHub (B), the browser is asked to keep that storage.
- New project: clears everything after confirmation if there are unsaved changes.

---

## 9. Error handling and warnings

| Situation | Behaviour |
|---|---|
| Scale not set | Lengths shown in px with a grey "px" unit; export disabled; the status bar shows "Not set" in red. |
| Outline not closed | Export disabled; hint on the command line. |
| Outline crosses itself (also through a curve) | Error in the Pattern section, offending segments highlighted, export disabled. |
| Offsets produce an invalid outline | Error in the Offset section naming the edges, offending segments highlighted, export disabled. |
| Seam allowance too large for a corner or a curve | Error in the Seam allowance section naming the corners and edges, export disabled. |
| Radius doesn't fit | Clamped automatically; warning next to the radius field and in the overview page summary. |
| Photo very low resolution (> 1 mm per px) | Warning on the command line: precision may be limited. |
| Reference line shorter than 10 % of the outline's size | Warning on the command line: short references magnify clicking errors. |

---

## 10. Acceptance criteria

1. A synthetic test photo with a drawn reference line and a known triangle (e.g. sides 500 / 450 / 600 mm) traces to edge lengths within ±0.5 % of the true values.
2. The printed 10 cm check square measures 100 mm ± 0.5 mm when printed at 100 % from Firefox.
3. A printed and assembled multi-page pattern matches the on-screen finished edge lengths within ±1 mm.
4. Per-edge offset of −5 mm on one edge moves only that edge by exactly 5 mm (verified in `tests/geometry.html`).
5. Changing zoom never changes any length, offset or PDF output.
6. Re-calibrating the scale changes all lengths proportionally while points stay fixed on the photo.
7. Save → open round-trips the project exactly; autosave restores after closing the browser tab.
8. Works offline from `file://` in Firefox on macOS Catalina.
9. (v0.3) The traced, finished and cut lines have no kink at smooth points or inside curves: only corners change direction, and with every corner rounded the stitch and cut lines have none at all (verified in `tests/geometry.html`, and on thousands of random outlines during development).
10. (v0.3) A v0.2 project with curve handles opens with the same curves.

---

## 11. Roadmap

- **02 Design, next:** a zipper panel in the gusset or a zip in the side panel; an inside divider along a split line; more than one split line.
- **v2 — Perspective correction:** a rectangular reference (e.g. an A4 sheet against the frame) to correct skew via a homography.
- Measurement-only mode (enter tube lengths instead of tracing a photo).
- A3 / US Letter, single full-size PDF or SVG for print shops.
- Mirrored second panel on the printout.
- Second scale reference to estimate and report scale error.

---

## 12. Photo tips (to include in README)

- Put the reference (ruler, tape) **in the same plane as the frame**, touching the tubes.
- Shoot **perpendicular to the frame**, camera at the height of the frame's centre.
- Stand back and zoom in rather than shooting close with a wide angle; this reduces perspective and lens distortion.
- Use the Measure tool to check one other known dimension (e.g. the top-tube length) before printing.
