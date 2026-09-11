/* =====================================================================
   ICNC 2027 — live hero scene (v2)
   A painterly Rockies lake scene on <canvas id="hero-canvas">, lit by the
   real time of day in Banff (sun elevation computed for 51.18 N, 115.57 W).
   Faceted mountains with sun-lit and shadowed faces and atmospheric haze,
   layered conifers swaying in a slow wind, volumetric clouds, a soft
   blurred reflection that breathes on long, gentle swells, alpenglow at
   sunrise/sunset, stars, a phase-correct moon and a faint aurora at night.

   Preview:  ?d=2027-06-02&t=21.7   (date, Banff local hour)   ?cycle (a day/minute)
   Respects prefers-reduced-motion (one still frame, refreshed each minute).
   ===================================================================== */
(function () {
  'use strict';
  var canvas = document.getElementById('hero-canvas');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var hero = canvas.parentNode;
  var fallback = hero.querySelector('.hero-art');
  var clockEl = document.getElementById('hero-clock');
  var params = new URLSearchParams(window.location.search);
  var demo = params.has('cycle');
  var fixedHour = params.has('t') ? parseFloat(params.get('t')) : null;
  var fixedDate = params.has('d') ? params.get('d') : null;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- virtual scene space 1600 x 700, bottom-centre anchored ----------
  var VW = 1600, VH = 700, SHORE = 556;
  var W = 0, H = 0, S = 1, OX = 0, OY = 0, DPR = 1;
  var top = document.createElement('canvas'), tctx = top.getContext('2d');       // everything above the shore
  var refl = document.createElement('canvas'), rctx = refl.getContext('2d');     // low-res copy => soft reflection
  var RS = 0.22;                                                                  // reflection resolution factor

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    S = Math.max(W / VW, H / VH); OX = (W - VW * S) / 2; OY = H - VH * S;
    top.width = Math.max(2, Math.round(VW * S * DPR)); top.height = Math.max(2, Math.round(SHORE * S * DPR));
    refl.width = Math.max(2, Math.round(VW * S * DPR * RS)); refl.height = Math.max(2, Math.round(SHORE * S * DPR * RS));
  }

  // ---------- utilities ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function rgb(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  var seed = 2027; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }

  // ---------- astronomy ----------
  var LAT = 51.178 * Math.PI / 180, LON = -115.571;
  function solar(date) {
    var y = date.getUTCFullYear(), n = (date - Date.UTC(y, 0, 1)) / 864e5;
    var decl = 0.4093 * Math.sin(2 * Math.PI * (284 + n) / 365), b = 2 * Math.PI * (n - 81) / 365;
    var eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
    var utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    var Hdeg = ((utcMin + 4 * LON + eot) / 4 - 180 + 540) % 360 - 180, Hr = Hdeg * Math.PI / 180;
    var sinE = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(Hr);
    return { elev: Math.asin(sinE) * 180 / Math.PI, H: Hdeg };
  }
  function moonPhase(date) { var age = ((date - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588853; if (age < 0) age += 29.530588853; return age / 29.530588853; }
  function banffOffsetMinutes(date) {
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(date), h = 0, m = 0;
      p.forEach(function (x) { if (x.type === 'hour') h = +x.value % 24; if (x.type === 'minute') m = +x.value; });
      var d = h * 60 + m - (date.getUTCHours() * 60 + date.getUTCMinutes()); if (d > 720) d -= 1440; if (d < -720) d += 1440; return d;
    } catch (e) { return -360; }
  }
  function banffTimeString(date) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit', hour12: false }).format(date); } catch (e) { return ''; } }
  var t0 = performance.now();
  function sceneDate() {
    var now = new Date();
    if (fixedDate) { var fd = fixedDate.split('-'); now = new Date(Date.UTC(+fd[0], +fd[1] - 1, +fd[2], now.getUTCHours(), now.getUTCMinutes())); }
    if (fixedHour != null) {
      var off = banffOffsetMinutes(now), d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      return new Date(d + (fixedHour * 60 - off) * 60000);
    }
    if (demo) return new Date(now.getTime() + ((performance.now() - t0) / 60000) * 86400000);
    return now;
  }

  // ---------- sky palette by sun elevation: [elev, zenith, upper, lower, horizon] ----------
  var SKY = [
    [-18, '#04091A', '#081330', '#0E1D3C', '#15243F'],
    [-10, '#070F2A', '#12224A', '#233560', '#3D3D62'],
    [-4,  '#132650', '#2C3F78', '#6A5A8C', '#C97A66'],
    [0,   '#25508A', '#5A78AE', '#B58FA0', '#F2A66A'],
    [5,   '#3572B2', '#7DA6D6', '#C9C4C4', '#F5CE9E'],
    [16,  '#3D84C6', '#7FB2E0', '#B9D5EC', '#DDE9F1'],
    [65,  '#2B74BE', '#63A6DD', '#A9CFEC', '#CFE2F0']
  ];
  function skyColors(e) {
    var i = 0; while (i < SKY.length - 2 && e > SKY[i + 1][0]) i++;
    var a = SKY[i], b = SKY[i + 1], t = clamp((e - a[0]) / (b[0] - a[0]), 0, 1);
    return { z: mix(hex(a[1]), hex(b[1]), t), u: mix(hex(a[2]), hex(b[2]), t), l: mix(hex(a[3]), hex(b[3]), t), h: mix(hex(a[4]), hex(b[4]), t) };
  }

  // ---------- geometry ----------
  // ridges: irregular profiles (more vertices = less "cut-out" look); haze = atmospheric blend toward sky
  var RIDGES = [
    { pts: [[0,470],[45,452],[95,430],[140,438],[190,392],[235,372],[270,384],[310,362],[352,330],[386,318],[410,336],[455,352],[500,372],[535,362],[575,343],[610,352],[645,326],[690,346],[735,366],[770,352],[815,336],[850,352],[895,330],[940,306],[985,292],[1020,300],[1060,286],[1095,296],[1130,328],[1170,352],[1215,366],[1260,342],[1300,322],[1340,332],[1385,310],[1420,326],[1465,352],[1510,346],[1550,362],[1600,340]],
      day: '#93A9BD', night: '#1A2C44', haze: 0.55, snowLine: 372 },
    { pts: [[0,506],[40,486],[85,462],[125,430],[160,404],[195,392],[228,404],[262,420],[300,392],[336,362],[370,340],[405,318],[430,306],[452,296],[478,310],[505,332],[540,352],[575,376],[612,398],[650,382],[690,370],[725,392],[765,416],[805,432],[845,412],[880,388],[915,362],[950,338],[985,320],[1020,308],[1045,318],[1075,336],[1110,352],[1150,376],[1195,404],[1235,392],[1275,372],[1315,358],[1345,366],[1380,382],[1420,398],[1460,416],[1510,428],[1560,410],[1600,392]],
      day: '#5E7F97', night: '#15283F', haze: 0.28, snowLine: 340 },
    { pts: [[0,536],[60,522],[120,528],[175,514],[235,506],[290,514],[340,502],[395,492],[445,500],[500,512],[560,520],[620,508],[680,498],[740,504],[800,514],[860,506],[915,494],[975,486],[1040,494],[1110,508],[1180,518],[1250,510],[1320,500],[1390,494],[1460,502],[1530,512],[1600,506]],
      day: '#2E4D66', night: '#0F2034', haze: 0.08, snowLine: 0 }
  ];
  // precompute peaks (local maxima above snow line) for snow caps
  RIDGES.forEach(function (r) {
    r.peaks = [];
    for (var i = 1; i < r.pts.length - 1; i++) {
      var p = r.pts[i];
      if (p[1] < r.pts[i - 1][1] && p[1] < r.pts[i + 1][1] && p[1] < r.snowLine) r.peaks.push(i);
    }
  });
  var STARS = [], TREES = [], CLOUDS = [];
  (function init() {
    var i, x;
    for (i = 0; i < 220; i++) STARS.push({ x: rnd() * VW, y: rnd() * 400, r: 0.4 + rnd() * 1.2, p: rnd() * 6.28, s: 0.6 + rnd() * 0.4 });
    // three rows of conifers: far (small, dark blue), mid, near (larger, at the corners a little taller)
    var rows = [{ n: 1, base: SHORE - 10, hmin: 14, hmax: 26, step: 13 }, { n: 2, base: SHORE - 3, hmin: 22, hmax: 42, step: 15 }, { n: 3, base: SHORE + 2, hmin: 30, hmax: 58, step: 21 }];
    rows.forEach(function (row) {
      x = -20;
      while (x < VW + 20) {
        var edge = 1 + 0.5 * Math.max(0, 1 - Math.min(x, VW - x) / 260);          // taller at the edges of the frame
        TREES.push({ x: x, h: (row.hmin + rnd() * (row.hmax - row.hmin)) * edge, w: 0.28 + rnd() * 0.1, p: rnd() * 6.28, row: row.n, base: row.base + (rnd() - 0.5) * 4 });
        x += row.step + rnd() * row.step * 0.8;
      }
    });
    for (i = 0; i < 4; i++) CLOUDS.push({ x: rnd() * VW, y: 40 + rnd() * 170, s: 0.55 + rnd() * 0.6, v: 0.3 + rnd() * 0.4, o: 0.4 + rnd() * 0.35, seed: rnd() * 100 });
  })();
  function wind(t) { return 0.45 + 0.3 * Math.sin(t * 0.17) * Math.sin(t * 0.053 + 1.3) + 0.12 * Math.sin(t * 0.61 + Math.sin(t * 0.23)); }
  function bodyPos(Hdeg, elev) { return { x: VW * (0.5 + clamp(Hdeg, -150, 150) / 150 * 0.44), y: SHORE - 70 - clamp(elev, -12, 70) / 70 * (SHORE - 150) }; }

  // ---------- painters ----------
  function paintSky(c, sc) {
    var g = c.createLinearGradient(0, 0, 0, SHORE);
    g.addColorStop(0, rgb(sc.z)); g.addColorStop(0.42, rgb(sc.u)); g.addColorStop(0.78, rgb(sc.l)); g.addColorStop(1, rgb(sc.h));
    c.fillStyle = g; c.fillRect(0, 0, VW, SHORE);
  }
  function paintStars(c, night, t) {
    if (night <= 0.02) return;
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i], tw = 0.7 + 0.3 * Math.sin(t * 0.9 * s.s + s.p);
      c.fillStyle = 'rgba(255,255,255,' + (night * tw * 0.85 * (1 - s.y / 520)).toFixed(3) + ')';
      c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
    }
  }
  function paintAurora(c, night, t) {
    var a = smooth(0.6, 1, night) * 0.13; if (a <= 0) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var band = 0; band < 3; band++) {
      c.beginPath();
      var x, y;
      for (x = 0; x <= VW; x += 32) { y = 120 + band * 50 + 36 * Math.sin(x / 260 + t * 0.06 + band) + 18 * Math.sin(x / 110 - t * 0.04 + band * 2); if (x === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      for (x = VW; x >= 0; x -= 32) { y = 120 + band * 50 + 36 * Math.sin(x / 260 + t * 0.06 + band) + 18 * Math.sin(x / 110 - t * 0.04 + band * 2) - 170 - 36 * Math.sin(x / 170 + t * 0.05); c.lineTo(x, y); }
      c.closePath();
      var g = c.createLinearGradient(0, 0, 0, 320);
      g.addColorStop(0, 'rgba(120,255,190,0)'); g.addColorStop(0.55, 'rgba(90,240,170,' + (a * (0.6 + 0.4 * Math.sin(t * 0.15 + band))).toFixed(3) + ')'); g.addColorStop(1, 'rgba(160,120,255,0)');
      c.fillStyle = g; c.fill();
    }
    c.restore();
  }
  function paintSun(c, sun, t) {
    if (sun.elev < -7) return;
    var p = bodyPos(sun.H, sun.elev), low = smooth(14, -3, sun.elev);
    var col = mix(hex('#FFF9E6'), hex('#FFA85C'), low);
    var g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 320);
    g.addColorStop(0, rgb(col, 0.55)); g.addColorStop(0.18, rgb(col, 0.22)); g.addColorStop(0.5, rgb(col, 0.06)); g.addColorStop(1, rgb(col, 0));
    c.fillStyle = g; c.fillRect(p.x - 330, p.y - 330, 660, 660);
    var r = 30 + 14 * low;
    var d = c.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
    d.addColorStop(0, rgb(mix(col, hex('#FFFFFF'), 0.5))); d.addColorStop(1, rgb(col, 0.95));
    c.fillStyle = d; c.beginPath(); c.arc(p.x, p.y, r, 0, 6.283); c.fill();
  }
  function paintMoon(c, sun, night, date, sc) {
    var Hm = ((sun.H + 180 + 540) % 360) - 180, elevM = -sun.elev * 0.85 + 8;
    if (elevM < -4 || night < 0.05) return;
    var p = bodyPos(Hm, elevM), r = 24, ph = moonPhase(date), k = (1 - Math.cos(2 * Math.PI * ph)) / 2;
    var g = c.createRadialGradient(p.x, p.y, r, p.x, p.y, r * 5);
    g.addColorStop(0, 'rgba(225,235,255,' + (0.20 * night).toFixed(3) + ')'); g.addColorStop(1, 'rgba(225,235,255,0)');
    c.fillStyle = g; c.fillRect(p.x - r * 5, p.y - r * 5, r * 10, r * 10);
    c.save(); c.globalAlpha = 0.55 + 0.45 * night;
    var m = c.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.2, p.x, p.y, r);
    m.addColorStop(0, '#FBFCFF'); m.addColorStop(1, '#D9E0EE');
    c.fillStyle = m; c.beginPath(); c.arc(p.x, p.y, r, 0, 6.283); c.fill();
    c.beginPath(); c.arc(p.x, p.y, r, 0, 6.283); c.clip();
    var dir = ph < 0.5 ? -1 : 1;
    c.fillStyle = rgb(sc.u, 0.97); c.beginPath(); c.arc(p.x + dir * (2 * r * (1 - k) + 0.5), p.y, r + 1, 0, 6.283); c.fill();
    c.restore();
  }
  function paintClouds(c, light, sc, t, w) {
    for (var i = 0; i < CLOUDS.length; i++) {
      var cl = CLOUDS[i];
      cl.x += (0.06 + w * cl.v) * 0.12; if (cl.x > VW + 260) cl.x = -260;
      var lit = mix(mix(hex('#FFFFFF'), sc.h, 0.25), hex('#4C5C74'), 1 - light);
      var shade = mix(mix(sc.l, hex('#8EA3BE'), 0.4), hex('#2C3A50'), 1 - light);
      var a = cl.o * (0.5 + 0.4 * light);
      c.save(); c.translate(cl.x, cl.y); c.scale(cl.s, cl.s * 0.55);
      // shadow underside (soft)
      var sg = c.createRadialGradient(10, 34, 20, 10, 34, 150);
      sg.addColorStop(0, rgb(shade, a * 0.55)); sg.addColorStop(0.6, rgb(shade, a * 0.3)); sg.addColorStop(1, rgb(shade, 0));
      c.fillStyle = sg;
      c.beginPath(); c.arc(-70, 26, 78, 0, 6.283); c.arc(10, 30, 98, 0, 6.283); c.arc(95, 28, 82, 0, 6.283); c.fill();
      // lit body
      var g = c.createRadialGradient(-20, -30, 20, 0, 0, 150);
      g.addColorStop(0, rgb(lit, a)); g.addColorStop(0.7, rgb(lit, a * 0.85)); g.addColorStop(1, rgb(lit, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(-80, 6, 74, 0, 6.283); c.arc(-10, -14, 96, 0, 6.283); c.arc(70, -2, 86, 0, 6.283); c.arc(120, 18, 64, 0, 6.283); c.fill();
      c.restore();
    }
  }
  function paintRidges(c, light, sun, sc) {
    var glow = smooth(-6, 0, sun.elev) * smooth(11, 3, sun.elev);           // alpenglow window
    var sunx = bodyPos(sun.H, sun.elev).x;
    for (var i = 0; i < RIDGES.length; i++) {
      var r = RIDGES[i];
      var base = mix(hex(r.night), hex(r.day), light);
      base = mix(base, hex('#D9866A'), glow * (0.42 - i * 0.1));
      var hazeCol = mix(sc.h, sc.l, 0.4);
      var col = mix(base, hazeCol, r.haze * (0.55 + 0.45 * light));          // atmospheric perspective
      var pts = r.pts.slice(); pts.push([VW, SHORE + 6]); pts.push([0, SHORE + 6]);
      // body: vertical gradient, lighter near the crest
      var minY = 9999; r.pts.forEach(function (p) { if (p[1] < minY) minY = p[1]; });
      var g = c.createLinearGradient(0, minY, 0, SHORE);
      g.addColorStop(0, rgb(mix(col, hex('#FFFFFF'), 0.10 * light))); g.addColorStop(1, rgb(mix(col, hex('#0A1826'), 0.22)));
      c.fillStyle = g; poly(c, pts); c.fill();
      // facets: faces turned toward the sun are lighter, the others darker
      for (var k = 0; k < r.pts.length - 1; k++) {
        var p1 = r.pts[k], p2 = r.pts[k + 1];
        var slopeDown = p2[1] > p1[1];                                          // going right, downhill
        var faceX = (p1[0] + p2[0]) / 2, towardSun = (sunx > faceX) === slopeDown;
        var strength = Math.abs(p2[1] - p1[1]) / 60;
        var alpha = clamp(strength, 0.15, 1) * (towardSun ? 0.12 * light + 0.03 * glow : 0.14);
        c.fillStyle = towardSun ? 'rgba(255,240,220,' + alpha.toFixed(3) + ')' : 'rgba(10,22,40,' + alpha.toFixed(3) + ')';
        poly(c, [p1, p2, [p2[0], SHORE + 6], [p1[0], SHORE + 6]]); c.fill();
      }
      // snow caps on the peaks above the snow line
      if (r.peaks.length) {
        var snow = mix(mix(hex('#2A3F5C'), hex('#F5F7FA'), light), hex('#F6A98C'), glow * 0.9);
        var snowShade = mix(snow, hex('#7F94B4'), 0.35);
        for (var q = 0; q < r.peaks.length; q++) {
          var pi = r.peaks[q], P = r.pts[pi], L = r.pts[pi - 1], R = r.pts[pi + 1];
          var depth = Math.min(48, (r.snowLine - P[1]) * 0.9 + 18);
          var lx = P[0] + (L[0] - P[0]) * clamp(depth / (L[1] - P[1] || 1), 0, 1), ly = P[1] + depth;
          var rx = P[0] + (R[0] - P[0]) * clamp(depth / (R[1] - P[1] || 1), 0, 1), ry = P[1] + depth;
          var cap = [P, [lx, ly], [lx + (P[0] - lx) * 0.3, ly - 6], [P[0] - 3, ly - 2], [P[0] + 5, ly - 7], [rx - (rx - P[0]) * 0.35, ry - 4], [rx, ry]];
          c.fillStyle = rgb(snow); poly(c, cap); c.fill();
          c.fillStyle = rgb(snowShade, 0.55); poly(c, [P, [sunx > P[0] ? lx : rx, ly], [P[0], ly - 3]]); c.fill();
        }
      }
    }
  }
  function paintTrees(c, light, t, w) {
    for (var row = 1; row <= 3; row++) {
      var col = row === 1 ? mix(hex('#0B1A24'), hex('#233E3A'), light) : row === 2 ? mix(hex('#08151C'), hex('#183129'), light) : mix(hex('#050F14'), hex('#10251E'), light);
      c.fillStyle = rgb(col);
      for (var i = 0; i < TREES.length; i++) {
        var tr = TREES[i]; if (tr.row !== row) continue;
        var sway = (1.5 + w * 4) * Math.sin(t * 0.55 + tr.p + tr.x / 180) * (tr.h / 40);
        var tiers = 4, hw = tr.h * tr.w;
        c.beginPath(); c.moveTo(tr.x - 1.2, tr.base); c.lineTo(tr.x + 1.2, tr.base);
        for (var k = 0; k < tiers; k++) {                                        // stacked tiers, each narrower
          var y0 = tr.base - tr.h * (0.25 + 0.75 * k / tiers), y1 = tr.base - tr.h * (0.25 + 0.75 * (k + 1) / tiers);
          var ww = hw * (1 - k / tiers * 0.72), sx = sway * ((k + 1) / tiers) * ((k + 1) / tiers);
          c.lineTo(tr.x + ww + sx * 0.6, y0); c.lineTo(tr.x + sx, y1);
        }
        for (k = tiers - 1; k >= 0; k--) {
          var y0b = tr.base - tr.h * (0.25 + 0.75 * k / tiers), y1b = tr.base - tr.h * (0.25 + 0.75 * (k + 1) / tiers);
          var wwb = hw * (1 - k / tiers * 0.72), sxb = sway * ((k + 1) / tiers) * ((k + 1) / tiers);
          c.lineTo(tr.x + sxb, y1b); c.lineTo(tr.x - wwb + sxb * 0.6, y0b);
        }
        c.closePath(); c.fill();
      }
    }
    c.fillStyle = rgb(mix(hex('#050F14'), hex('#10251E'), light)); c.fillRect(0, SHORE - 6, VW, 12);
  }
  function paintMist(c, light, night, t) {
    var a = 0.16 * (1 - light) + 0.05;                                            // low mist over the water at dawn/dusk/night
    var g = c.createLinearGradient(0, SHORE - 40, 0, SHORE + 30);
    g.addColorStop(0, 'rgba(210,225,240,0)'); g.addColorStop(0.5, 'rgba(210,225,240,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(210,225,240,0)');
    c.save(); c.translate(18 * Math.sin(t * 0.05), 0); c.fillStyle = g; c.fillRect(-40, SHORE - 40, VW + 80, 70); c.restore();
  }
  function paintLake(c, light, night, sc, sun, t, w) {
    // 1) low-res copy of the scene for a naturally soft reflection
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, refl.width, refl.height);
    rctx.drawImage(top, 0, 0, top.width, top.height, 0, 0, refl.width, refl.height);
    // 2) base water colour
    var depth = VH - SHORE;
    var wc = mix(hex('#0A1F30'), hex('#2C6F86'), light);
    var g = c.createLinearGradient(0, SHORE, 0, VH);
    g.addColorStop(0, rgb(mix(wc, sc.h, 0.45))); g.addColorStop(1, rgb(mix(wc, hex('#0A1E2C'), 0.55)));
    c.fillStyle = g; c.fillRect(0, SHORE, VW, depth);
    // 3) mirrored, gently swelling reflection
    var strips = 36, sh = depth / strips;
    c.save(); c.globalAlpha = 0.42 + 0.14 * light;
    c.imageSmoothingEnabled = true;
    for (var i = 0; i < strips; i++) {
      var y = SHORE + i * sh, d = i / strips;
      // long, slow swells: two low-frequency waves, amplitude growing away from the shore
      var dx = (1.5 + 7 * d) * (0.6 + 0.5 * w) * Math.sin(y * 0.021 + t * 0.32) + (0.8 + 3 * d) * Math.sin(y * 0.047 - t * 0.21 + 1.7);
      var stretch = 1.18 + 0.05 * Math.sin(t * 0.18 + i * 0.3);
      var srcY = SHORE - (y - SHORE) * stretch, srcH = sh * stretch;
      if (srcY - srcH < 0) continue;
      c.drawImage(refl, 0, (srcY - srcH) * refl.height / SHORE, refl.width, srcH * refl.height / SHORE, dx, y, VW, sh + 0.7);
    }
    c.restore();
    // 4) soft light path under the sun or moon, breathing slowly
    var body = sun.elev > -4 ? bodyPos(sun.H, sun.elev) : (night > 0.05 ? bodyPos(((sun.H + 180 + 540) % 360) - 180, -sun.elev * 0.85 + 8) : null);
    if (body) {
      var low = sun.elev > -4 ? smooth(30, -2, sun.elev) : 0.6;
      var gc = sun.elev > -4 ? mix(hex('#FFF3CF'), hex('#FFB067'), smooth(14, -3, sun.elev)) : hex('#D8E4FF');
      var gl = c.createLinearGradient(body.x, SHORE, body.x, VH);
      var amp = (0.08 + 0.22 * low) * (0.85 + 0.15 * Math.sin(t * 0.25));
      c.save(); c.globalCompositeOperation = 'lighter';
      gl.addColorStop(0, rgb(gc, amp)); gl.addColorStop(0.6, rgb(gc, amp * 0.35)); gl.addColorStop(1, rgb(gc, 0));
      c.fillStyle = gl;
      c.beginPath(); c.moveTo(body.x - 14, SHORE); c.lineTo(body.x + 14, SHORE); c.lineTo(body.x + 90, VH); c.lineTo(body.x - 90, VH); c.closePath(); c.fill();
      for (var j = 0; j < 14; j++) {                                            // a few slow glints
        var yy = SHORE + 12 + j * 9.5, spread = 10 + j * 5.5;
        var xx = body.x + spread * Math.sin(t * 0.45 + j * 1.9), len = 14 + 26 * (0.5 + 0.5 * Math.sin(t * 0.7 + j * 0.8));
        c.fillStyle = rgb(gc, (0.03 + 0.12 * low) * (0.5 + 0.5 * Math.sin(t * 0.9 + j * 1.3)));
        c.fillRect(xx - len / 2, yy, len, 1.4);
      }
      c.restore();
    }
    // 5) a few long, slow surface ripples
    c.strokeStyle = 'rgba(255,255,255,' + (0.035 + 0.045 * light).toFixed(3) + ')'; c.lineWidth = 1;
    for (var k = 0; k < 5; k++) {
      var ry = SHORE + 26 + k * 26;
      c.beginPath();
      for (var x = 20; x <= VW - 20; x += 24) { var yv = ry + 1.8 * Math.sin(x * 0.012 + t * 0.35 + k * 1.4) + 0.8 * Math.sin(x * 0.03 - t * 0.2); if (x === 20) c.moveTo(x, yv); else c.lineTo(x, yv); }
      c.stroke();
    }
    // 6) near-shore darkening and depth
    var dk = c.createLinearGradient(0, SHORE, 0, VH);
    dk.addColorStop(0, 'rgba(6,20,34,' + (0.05 + 0.2 * night).toFixed(3) + ')'); dk.addColorStop(1, 'rgba(6,20,34,' + (0.28 + 0.3 * night).toFixed(3) + ')');
    c.fillStyle = dk; c.fillRect(0, SHORE, VW, depth);
  }
  function paintScrim(c, light) {
    var a0 = lerp(0.72, 0.58, light), a1 = lerp(0.36, 0.16, light);
    var g = c.createLinearGradient(0, 0, VW * 0.72, 0);
    g.addColorStop(0, 'rgba(12,32,56,' + a0.toFixed(2) + ')'); g.addColorStop(0.55, 'rgba(12,32,56,' + a1.toFixed(2) + ')'); g.addColorStop(1, 'rgba(12,32,56,0)');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    var v = c.createRadialGradient(VW * 0.55, VH * 0.45, VH * 0.3, VW * 0.55, VH * 0.45, VW * 0.75);   // gentle vignette
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = v; c.fillRect(0, 0, VW, VH);
  }

  function frame(now) {
    var t = now / 1000, date = sceneDate(), sun = solar(date);
    var light = smooth(-8, 8, sun.elev), night = smooth(2, -10, sun.elev), sc = skyColors(sun.elev), w = wind(t);
    tctx.setTransform(S * DPR, 0, 0, S * DPR, 0, 0);
    tctx.clearRect(0, 0, VW, SHORE);
    paintSky(tctx, sc);
    paintStars(tctx, night, t);
    paintAurora(tctx, night, t);
    paintMoon(tctx, sun, night, date, sc);
    paintSun(tctx, sun, t);
    paintClouds(tctx, light, sc, t, w);
    paintRidges(tctx, light, sun, sc);
    paintMist(tctx, light, night, t);
    paintTrees(tctx, light, t, w);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(S * DPR, 0, 0, S * DPR, OX * DPR, OY * DPR);
    ctx.drawImage(top, 0, 0, top.width, top.height, 0, 0, VW, SHORE);
    paintLake(ctx, light, night, sc, sun, t, w);
    paintScrim(ctx, light);
    if (clockEl) { var s = banffTimeString(date); if (s && clockEl.textContent !== 'Banff time ' + s) clockEl.textContent = 'Banff time ' + s; }
  }

  var running = false, visible = true, rafId = 0, last = 0;
  function loop(now) {
    if (!running) return;
    if (now - last >= 33) { last = now; frame(now); }                              // ~30 fps is plenty for a calm scene
    rafId = requestAnimationFrame(loop);
  }
  function start() { if (running || reduceMotion) return; running = true; rafId = requestAnimationFrame(loop); }
  function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); }

  resize();
  if (fallback) fallback.style.display = 'none';
  canvas.style.opacity = '1';
  frame(performance.now());
  if (reduceMotion) { setInterval(function () { frame(performance.now()); }, 60000); }
  else {
    start();
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (visible) start(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); else stop(); }, { threshold: 0.02 }).observe(hero);
  }
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { resize(); frame(performance.now()); }, 120); });
})();
