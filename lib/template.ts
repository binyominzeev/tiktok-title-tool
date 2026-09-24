export type TitleSettings = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  paddingX: number;
  paddingY: number;
  radius: number;
};

// Matches the font used by the title text in public/template.svg.
const FONT_FAMILY = 'Montserrat';

let measureCanvas: HTMLCanvasElement | null = null;

// Measures the real rendered width of a line so the background box fits
// every character (e.g. a trailing "?") instead of relying on an average.
function measureTextWidth(text: string, fontSize: number, fontWeight: number): number {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.55;
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  return ctx.measureText(text).width;
}

export function applyTemplate(svg: string, settings: TitleSettings): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const title = doc.getElementById('title');
  const bg = doc.getElementById('title-background');

  if (!title) {
    throw new Error('A template.svg fájlban nincs id="title" elem.');
  }

  if (!bg) {
    throw new Error(
      'A template.svg fájlban nincs id="title-background" elem.'
    );
  }

  title.setAttribute('x', String(settings.x));
  title.setAttribute('y', String(settings.y));
  title.setAttribute('font-size', String(settings.fontSize));
  title.setAttribute('font-family', FONT_FAMILY);
  title.setAttribute('font-weight', String(settings.fontWeight));
  title.setAttribute('fill', settings.color);
  title.setAttribute('dominant-baseline', 'middle');

  // Remove the previous text/tspan content.
  while (title.firstChild) {
    title.removeChild(title.firstChild);
  }

  // SVG <text> does not treat newline characters as visual line breaks.
  // Therefore every line is rendered as a separate <tspan>.
  const lines = settings.text.split(/\r?\n/);

  const lineHeight = settings.fontSize * 1.15;

  // Center the complete multiline block vertically around settings.y.
  // Each tspan uses dominant-baseline: middle, so its y is already the
  // vertical center of that line - no extra baseline offset needed.
  const totalHeight = lineHeight * lines.length;
  const firstLineY = settings.y - totalHeight / 2 + lineHeight / 2;

  lines.forEach((line, index) => {
    const tspan = doc.createElementNS(
      'http://www.w3.org/2000/svg',
      'tspan'
    );

    tspan.setAttribute('x', String(settings.x));
    tspan.setAttribute('y', String(firstLineY + index * lineHeight));
    tspan.setAttribute('text-anchor', 'middle');
    tspan.setAttribute('dominant-baseline', 'middle');

    tspan.textContent = line;

    title.appendChild(tspan);
  });

  // Measure the widest line so the background box fits every character.
  const widestLineWidth = lines.reduce(
    (widest, line) =>
      Math.max(widest, measureTextWidth(line, settings.fontSize, settings.fontWeight)),
    0
  );

  const estimatedWidth = Math.min(
    900,
    Math.max(
      180,
      widestLineWidth + settings.paddingX * 2
    )
  );

  // Make the background tall enough for all lines.
  const estimatedHeight =
    totalHeight + settings.paddingY * 2;

  bg.setAttribute(
    'x',
    String(settings.x - estimatedWidth / 2)
  );

  bg.setAttribute(
    'y',
    String(settings.y - estimatedHeight / 2)
  );

  bg.setAttribute('width', String(estimatedWidth));
  bg.setAttribute('height', String(estimatedHeight));
  bg.setAttribute('rx', String(settings.radius));
  bg.setAttribute('fill', settings.backgroundColor);
  bg.setAttribute(
    'fill-opacity',
    String(settings.backgroundOpacity)
  );

  return new XMLSerializer().serializeToString(
    doc.documentElement
  );
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
