document.addEventListener('DOMContentLoaded', () => {
  /* COLORS */
  const colors = { orange: "#db923c", green: "#91db7b", blue: "#0369a1" };
  const pointStroke = { orange: "#c2410c", green: "#bbf7d0", blue: "#0ea5e9" };

  /* CONFIG */
  const maxSigma = 25;         // 100% => σ = 34
  const samplesPerSeg = 7;     // keep your setting
  const MID_IDX = samplesPerSeg;
  const END_IDX = 2 * samplesPerSeg;

  /* CONTROL POINTS (two 3-pt segments per color) */
  const control = {
    orange: [
      [[396, 178], [154, 220], [200, 408]],
      [[994, 232], [788, 298], [848, 442]],
      [[1686, 278], [1560, 404], [1472, 488]],
    ],
    green: [
      [[422, 314], [194, 302], [220, 480]],
      [[1018, 310], [822, 374], [882, 508]],
      [[1622, 314], [1520, 416], [1448, 510]]
    ],
    blue: [
      [[374, 304], [128, 302], [156, 478]],
      [[968, 302], [766, 374], [822, 512]],
      [[1580, 288], [1484, 396], [1398, 480]]
    ]
  };

  /* HARDCODED TARGETS for all 18 dots (start, mid, end for each segment) */
  const hardcodedTargets = {
    // orange: [
    //   [[56, 76], [614, 133], [1126, 113]],   // segment 0
    //   [[148, 554], [516, 559], [1164, 564]]   // segment 1
    // ],
    // green: [
    //   [[189, 216], [715, 170], [1174, 214]],
    //   [[173, 612], [659, 574], [1136, 604]]
    // ],
    // blue: [
    //   [[70, 243], [644, 245], [1049, 130]],
    //   [[83, 647], [630, 625], [1082, 588]]
    // ]
    orange: [
      [[370, 136], [244, 212], [266, 428]],
      [[1020, 194], [875, 318], [956, 488]],
      [[1692, 212], [1496, 382], [1488, 540]],
    ],
    green: [
      [[476, 254], [282, 332], [248, 570]],
      [[1098, 308], [932, 386], [914, 562]],
      [[1656, 342], [1530, 440], [1398, 622]],
    ],
    blue: [
      [[308, 236], [96, 322], [96, 484]],
      [[932, 270], [758, 370], [784, 594]],
      [[1570, 280], [1442, 326], [1310, 516]],
    ]
  };

  /* STATE */
  let currentSeed = 1522; // fixed seed (no UI)
  const denseBase = { orange: [], green: [], blue: [] };
  const noiseVecs = { orange: [], green: [], blue: [] };
  const latestNoisy = { orange: [], green: [], blue: [] };

  /* DOM */
  const bgEl = document.getElementById('bg');
  const svg = document.getElementById('svg');
  const slider = document.getElementById('slider');
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

  /* Background sizing + toggle */
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

  /* INIT */
  for (const k of Object.keys(control)) {
    denseBase[k] = control[k].map(seg => sampleDense(seg, samplesPerSeg));
  }
  resampleNoiseWithSeed(currentSeed);

  const setFill = () => {
    const pct = (slider.value - slider.min) * 100 / (slider.max - slider.min);
    slider.style.setProperty('--_pct', pct + '%');
  };
  setFill();
  slider.addEventListener('input', setFill);

  redrawNoisy(currentSigma(), sliderFrac());

  /* UI: noise only; anchors lerp by slider fraction */
  slider.addEventListener('input', () => {
    redrawNoisy(currentSigma(), sliderFrac());
  });

  function sliderFrac() {
    const f = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
    return Math.max(0, Math.min(1, isFinite(f) ? f : 0));
  }

  /* Redraw noisy curves + move dots */
  function redrawNoisy(sigma, tAnchor) {
    for (const k of Object.keys(denseBase)) {
      latestNoisy[k] = [];
      denseBase[k].forEach((dense, segIdx) => {
        const out = new Array(dense.length);

        for (let i = 0; i < dense.length; i++) {
          if (i === 0) {
            // start anchor -> hardcoded target[0]
            out[i] = lerp2(dense[i], hardcodedTargets[k][segIdx][0], tAnchor);
          } else if (i === MID_IDX) {
            // mid anchor -> hardcoded target[1]
            out[i] = lerp2(dense[i], hardcodedTargets[k][segIdx][1], tAnchor);
          } else if (i === END_IDX) {
            // end anchor -> hardcoded target[2]
            out[i] = lerp2(dense[i], hardcodedTargets[k][segIdx][2], tAnchor);
          } else {
            // intermediate points get Gaussian noise
            const n = noiseVecs[k][segIdx][i];
            out[i] = [dense[i][0] + sigma * n[0], dense[i][1] + sigma * n[1]];
          }
        }

        latestNoisy[k][segIdx] = out;
        paths[k][segIdx].setAttribute('d', pathFromPoints(out));
      });
    }
    drawControlPoints();
    sendParentHeightSoon();
  }

  /* Draw the 18 dots at start/mid/end (they track the curve points) */
  function drawControlPoints() {
    const r = 14;
    for (const k of Object.keys(pointGroups)) {
      const group = pointGroups[k];
      group.innerHTML = '';
      const fill = colors[k];
      const stroke = pointStroke[k];

      latestNoisy[k].forEach(noisySeg => {
        if (!noisySeg || noisySeg.length < END_IDX + 1) return;
        const a = noisySeg[0];
        const b = noisySeg[MID_IDX];
        const c = noisySeg[END_IDX];
        group.appendChild(make('circle', { cx: a[0], cy: a[1], r, class: 'pt', fill, stroke }));
        group.appendChild(make('circle', { cx: b[0], cy: b[1], r, class: 'pt', fill, stroke }));
        group.appendChild(make('circle', { cx: c[0], cy: c[1], r, class: 'pt', fill, stroke }));
      });
    }
  }

  /* Helpers */
  function currentSigma() { return maxSigma * sliderFrac(); }

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

  function lerp2(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
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