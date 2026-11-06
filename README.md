# Framebag Pattern v1.0
Design the pattern of a framebag from a photo of the bike, or paper template. Add seam allowance, gusset, notches, straps and bolt marks, or split into two. Print it at true size, either tiled or on large sheets. The tools runs in your browser. Nothing needs to be installed or uploaded. Save a project with embedded photo for archiving. 

The tool is largely inspired by the well known [_Automatic Pattern Generator_](https://myogtutorials.com/online-automatic-pattern-generator/) by myogtutorials.com (Prickly Gorse) with some CAD influences. This different implementation reflects my personal needs and aesthetic preferences. The tool was built using Claude Opus 5.5 in a couple evenings. Although it is version v1.0, there are bugs and inaccuracies. 

## Tools at a glance

**1. Trace**: the frame.

- **Select** (`V`): select and move points, edges and guides.
- **Trace** (`T`): place points on the inside corners of the frame, and smooth points along curved tubes.
- **Scale** (`S`): draw along a ruler in the photo and type its real length.
- **Guide** (`G`): a construction line through two points, to snap to.
- **Measure** (`M`): measure any distance, to check the scale.
- **Level photo** (logo menu): turn the photo so both wheel axles are level.

**2 Design** (`D`): the bag.

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
