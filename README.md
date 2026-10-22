# Wasif Ishmam · portfolio

Static site. No build step, no framework. three.js loads from a CDN.

## Preview

```bash
node tools/serve.mjs
```

Then open http://localhost:5180. Opening `index.html` straight from disk won't work, because ES modules and the point-cloud fetch need a server.

## Edit

| What | Where |
|---|---|
| Projects (gallery cards and book pages) | `js/projects.js`: one object per project. `line` is the card text, `plain` is the plain-words paragraph, `tech` are the technical bullets, `media` fills the left page. |
| "Worlds I've built" clips | `worlds` at the bottom of `js/projects.js` (the first clip is shown large) |
| Sections: about, Duburi, contact | `index.html` |
| Colours, type, spacing | tokens at the top of `css/style.css`. Sections alternate two colour fields, `t-night` and `t-ember` (orange) |
| Fonts | Makna (Redy Studio) for headings. Put your licensed files in `assets/fonts/` as `Makna-Regular.woff2` (or `.otf` / `.ttf`) and `Makna-Italic.*`; until then Marcellus from Google Fonts stands in. Archivo for text, Martian Mono for readouts |
| Robot in About, and the companion | `js/auv.js` builds the little AUV from primitives (`buildBot`): main ducted propulsor, two side thrusters, four tunnel thrusters cut through the hull (`TUN`), X-tail, DVL. `js/about.js` makes it interactive (click fires every jet, "Take it apart" explodes it with labels); `js/companion.js` flies the same robot down the page. No CAD file ships with the site: keep model files outside this repo, because everything here is public. |
| Experience | the `trajectory` list in `index.html`: one `<li class="keyframe">` per position |
| Hero | `js/hero.js`. It builds `assets/scene/town.bin` (240k points) from 24 cameras, then grows the real Gaussian splat `town.ksplat` (500k splats; `town-lite.ksplat` 200k on phones), rendered with GaussianSplats3D |
| Contact scene and the side "view" gauge | `js/orbit.js` (reuses the same point cloud through `js/cloud.js`) |

**CV:** save a PDF as `assets/Wasif_Ishmam_CV.pdf`. The CV buttons stay hidden until that file exists.

**Media:** keep videos short, muted H.264 MP4 (about 0.5–2 MB each) with a `.jpg` poster of the same name. Thumbnails are 720×720 JPGs in `assets/thumbs/`.

## Add a new project

1. **Media.** Put a square thumbnail in `assets/thumbs/<id>.jpg` (720×720). Put screenshots and clips in `assets/media/`: each clip is a short muted MP4 with a `.jpg` poster of the same name.
2. **Entry.** In `js/projects.js`, copy this block into the `projects` list. The order of the list is the order of the gallery, so put the newest first.

   ```js
   {
     id: "my-project",                 // short, unique, no spaces
     title: "My Project",
     line: "One sentence for the card.",
     cats: ["3d"],                     // any of: 3d, language, perception, products
     year: "2027",
     status: "Open source",            // a small tag on the right page
     thumb: "assets/thumbs/my-project.jpg",
     preview: M + "my-project.mp4",    // optional: plays on the card when hovered
     plain: "What it does, in words anyone can follow.",
     tech: [
       "One technical bullet per line.",
     ],
     stack: ["PyTorch", "three.js"],
     links: [["GitHub", "https://github.com/quagmire02/my-project"]],   // optional
     media: [
       { type: "video", src: M + "my-project.mp4", poster: M + "my-project.jpg", cap: "What the clip shows." },
       { type: "img", src: M + "my-project-shot.jpg", cap: "What the picture shows." },
     ],
   },
   ```

   Optional extras: `facts: [["3.4 GB", "peak VRAM"]]` shows big numbers on the right page, and `tall: true` on a media item suits portrait images. For a product, set `techLabel: "What each feature does"` and write each bullet as `["Feature name", "what it does"]`; the name shows in bold.
3. **Check it locally** with `node tools/serve.mjs`, then publish:

   ```bash
   git add -A
   git commit -m "Add My Project"
   git push
   ```

   GitHub Pages rebuilds the live site about a minute after the push.

## Deploy on GitHub Pages

1. Create a repo named `quagmire02.github.io`.
2. Push the contents of this folder to `main`.
3. In the repo, go to Settings → Pages and choose "Deploy from a branch", `main`, `/ (root)`.

The site is about 40 MB (most of it the splat and videos), well under the Pages limits.
