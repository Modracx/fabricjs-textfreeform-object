# fabric.TextFreeForm

A **Fabric.js** custom object that warps text through a 4-edge Bézier mesh (envelope distortion), giving you full freeform text shaping — arcs, waves, perspectives, and more — directly on the canvas.

No external dependencies beyond Fabric.js itself.

---

## Demo

Open [`index.html`](./index.html) in a browser. Type your text, adjust font settings, then click **Edit Control Points** to drag the Bézier anchor and handle points and reshape the envelope in real time.

---

## How It Works

Text is rendered flat to an offscreen canvas, then each vertical 1-pixel column is individually sampled and drawn stretched to the height defined by the envelope at that horizontal position. This gives a smooth warp effect without needing access to individual glyph outlines.

### Control-Point Layout

The envelope is defined by **10 normalised control points** (coordinates in the `0–1` range relative to the text's width × height):

```
[0] top-left      [1] top-centre (breakpoint)   [2] top-right
[3] bottom-right  [4] bottom-centre (breakpoint) [5] bottom-left
[6] handle [0]→[1]   [7] handle [1]→[2]
[8] handle [5]→[4]   [9] handle [4]→[3]
```

Points `0–5` are **anchor points** (the corners and midpoints of the envelope).  
Points `6–9` are **Bézier handles** that control the curvature of each half-edge.

The top and bottom edges are each split into two cubic Bézier segments at the breakpoint, parameterised by arc length for uniform distribution.

---

## Installation

Just drop the single file into your project — no build step, no npm install:

```html
<!-- 1. Load Fabric.js (v5.x recommended) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"></script>

<!-- 2. Load TextFreeForm -->
<script src="./TextFreeForm.js"></script>
```

> **Web fonts**: Load any web fonts via `@font-face` or a `<link>` tag *before* creating the object, exactly as you would with `fabric.IText`.

---

## Usage

### Basic

```js
const obj = new fabric.TextFreeForm('WARP', {
  left:       400,
  top:        280,
  originX:    'center',
  originY:    'center',
  fill:       '#000080',
  fontSize:   120,
  fontFamily: 'Arial',
});

canvas.add(obj);
```

### Custom Envelope

Pass a `ctrlPts` array of 10 `{x, y}` objects, with coordinates normalised to `0–1`:

```js
const obj = new fabric.TextFreeForm('WAVE', {
  fontSize: 100,
  ctrlPts: [
    {x: 0,    y: 0.1},   // [0] top-left
    {x: 0.5,  y: 0  },   // [1] top-centre breakpoint
    {x: 1,    y: 0.1},   // [2] top-right
    {x: 1,    y: 1  },   // [3] bottom-right
    {x: 0.5,  y: 1  },   // [4] bottom-centre breakpoint
    {x: 0,    y: 1  },   // [5] bottom-left
    {x: 0.25, y: -0.2},  // [6] handle [0]→[1]
    {x: 0.75, y: -0.2},  // [7] handle [1]→[2]
    {x: 0.25, y: 1  },   // [8] handle [5]→[4]
    {x: 0.75, y: 1  },   // [9] handle [4]→[3]
  ],
});
```

### Kerning

```js
const obj = new fabric.TextFreeForm('SPACED', {
  fontSize: 100,
  kerning:  10,   // Extra pixels between characters (can be negative)
});
```

---

## Options

| Option        | Type     | Default                 | Description                                       |
|---------------|----------|-------------------------|---------------------------------------------------|
| `ctrlPts`     | `Array`  | Flat rectangle (10 pts) | The 10 normalised control points for the envelope |
| `kerning`     | `Number` | `0`                     | Extra spacing (px) added between each character   |
| `text`        | `String` | —                       | The text to render (inherited from `fabric.IText`)|
| `fontSize`    | `Number` | —                       | Font size in pixels                               |
| `fontFamily`  | `String` | —                       | Font family name                                  |
| `fill`        | `String` | —                       | Text fill colour                                  |
| `stroke`      | `String` | —                       | Stroke colour (optional)                          |
| `strokeWidth` | `Number` | —                       | Stroke width in pixels (optional)                 |

All standard `fabric.IText` options (position, shadow, opacity, etc.) are also supported.

---

## Editing

`fabric.TextFreeForm` extends `fabric.IText`, so **double-clicking** the object enters text edit mode with normal cursor and selection behaviour. On exit, the warp is re-applied automatically.

---

## Serialisation

The object serialises and deserialises correctly with Fabric's standard JSON round-trip:

```js
// Save
const json = canvas.toJSON();

// Restore — register the type first
fabric.TextFreeForm.fromObject = function(object, callback) {
  return fabric.Object._fromObject('TextFreeForm', object, callback);
};

canvas.loadFromJSON(json, canvas.renderAll.bind(canvas));
```

---

## Browser Support

Any modern browser that supports `<canvas>` and ES6 classes. Tested with Fabric.js **v5.x**.

---

## License

[MIT](./LICENSE) © Kenneth D'silva (Modracx)
