document.addEventListener('DOMContentLoaded', () => {
  /* TASK from query (?task=serve_egg | push_plate); default serve_egg */
  const params = new URLSearchParams(location.search);
  const task = (params.get('task') || 'serve_egg').toLowerCase();

  /* COLORS */
  const colors = { orange: "#db923c", green: "#91db7b", blue: "#0369a1" };
  const pointStroke = { orange: "#c2410c", green: "#bbf7d0", blue: "#0ea5e9" };

  /* CONFIG */
  const maxSigma = 25;
  const samplesPerSeg = 7;
  const MID_IDX = samplesPerSeg;
  const END_IDX = 2 * samplesPerSeg;

  /* CONTROL POINTS (by task) */
  const control = {
    serve_egg: {
      orange: [
        [[396, 178], [154, 220], [200, 408]],
        [[994, 232], [788, 298], [848, 442]],
        [[1686, 278], [1560, 404], [1472, 488]],
      ],
      green: [
        [[422, 314], [194, 302], [220, 480]],
        [[1018, 310], [822, 374], [882, 508]],
        [[1622, 314], [1520, 416], [1429, 510]]
      ],
      blue: [
        [[374, 304], [128, 302], [156, 478]],
        [[968, 302], [766, 374], [822, 512]],
        [[1580, 288], [1484, 396], [1398, 480]]
      ]
    },
    push_plate: {
      orange: [
        [[136, 404], [304, 380], [418, 370]],
        [[722, 418], [908, 402], [1034, 396]],
        [[1346, 460], [1536, 328], [1636, 424]]
      ],
      green: [
        [[170, 526], [308, 518], [416, 500]],
        [[774, 522], [940, 510], [1068, 492]],
        [[1420, 490], [1572, 362], [1672, 454]]
      ],
      blue: [
        [[88, 540], [244, 528], [356, 512]],
        [[700, 490], [876, 476], [1006, 472]],
        [[1376, 528], [1502, 362], [1604, 450]]
      ]
    }
  };

  /* HARDCODED TARGETS (by task) */
  const hardcodedTargets = {
    serve_egg: {
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
    },
    push_plate: {
      orange: [
        [[78, 394], [310, 446], [502, 470]],
        [[702, 472], [902, 454], [988, 456]],
        [[1386, 442], [1538, 448], [1696, 498]],
      ],
      green: [
        [[138, 412], [390, 454], [510, 510]],
        [[758, 408], [948, 420], [1050, 472]],
        [[1380, 506], [1548, 472], [1664, 448]],
      ],
      blue: [
        [[114, 574], [360, 412], [506, 484]],
        [[674, 550], [892, 442], [1098, 432]],
        [[1352, 472], [1516, 410], [1642, 430]],
      ]
    }
  };

  /* Active sets (validate task) */
  const activeControl = control[task] || control.serve_egg;
  const activeTargets = hardcodedTargets[task] || hardcodedTargets.serve_egg;

  /* BACKGROUND SETS — prefix by task: se_ or pp_ */
  const prefix = task === 'push_plate' ? 'pp' : 'se';
  const bgSets = {
    on: [`media/noise_demo_imgs/${prefix}_img0.png`,
    `media/noise_demo_imgs/${prefix}_img1.png`,
    `media/noise_demo_imgs/${prefix}_img2.png`],
    off: [`media/noise_demo_imgs/${prefix}_white0.png`,
    `media/noise_demo_imgs/${prefix}_white1.png`,
    `media/noise_demo_imgs/${prefix}_white2.png`],
  };

  /* STATE */
  let currentSeed = 1522;
  const denseBase = { orange: [], green: [], blue: [] };
  const noiseVecs = { orange: [], green: [], blue: [] };
  const latestNoisy = { orange: [], green: [], blue: [] };

  /* DOM */
  const bgEl = document.getElementById('bg');
  const svg = document.getElementById('svg');
  const slider = document.getElementById('slider');
  const toggleBg = document.getElementById('toggleBg');

  /* SVG elems */
  const paths = { orange: [], green: [], blue: [] };
  const pointGroups = { orange: make('g', {}), green: make('g', {}), blue: make('g', {}) };

  /* Build paths for colors present in this task */
  for (const color of Object.keys(activeControl)) {
    for (let i = 0; i < activeControl[color].length; i++) {
      const p = make('path', { class: 'track', stroke: colors[color], d: '' });
      svg.appendChild(p);
      paths[color].push(p);
    }
    svg.appendChild(pointGroups[color]);
  }

  /* Background sizing */
  function fitSVGToImage() {
    const w = bgEl.naturalWidth || bgEl.width, h = bgEl.naturalHeight || bgEl.height;
    if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    sendParentHeightSoon();
  }
  if (bgEl.complete) { fitSVGToImage(); } else { bgEl.addEventListener('load', fitSVGToImage); }

  /* INIT curves for active task */
  for (const color of Object.keys(activeControl)) {
    denseBase[color] = activeControl[color].map(seg => sampleDense(seg, samplesPerSeg));
  }
  resampleNoiseWithSeed(currentSeed);

  /* Slider fill gradient */
  const setFill = () => {
    const pct = (slider.value - slider.min) * 100 / (slider.max - slider.min);
    slider.style.setProperty('--_pct', pct + '%');
  };

  /* Bucket helper and background switcher (0–33, 34–66, 67–100) */
  function bucketFor(val) {
    const v = Number(val);
    if (v <= 33) return 0;
    if (v <= 66) return 1;
    return 2;
  }
  function updateBackground() {
    const set = toggleBg.checked ? bgSets.on : bgSets.off;
    const idx = bucketFor(slider.value);
    const nextSrc = set[idx];
    if (bgEl.getAttribute('src') !== nextSrc) {
      bgEl.src = nextSrc; // fitSVGToImage runs on load
    } else {
      fitSVGToImage();
    }
  }

  /* Wire UI */
  setFill();
  updateBackground();
  slider.addEventListener('input', () => {
    setFill();
    updateBackground();
    redrawNoisy(currentSigma(), sliderFrac());
  });
  toggleBg.addEventListener('change', () => {
    updateBackground();
  });
  bgEl.addEventListener('load', fitSVGToImage);

  /* First draw */
  redrawNoisy(currentSigma(), sliderFrac());

  /* ----- Drawing logic ----- */
  function sliderFrac() {
    const f = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
    return Math.max(0, Math.min(1, isFinite(f) ? f : 0));
  }

  function redrawNoisy(sigma, tAnchor) {
    for (const color of Object.keys(denseBase)) {
      latestNoisy[color] = [];
      denseBase[color].forEach((dense, segIdx) => {
        const out = new Array(dense.length);
        for (let i = 0; i < dense.length; i++) {
          const tgtSet = (activeTargets[color] && activeTargets[color][segIdx]) || null;

          if (i === 0 && tgtSet) {
            out[i] = lerp2(dense[i], tgtSet[0], tAnchor);
          } else if (i === MID_IDX && tgtSet) {
            out[i] = lerp2(dense[i], tgtSet[1], tAnchor);
          } else if (i === END_IDX && tgtSet) {
            out[i] = lerp2(dense[i], tgtSet[2], tAnchor);
          } else {
            const n = noiseVecs[color][segIdx][i];
            out[i] = [dense[i][0] + sigma * n[0], dense[i][1] + sigma * n[1]];
          }
        }
        latestNoisy[color][segIdx] = out;
        paths[color][segIdx].setAttribute('d', pathFromPoints(out));
      });
    }
    drawControlPoints();
    sendParentHeightSoon();
  }

  function drawControlPoints() {
    const r = 14;
    for (const color of Object.keys(pointGroups)) {
      const group = pointGroups[color];
      if (!latestNoisy[color]) continue;
      group.innerHTML = '';
      const fill = colors[color];
      const stroke = pointStroke[color];
      latestNoisy[color].forEach(noisySeg => {
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
    for (const color of Object.keys(denseBase)) {
      noiseVecs[color] = denseBase[color].map(denseSeg => denseSeg.map(() => gauss2(rng)));
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