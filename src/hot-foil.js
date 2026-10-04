// The cover itself supplies the height field. SVG lighting computes its surface
// normals from luminance, so highlights follow the artwork without reading CDN
// pixels into canvas or maintaining a second image/loading path.
const SVG_NS = 'http://www.w3.org/2000/svg';
const REST_AZIMUTH = 225;
const REST_ELEVATION = 48;

function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

export function ensureHotFoilFilters() {
  const existing = document.getElementById('hot-foil-definitions');
  if (existing) return existing;
  // Document-owned definitions survive the physical card's clone and return.
  const svg = element('svg', { id: 'hot-foil-definitions', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
  Object.assign(svg.style, { position: 'absolute', overflow: 'hidden', pointerEvents: 'none' });
  const defs = element('defs');
  for (const [id, strength] of [['rest', .24], ['active', .38], ['subtle', .1], ['active-subtle', .16]]) {
    const filter = element('filter', { id: `hot-foil-${id}`, x: '0%', y: '0%', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' });
    filter.append(element('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 1, result: 'smoothed' }));
    filter.append(element('feColorMatrix', { in: 'smoothed', type: 'luminanceToAlpha', result: 'height' }));
    const lighting = element('feSpecularLighting', { in: 'height', surfaceScale: 5, specularConstant: 1, specularExponent: 28, 'lighting-color': '#fff4dd', result: 'reflection' });
    lighting.append(element('feDistantLight', { azimuth: REST_AZIMUTH, elevation: REST_ELEVATION }));
    filter.append(lighting);
    filter.append(element('feComposite', { in: 'SourceGraphic', in2: 'reflection', operator: 'arithmetic', k1: 0, k2: 1, k3: strength, k4: 0, result: 'lit' }));
    filter.append(element('feComposite', { in: 'lit', in2: 'SourceGraphic', operator: 'in' }));
    defs.append(filter);
  }
  svg.append(defs);
  document.body.append(svg);
  return svg;
}

// Only one card references the moving light. Every other cover keeps its
// resting light, including detached inspector/travel snapshots.
export function updateHotFoilLight(card, u, v) {
  if (!card.querySelector('[data-hot-foil] > .cover-image.is-loaded')) return;
  const definitions = ensureHotFoilFilters();
  const azimuth = REST_AZIMUTH + (u - .5) * 140;
  const elevation = REST_ELEVATION + (.5 - v) * 36;
  for (const id of ['hot-foil-active', 'hot-foil-active-subtle']) {
    const light = definitions.querySelector(`#${id} feDistantLight`);
    light.setAttribute('azimuth', azimuth.toFixed(2));
    light.setAttribute('elevation', elevation.toFixed(2));
  }
  card.dataset.foilActive = 'true';
}
