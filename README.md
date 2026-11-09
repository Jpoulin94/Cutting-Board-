# Cutting Board Designer

Design end grain cutting boards, see them in 3D, and get the strip list, cut list and lumber to buy, with blade kerf included at every cut.

## Using it

The app is a single web page with nothing to install and no internet connection needed.

1. Download the repository (green **Code** button, then **Download ZIP**) and unzip it, or use the GitHub Pages link.
2. Open `index.html` in Chrome, Edge, Firefox or Safari.

### The screen
- **Left**: the pattern, the board size, the strips left to right, and **Your tools, kerf and allowances**.
- **Stock designs**: tap **Hide** on any you don't want; **Show hidden designs** brings them back. **File → Save as a stock design…** adds your current board to the top of the list (tap **Delete** to remove it). Your stock designs are included in the backup file.
- **Fit to a size** (next to Board): type the finished width and length you want, and pick from a few strip counts that keep your pattern.
- **Edges and handles**: preview a juice groove, a bevel on the top edges, finger grips or hand holes. These only change the picture, not the cut list.
- **Middle**: the 3D preview. Drag to turn it, scroll or pinch to zoom, and use **3D / Top / Side / End** for preset views.
- **Right**: the finished size, kerf lost, lumber needed with cost, and the glue-up order.
- **Top**: undo and redo, inches or mm, **File**, **Species**, **Save** and **Shop sheet**.

### Patterns
- **End grain stripes**: every row the same.
- **Checkerboard**: every other row flipped end for end. With an odd number of strips the app switches to two panels, since flipping wouldn't change the colours.
- **Brick / offset**: every other row slides sideways by 1/4 to 3/4 of a strip, optionally flipped too. The ragged edges are trimmed off.
- **Honeycomb**: six-sided sticks beveled at 30°, glued into one-row panels, crosscut, and the rows glued together nested half a hexagon over. Pick one, two or three woods, and an optional border of its own wood around each hexagon.
- **3D cubes**: diamond sticks in three woods (top, left, right faces) glued into a one-row panel of cubes, crosscut, and the rows glued together nested.
- **Plaid / custom grid**: two or more panels, each with its own strips and thickness (row depth), stacked in any order. Type an order like `AABAAB` to set the rows quickly.

### Changing colours
Click any block in the 3D preview. Every block cut from that strip lights up, and picking a species changes them all. You can also pick species in the strip list, or use **Alternate … and …** to fill a two-colour pattern.

**Paint bucket.** Press **Paint** on the 3D view, choose **Main** or **Accent** (on honeycomb, **Border**), pick a wood, then tap or drag over blocks. Each block you touch changes until you press **Done**. One drag is one undo. Painting single squares gives those rows their own strip panels (A2, A3…) in the cut list.

**Rows and columns.** Press **Rows** (left of the board) or **Columns** (above it), then tap the board to pick lines, or use **All**, **1st, 3rd…** or **2nd, 4th…**. Choose **Whole row** or **Every other piece**, and with every other piece, **Start on 1st** or **Start on 2nd** (offset). Then **↻ 90°**, **↻ 180°**, **↺ 90°**, **⇄ Flip** (end for end, which mirrors the end face) or **Reset**. Rows whose pieces end up different get their own strip panels in the cut list.

### How sizes are worked out
- Strip widths set the board's columns. The panel's thickness (row depth) sets each row.
- Each crosscut slice is the board thickness plus the flattening allowance. The panel length is the end trim plus one slice and one kerf per row. For example, 16 rows with a 1/8" blade lose 2" to kerf.
- The two outside strips are ripped wider by the edge trim, so the finished board comes out at the size shown.
- Stock width per species adds one rip kerf per strip. Lumber is priced at the rough thickness that mills to what you need (4/4, 5/4, 6/4, 8/4…), plus the waste factor.

All of these are under **Your tools, kerf and allowances**, including separate rip and crosscut kerfs. **Use these for new boards** makes them your defaults.

### Species and cost
**Species** opens your library: colour, price per board foot, where you last bought it, the date and notes. Cost appears once prices are filled in.

### Shop sheet
**Shop sheet** opens a printable page set: summary, lumber, strip list, glue-up diagrams, crosscuts and finishing, with tick boxes. **Print / Save PDF** prints it, or saves a PDF from the print dialog.

### Saving
- **Save** keeps the board in this browser. **File → Open saved board…** lists them.
- Your current board is also kept automatically if the page is closed.
- **File → Download backup of everything** saves all boards, species and settings to one file. **Load a file…** brings it back on another computer or browser.

## Development

Plain HTML, CSS and JavaScript with no build step and no dependencies.

```
npm test        # engine and units tests (Node 18+)
npm start       # optional: serve the folder on http://localhost:8080
```

- `js/units.js`: inches (fractions) and mm
- `js/engine.js`: patterns and the cut list, kerf and lumber math
- `js/species.js`: the species library
- `js/preview3d.js`: the 3D preview, drawn on a canvas
- `js/sheet.js`: the shop sheet and diagrams
- `js/storage.js`: saving and backup files
- `js/app.js`: user interface
