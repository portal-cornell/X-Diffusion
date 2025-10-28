document.addEventListener('DOMContentLoaded', () => {
  /* COLORS */
  const colors = { orange: "#db923c", green: "#91db7b", blue: "#0369a1" };
  const pointStroke = { orange: "#c2410c", green: "#bbf7d0", blue: "#0ea5e9" };

  /* CONFIG */
  const maxSigma = 34;         // 100% => σ = 34
  const samplesPerSeg = 15;

  /* CONTROL POINTS (two 3-pt segments per color) */
  const control = {
    orange: [
      [[119, 100], [653, 76], [1128, 57]],
      [[59, 641], [523, 511], [1109, 625]]
    ],
    green: [
      [[142, 212], [665, 189], [1135, 164]],
      [[130, 669], [600, 524], [1182, 638]]
    ],
    blue: [
      [[79, 224], [609, 204], [1084, 174]],
      [[98, 699], [576, 556], [1155, 672]]
    ]
  };

  /* STATE (no locking) */
  let currentSeed = 1522; // fixed seed (no UI)
  const denseBase = { orange: [], green: [], blue: [] };
  const noiseVecs = { orange: [], green: [], blue: [] };
  const latestNoisy = { orange: [], green: [], blue: [] };

  /* DOM */
  const bgEl = document.getElementById('bg');
  const svg = document.getElementById('svg');
  const slider = document.getElementById('slider');
  // const pct = document.getElementById('pct');
  const toggleBg = document.getElementById('toggleBg');

  /* SVG elements */
  const paths = { orange: [], green: [], blue: [] };
  const pointGroups = { orange: make('g', {}), green: make('g', {}), blue: make('g', {}) };

  for (const k of Object.keys(colors)) {
    for (let i = 0; i < control[k].length; i++) {
      const p = make('path', { class: 'track', stroke: colors[k], d: '' });
      svg.appendChild(p);
      paths[k].push(p);
    }
    svg.appendChild(pointGroups[k]);
  }

  /* Background (pre-set) + toggle */
  function fitSVGToImage() {
    const w = bgEl.naturalWidth || bgEl.width, h = bgEl.naturalHeight || bgEl.height;
    if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    bgEl.style.opacity = toggleBg.checked ? '1' : '0';
    sendParentHeightSoon();
  }
  if (bgEl.complete) { fitSVGToImage(); } else { bgEl.addEventListener('load', fitSVGToImage); }
  toggleBg.addEventListener('change', () => {
    bgEl.style.opacity = toggleBg.checked ? '1' : '0';
    sendParentHeightSoon();
  });

  /* INIT (no lock) */
  for (const k of Object.keys(control)) {
    denseBase[k] = control[k].map(seg => sampleDense(seg, samplesPerSeg));
  }
  resampleNoiseWithSeed(currentSeed);
  // pct.textContent = slider.value + '%';

  const setFill = () => {
    const pct = (slider.value - slider.min) * 100 / (slider.max - slider.min);
    slider.style.setProperty('--_pct', pct + '%');
  };
  setFill();
  slider.addEventListener('input', setFill);

  redrawNoisy(currentSigma());

  /* UI: noise only */
  slider.addEventListener('input', () => {
    // pct.textContent = slider.value + '%';
    redrawNoisy(currentSigma());
  });

  /* Redraw noisy curves + move dots */
  function redrawNoisy(sigma) {
    for (const k of Object.keys(denseBase)) {
      latestNoisy[k] = [];
      denseBase[k].forEach((dense, idx) => {
        const noisy = dense.map((p, i) => [
          p[0] + sigma * noiseVecs[k][idx][i][0],
          p[1] + sigma * noiseVecs[k][idx][i][1]
        ]);
        latestNoisy[k][idx] = noisy;
        paths[k][idx].setAttribute('d', pathFromPoints(noisy));
      });
    }
    drawControlPoints();
    sendParentHeightSoon();
  }

  /* Dots at start/mid/end */
  function drawControlPoints() {
    const r = 14;
    for (const k of Object.keys(pointGroups)) {
      const group = pointGroups[k];
      group.innerHTML = '';
      const fill = colors[k];
      const stroke = pointStroke[k];

      const midIdx = samplesPerSeg;
      const endIdx = 2 * samplesPerSeg;
      latestNoisy[k].forEach(noisySeg => {
        if (!noisySeg || noisySeg.length < endIdx + 1) return;
        const a = noisySeg[0], b = noisySeg[midIdx], c = noisySeg[endIdx];
        group.appendChild(make('circle', { cx: a[0], cy: a[1], r, class: 'pt', fill, stroke }));
        group.appendChild(make('circle', { cx: b[0], cy: b[1], r, class: 'pt', fill, stroke }));
        group.appendChild(make('circle', { cx: c[0], cy: c[1], r, class: 'pt', fill, stroke }));
      });
    }
  }

  /* Helpers */
  function currentSigma() { return maxSigma * (+slider.value / 100); }
  function resampleNoiseWithSeed(seed) {
    const rng = mulberry32(seed);
    for (const k of Object.keys(denseBase)) {
      noiseVecs[k] = denseBase[k].map(denseSeg => denseSeg.map(() => gauss2(rng)));
    }
  }

  function pathFromPoints(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
    const d = [];
    d.push(`M${points[0][0]},${points[0][1]}`);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d.push(`C${cp1x},${cp1y},${cp2x},${cp2y},${p2[0]},${p2[1]}`);
    }
    return d.join(' ');
  }

  function sampleDense(points, samplesPerSeg = 15) {
    if (points.length === 1) return [...points];
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      for (let s = 0; s < samplesPerSeg; s++) {
        const t = s / samplesPerSeg;
        out.push(cubicBezierPoint(p1, c1, c2, p2, t));
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function cubicBezierPoint(p0, c1, c2, p3, t) {
    const mt = 1 - t;
    const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p3[0];
    const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p3[1];
    return [x, y];
  }

  function make(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }
  function mulberry32(a) {
    return function () {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }
  function gauss2(rng) {
    const u = 1 - rng(), v = 1 - rng();
    const s = Math.sqrt(-2 * Math.log(u));
    return [s * Math.cos(2 * Math.PI * v), s * Math.sin(2 * Math.PI * v)];
  }

  function sendParentHeightSoon() {
    if (window.parent && window.parent !== window) {
      setTimeout(() => {
        const root = document.getElementById('noise-demo-iframe');
        const h = root ? Math.ceil(root.getBoundingClientRect().height) : document.documentElement.scrollHeight;
        window.parent.postMessage({ id: 'noise-demo', height: h }, '*');
      }, 30);
    }
  }
});