# Framebag Pattern v1.0
Design the pattern of a framebag from a photo of the bike, or paper template. Add seam allowance, gusset, notches, straps and bolt marks, or split into two. Print it at true size, either tiled or on large sheets. The tools runs in your browser. Nothing needs to be installed or uploaded. Save a project with embedded photo for archiving. 

The tool is largely inspired by the well known [_Automatic Pattern Generator_](https://myogtutorials.com/online-automatic-pattern-generator/) by myogtutorials.com (Prickly Gorse) with some CAD influences. This different implementation reflects my personal needs and aesthetic preferences. The tool was built using Claude Opus 5.5 in a couple evenings. Although it is version v1.0, there are bugs and inaccuracies. 

## Tools at a glance

**01 Trace**: the frame.

- **Select** (`V`): select and move points, edges and guides.
- **Trace** (`T`): place points on the inside corners of the frame, and smooth points along curved tubes.
- **Scale** (`S`): draw along a ruler in the photo and type its real length.
- **Guide** (`G`): a construction line through two points, to snap to.
- **Measure** (`M`): measure any distance, to check the scale.
- **Level photo** (logo menu): turn the photo so both wheel axles are level.

**02 Design** (`D`): the bag.

- **Select** (`V`): select edges, notches, straps, bolt holes and the split line; drag them along the stitch line.
- **Split** (`K`): split the side panel in two, or clip it to one piece.
- **Measure** (`M`): measure any distance.
- In the panel: the seam allowance, the gusset and the notches.

**Export PDF** (`⌘E`): the pattern at true size. An overview with a check square, the pattern pages, and a cut list with every piece's size, its fabric area and the total.

Every key is listed under [Tools and shortcuts](#tools-and-shortcuts).

## Your local copy
If you prefer to have a local copy, you can download it directly [here](https://github.com/mgarbellini/framebag-pattern/archive/refs/heads/main.zip). Unzip it and open `index.html` with the browser. The logo at the top left and the icon in the browser tab can be replaced with your own logo. The logo files are located in the `img` folder.

## Licence

The code and its documentation are released under the [MIT License](LICENSE).

**The logo is not covered by the MIT License.** `img/logo.png` and `img/logo-tab.png` are © 2026 Matteo Garbellini, all rights reserved. If you share a copy or a changed version of the tool, replace them with your own logo.

## Workflow

The work is done in two steps, chosen at the top of the window: **01 Trace** for the frame, then **02 Design** for the bag. The panel on the right and the tools follow the step.

### 01 Trace

1. **Photo.** Click the logo at the top left for the File menu and choose **Load photo…**, or drop a photo onto the window. See the photo tips below. iPhone photos in HEIC format open only in Safari: export them as JPEG first.
2. **Scale** (`S`, or click **Scale** in the bottom bar). Drag along the reference marking from one end to the other, type its real length and press Enter. Use **Measure** (`M`) on another known length if you want to double check.
3. **Trace** (`T`). On each inside corner of the frame, press, drag to the exact spot while watching the loupe, and release. Along a curved tube, add points on the curve too and make them smooth (see below). Click the first point (or press Enter) to close the outline. To add a point later, click on the outline. To remove a point, right-click it and choose **Delete point**.
4. **Adjust** in the panel on the right:
   - **01 Offset**: the uniform offset moves every edge (negative makes the panel smaller, positive larger). To give one edge its own offset, choose it in the **Edge** dropdown (or click it on the canvas) and type the value next to it; clear the field to go back to the uniform offset.
   - **02** follows what you select. For a corner: its **corner radius**, *Make smooth*, *Apply to all corners* and *Delete point*. For a smooth point: *Make corner* and *Delete point*. For an edge: its **name**, its traced and finished length, and *Make … straight* / *Make … curved* for the part you clicked.
   - **03 Outline** sums it up: the finished perimeter and size.

### 02 Design

5. **Design** (`D`, or **02 Design** at the top): the seam allowance, the gusset, the notches, straps and bolt holes, and a split line.

### Print

6. **Export PDF** and print it at **100 %** or **Actual size**, never "Fit to page". Measure the check square on the first page before cutting fabric. The gear next to Export PDF opens the print settings: paper, margin, overlap, layout options, the pattern label and the page count. The second page is the cut list: every piece with its size and fabric area, the total area for buying fabric, then the gusset strip with where its notches, straps and bolt holes go.
7. **Assemble.** Cut each page along its dashed trim line (left and/or top edge), lay it over its neighbour with the cut edge on the thin placement line so the half marks complete each circle, and tape. Work row by row from the top left; the grey strips go underneath the next page. A pattern that fits on one sheet needs none of this.
