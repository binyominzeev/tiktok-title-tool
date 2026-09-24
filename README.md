# TikTok Title Tool

Minimal local webapp for putting a custom SVG-template title onto vertical videos.

## Requirements

- Node.js 20+
- npm

FFmpeg is bundled through `ffmpeg-static`, so a system FFmpeg installation is not required for the normal npm workflow.

## Start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Customize the design

Edit `public/template.svg` with Inkscape.

Keep these two IDs:

- `id="title"` — text element
- `id="title-background"` — background shape

You can redesign everything else. The app currently updates the title's text, position, font, size, weight, color and the background rectangle's color/opacity/radius.

## Export

The browser sends the selected video and generated SVG to `/api/export`.

The server:

1. rasterizes SVG to PNG with Sharp;
2. overlays the PNG over the original video with FFmpeg;
3. copies the original audio stream;
4. returns the finished MP4 as a download.

## Notes

The MVP estimates the background rectangle size from the title length. If your Inkscape design requires a fixed or more sophisticated background, remove that calculation in `lib/template.ts` and control the rectangle entirely from the SVG template.
