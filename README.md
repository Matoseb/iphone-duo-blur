# Foldable Phone

A foldable phone rendered with [three.js](https://threejs.org/) and bundled with [Vite](https://vite.dev/).

Drag the left half to fold it, tap anywhere on the phone to open or close it, drag the background to orbit.

The screens are "portals": each pane looks up a fixed frontal render of the unfolded image through its own projection, so a folded pane keeps showing the image as if it were still flat. A post-processed blur chain, a darkening gradient and a controlled perspective stretch follow the fold angle. The body is a chamfered slab with rounded corners, chrome rims lit by an environment map, and a Fresnel glass reflection on the screens.

## Run

```
npm install
npm run dev
```

`npm run build` outputs a static site in `dist/`.

All the tunable values (blur, darkening, stretch, camera, phone size) are constants at the top of `src/main.js`.

## Credits

Built by [Sébastien Matos](https://github.com/Matoseb) together with Claude Fable 5.1 (Anthropic), which wrote the code through an iterative conversation in Claude Code.

Image: `image2.jpg`.
