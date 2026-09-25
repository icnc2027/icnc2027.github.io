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

  // ---------- geometry (original flat-polygon ridges) ----------
  var RIDGES = [
    { pts: [[0,500],[120,380],[240,445],[380,310],[500,405],[630,335],[770,420],[900,345],[1080,285],[1200,400],[1370,320],[1490,385],[1600,340]], day: '#9EB6C8', night: '#1B2D45' },
    { pts: [[0,470],[160,355],[290,420],[450,300],[570,400],[700,350],[860,450],[1020,320],[1150,405],[1290,355],[1430,430],[1600,380]], day: '#56788F', night: '#162A40' },
    { pts: [[0,520],[130,470],[260,525],[390,475],[550,540],[700,480],[850,530],[1010,470],[1220,545],[1380,485],[1600,540]], day: '#22425C', night: '#0F2034' }
  ];
  var SNOW = [
    [[450,300],[418,348],[433,340],[446,356],[462,340],[477,350],[486,340]],
    [[1020,320],[992,362],[1005,356],[1017,370],[1032,355],[1046,364],[1054,353]],
    [[160,355],[140,385],[152,380],[162,392],[175,381],[184,386]],
    [[1080,285],[1056,318],[1068,313],[1080,326],[1094,314],[1104,320]],
    [[380,310],[360,340],[372,336],[382,348],[394,337],[402,342]]
  ];
  var NEAR = RIDGES[2].pts;
  function ridgeY(x) {                                   // height of the foreground ridge at x
    for (var i = 0; i < NEAR.length - 1; i++) {
      var a = NEAR[i], b = NEAR[i + 1];
      if (x >= a[0] && x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
    return SHORE;
  }
  var STARS = [], TREES = [], CLOUDS = [];
  (function init() {
    var i, x;
    for (i = 0; i < 220; i++) STARS.push({ x: rnd() * VW, y: rnd() * 400, r: 0.4 + rnd() * 1.2, p: rnd() * 6.28, s: 0.6 + rnd() * 0.4 });
    var xx = -10;
    while (xx < VW + 10) { TREES.push({ x: xx, h: 24 + rnd() * 26, w: 7 + rnd() * 5, p: rnd() * 6.28, row: 1 }); xx += 16 + rnd() * 7; }
    xx = -10;
    while (xx < VW + 10) { TREES.push({ x: xx, h: 16 + rnd() * 16, w: 5 + rnd() * 4, p: rnd() * 6.28, row: 0 }); xx += 22 + rnd() * 10; }
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
    var glow = smooth(-5, 0, sun.elev) * smooth(12, 3, sun.elev);            // alpenglow around sunrise / sunset
    for (var i = 0; i < RIDGES.length; i++) {
      var r = RIDGES[i], col = mix(hex(r.night), hex(r.day), light);
      col = mix(col, hex('#D98A6B'), glow * (0.35 - i * 0.08));
      c.fillStyle = rgb(col);
      var pts = r.pts.slice(); pts.push([VW, SHORE + 5]); pts.push([0, SHORE + 5]);
      poly(c, pts); c.fill();
      if (i === 1) {
        var snow = mix(mix(hex('#1E2F4A'), hex('#F3F6F9'), light), hex('#F7A98A'), glow * 0.85);
        c.fillStyle = rgb(snow);
        for (var q = 0; q < SNOW.length; q++) { poly(c, SNOW[q]); c.fill(); }
      }
    }
  }
  function paintTrees(c, light, t, w) {
    for (var row = 0; row < 2; row++) {
      var col = row === 0 ? mix(hex('#07141A'), hex('#10261F'), light) : mix(hex('#050F14'), hex('#16302A'), light);
      c.fillStyle = rgb(col);
      for (var i = 0; i < TREES.length; i++) {
        var tr = TREES[i]; if (tr.row !== row) continue;
        var sway = (w * 6 + 2) * Math.sin(t * 1.5 + tr.p + tr.x / 140) * (tr.h / 40);
        var base = row === 0 ? SHORE - 6 : SHORE;
        c.beginPath();
        c.moveTo(tr.x - tr.w, base); c.lineTo(tr.x - tr.w * 0.5 + sway * 0.35, base - tr.h * 0.55); c.lineTo(tr.x + sway, base - tr.h);
        c.lineTo(tr.x + tr.w * 0.5 + sway * 0.35, base - tr.h * 0.55); c.lineTo(tr.x + tr.w, base); c.closePath(); c.fill();
      }
    }
    c.fillStyle = rgb(mix(hex('#050F14'), hex('#16302A'), light)); c.fillRect(0, SHORE - 8, VW, 10);
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


  // =====================================================================
  //  Characters (cartoon scale on purpose — real scale would be a dot)
  // =====================================================================
  var BEAR_MIN = 640, BEAR_MAX = 1330;                                        // stays inside the view on all screens
  var bears = { x: 1050, dir: 1, phase: 0, mode: 'walk', y: 0, alpha: 1, inForest: false,
                cubs: [{ x: 1010, y: 0, ph: 1.2, v: 0, dir: 1 }, { x: 975, y: 0, ph: 2.6, v: 0, dir: 1 }] };
  var lastT = null;

  function drawBear(c, x, y, dir, scale, phase, sniff, light, cub, alpha) {
    var fur   = mix(hex('#3A2612'), cub ? hex('#8A6238') : hex('#6A4626'), light);
    var dark  = mix(hex('#24160A'), cub ? hex('#5E4022') : hex('#46301A'), light);
    var pale  = mix(hex('#5A4632'), hex('#C8A67C'), light);
    var tip   = mix(hex('#4A3520'), hex('#B08B5E'), light);          // grizzled hump tips
    var still = sniff ? 0 : 1;
    var bob = 0.8 * Math.sin(phase * 2) * still;
    var hd = sniff ? 7 : 0, hf = sniff ? 3 : 0;                           // head drops and reaches forward when sniffing
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(x, y); c.scale(dir * scale, scale);
  
    // thick legs: [hipX, phase]; far pair first (darker), near pair after the body
    function leg(hx, ph, far) {
      var sw = 7 * Math.sin(phase + ph) * still, lift = Math.max(0, Math.sin(phase + ph)) * 2.5 * still;
      var top = -16 + bob, w = 5.5;
      c.fillStyle = rgb(far ? dark : fur);
      c.beginPath();
      c.moveTo(hx - w, top); c.lineTo(hx + w, top);
      c.lineTo(hx + w + sw * 0.9, -4 - lift); c.lineTo(hx + w + sw + 2.5, -1.5 - lift);   // paw front
      c.quadraticCurveTo(hx + sw, -lift + 1, hx - w + sw - 2, -1.5 - lift);              // paw sole
      c.lineTo(hx - w + sw * 0.9, -4 - lift); c.closePath(); c.fill();
    }
    leg(-13 + 4, Math.PI, true);   // far rear
    leg(15 + 4, 0, true);          // far front
  
    // body + head as one silhouette
    c.fillStyle = rgb(fur);
    c.beginPath();
    c.moveTo(-27, -14 + bob);                                             // rump, low
    c.bezierCurveTo(-30, -24 + bob, -22, -31 + bob, -12, -33 + bob);      // up the back
    c.bezierCurveTo(-6, -36 + bob, 2, -36 + bob, 8, -32 + bob);           // shoulder hump (highest point)
    c.bezierCurveTo(12, -30 + bob, 15, -29 + bob, 18, -29 + bob + hd*0.4);// neck
    c.bezierCurveTo(22, -32 + bob + hd*0.6, 27, -31 + bob + hd, 30, -27.5 + bob + hd); // crown of head
    c.bezierCurveTo(34, -24 + bob + hd, 37 + hf, -21 + bob + hd, 39 + hf, -18.5 + bob + hd); // dished face to nose
    c.bezierCurveTo(38.3 + hf, -15 + bob + hd, 34.5 + hf, -13.2 + bob + hd, 30, -12.8 + bob + hd); // under jaw
    c.bezierCurveTo(26, -12 + bob + hd*0.5, 22, -11.5 + bob, 19, -10.8 + bob);   // throat
    c.bezierCurveTo(14, -9 + bob, -14, -8 + bob, -22, -9.5 + bob);        // belly
    c.bezierCurveTo(-26, -10.5 + bob, -28, -12 + bob, -27, -14 + bob);    // rump
    c.closePath(); c.fill();
  
    // grizzled tips on the hump
    c.fillStyle = rgb(tip, 0.28);
    c.beginPath(); c.ellipse(-2, -31 + bob, 12, 4.2, 0, Math.PI, 0); c.closePath(); c.fill();
    // ears (small, round, set back on the head)
    c.fillStyle = rgb(fur);
    c.beginPath(); c.arc(21, -30.5 + bob + hd*0.7, 3.1, 0, 6.283); c.arc(27, -31 + bob + hd, 3.1, 0, 6.283); c.fill();
    c.fillStyle = rgb(dark, 0.45);
    c.beginPath(); c.arc(21, -30.5 + bob + hd*0.7, 1.4, 0, 6.283); c.arc(27, -31 + bob + hd, 1.4, 0, 6.283); c.fill();
    // pale muzzle: rounded patch inside the face, widest at the cheek
    c.fillStyle = rgb(pale);
    c.beginPath();
    c.moveTo(30, -25 + bob + hd);
    c.bezierCurveTo(34 + hf, -24 + bob + hd, 38 + hf, -21.5 + bob + hd, 39 + hf, -18.5 + bob + hd);
    c.bezierCurveTo(38.3 + hf, -15.5 + bob + hd, 34.5 + hf, -13.8 + bob + hd, 30.5, -13.6 + bob + hd);
    c.bezierCurveTo(27.5, -14.5 + bob + hd, 26.5, -21 + bob + hd, 30, -25 + bob + hd);
    c.closePath(); c.fill();
    // mouth line
    c.strokeStyle = rgb(dark, 0.55); c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(38.2 + hf, -16.2 + bob + hd); c.quadraticCurveTo(35.5 + hf, -15 + bob + hd, 33 + hf, -15.6 + bob + hd); c.stroke();
    // nose and eye
    c.fillStyle = rgb(dark); c.beginPath(); c.arc(38.6 + hf, -18.6 + bob + hd, 1.7, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(15,10,5,0.95)'; c.beginPath(); c.arc(30, -24.5 + bob + hd*0.9, 1.15, 0, 6.283); c.fill();
  
    leg(-13, Math.PI, false);      // near rear
    leg(15, 0, false);             // near front
    c.restore();
  }
  // life cycle (period 150 s): on the shore -> into the forest (fade out behind the trees) -> away -> back out somewhere else
  function updateBears(t, dt) {
    var CY = 150, p = t % CY, cyc = Math.floor(t / CY);
    var stage = p < 92 ? 'shore' : p < 100 ? 'enter' : p < 132 ? 'away' : p < 140 ? 'exit' : 'shore';
    var newX = 700 + ((cyc * 613) % 560);                                   // where they reappear
    bears.inForest = stage !== 'shore';
    if (stage === 'shore') {
      var q = (t + 11) % 38; bears.mode = q < 30 ? 'walk' : 'sniff';
      bears.y = 0; bears.alpha = 1;
      if (bears.mode === 'walk') {
        bears.x += bears.dir * 11 * dt; bears.phase += 11 * dt * 0.2;
        if (bears.x > BEAR_MAX) { bears.x = BEAR_MAX; bears.dir = -1; }
        if (bears.x < BEAR_MIN) { bears.x = BEAR_MIN; bears.dir = 1; }
      }
    } else if (stage === 'enter') {
      var f = (p - 92) / 8; bears.mode = 'walk'; bears.y = -14 * f; bears.alpha = 1 - smooth(0.35, 1, f);
      bears.x += bears.dir * 5 * dt; bears.phase += 9 * dt * 0.2;
    } else if (stage === 'away') {
      bears.alpha = 0; bears.x = newX; bears.dir = newX > 1000 ? -1 : 1; bears.y = -14;
      for (var k = 0; k < bears.cubs.length; k++) { bears.cubs[k].x = newX - bears.dir * (30 + k * 24); bears.cubs[k].y = -14; }
    } else if (stage === 'exit') {
      var g = (p - 132) / 8; bears.mode = 'walk'; bears.y = -14 * (1 - g); bears.alpha = smooth(0, 0.65, g);
      bears.x += bears.dir * 5 * dt; bears.phase += 9 * dt * 0.2;
    }
    for (var i = 0; i < bears.cubs.length; i++) {
      var cub = bears.cubs[i], target = bears.x - bears.dir * (32 + i * 26) + 6 * Math.sin(t * 0.3 + cub.ph);
      var dx = target - cub.x, step = clamp(dx * 1.8 * dt, -22 * dt, 22 * dt);
      cub.x += step; cub.v = Math.abs(step / dt); cub.dir = Math.abs(dx) > 3 ? (dx > 0 ? 1 : -1) : bears.dir;
      cub.ph += cub.v * dt * 0.28;
      var hop = Math.sin(t * 0.9 + cub.ph * 0.1) > 0.97 && stage === 'shore';
      cub.y = bears.y + (hop ? -3 * Math.abs(Math.sin(t * 6)) : 0);
    }
  }
  function paintBears(c, light, t, behindTrees) {
    if (bears.inForest !== behindTrees || bears.alpha <= 0) return;
    var y = SHORE + 1;
    for (var i = bears.cubs.length - 1; i >= 0; i--) {
      var cub = bears.cubs[i];
      drawBear(c, cub.x, y + cub.y, cub.dir, 0.32, cub.ph, cub.v < 1 && bears.mode === 'sniff', light, true, bears.alpha);
    }
    drawBear(c, bears.x, y + bears.y, bears.dir, 0.52, bears.phase, bears.mode === 'sniff', light, false, bears.alpha);
  }

  // ---------- hikers on the low peak; dome tent pitched on the slope ----------
  var TRAIL = [[1292, ridgeY(1292)], [1336, ridgeY(1336)], [1380, 485], [1424, ridgeY(1424)]];
  var TRAIL_LEN = []; (function () { var L = 0; TRAIL_LEN.push(0); for (var i = 1; i < TRAIL.length; i++) { L += Math.hypot(TRAIL[i][0] - TRAIL[i - 1][0], TRAIL[i][1] - TRAIL[i - 1][1]); TRAIL_LEN.push(L); } })();
  var TRAIL_TOTAL = TRAIL_LEN[TRAIL_LEN.length - 1];
  function trailPoint(s) {
    s = clamp(s, 0, TRAIL_TOTAL);
    for (var i = 1; i < TRAIL.length; i++) if (s <= TRAIL_LEN[i]) {
      var f = (s - TRAIL_LEN[i - 1]) / (TRAIL_LEN[i] - TRAIL_LEN[i - 1] || 1);
      return [lerp(TRAIL[i - 1][0], TRAIL[i][0], f), lerp(TRAIL[i - 1][1], TRAIL[i][1], f)];
    }
    return TRAIL[TRAIL.length - 1];
  }
  var HIKERS = [
    { skin: '#8D5524', hat: '#2B2B2B', jacket: '#D9482B', pants: '#3C4A5C', boots: '#2A2118', pack: '#2F5D8C' },
    { skin: '#E8B58F', hat: '#C9A227', jacket: '#2E7DBF', pants: '#6B5B3E', boots: '#3B2A1C', pack: '#8E3B3B' },
    { skin: '#C68642', hat: '#4E7A4A', jacket: '#E3B341', pants: '#2F3B4C', boots: '#2A2118', pack: '#3F6B4F' }
  ];
  var HK = 0.62;                                                              // hiker scale
  var CAMP = { x: 1258, y: ridgeY(1258), ang: Math.atan2(ridgeY(1276) - ridgeY(1240), 36) };
  function drawHiker(c, x, y, dir, phase, moving, hk, light, wave, sit) {
    var dim = 0.55 * (1 - light), shade = function (h) { return rgb(mix(hex(h), hex('#101820'), dim)); };
    c.save(); c.translate(x, y); c.scale(dir * HK, HK);
    var bob = moving ? 1.2 * Math.abs(Math.sin(phase)) : 0, l1 = moving ? 5 * Math.sin(phase) : 0, l2 = -l1;
    c.lineCap = 'round';
    if (sit) {                                                                // seated by the fire
      c.strokeStyle = shade(hk.pants); c.lineWidth = 3.2;
      c.beginPath(); c.moveTo(-1, -12); c.lineTo(6, -9); c.lineTo(8, -1); c.stroke();
      c.beginPath(); c.moveTo(1, -12); c.lineTo(8, -8); c.lineTo(10, -1); c.stroke();
      c.strokeStyle = shade(hk.boots); c.lineWidth = 3.4; c.beginPath(); c.moveTo(8, -1); c.lineTo(11, -1); c.stroke();
      c.fillStyle = shade(hk.jacket); c.beginPath(); c.roundRect(-4, -24, 8, 13, 2); c.fill();
      c.fillStyle = shade(hk.skin); c.beginPath(); c.arc(1, -28, 3.8, 0, 6.283); c.fill();
      c.fillStyle = shade(hk.hat); c.beginPath(); c.arc(1, -30, 4, Math.PI, 0); c.fill();
      c.strokeStyle = shade(hk.skin); c.lineWidth = 2; c.beginPath(); c.moveTo(3, -19); c.lineTo(9, -15); c.stroke();
      c.restore(); return;
    }
    // legs (pants) + boots
    c.strokeStyle = shade(hk.pants); c.lineWidth = 3;
    c.beginPath(); c.moveTo(-1, -10 + bob); c.lineTo(-1 + l1, -2); c.stroke();
    c.beginPath(); c.moveTo(2, -10 + bob); c.lineTo(2 + l2, -2); c.stroke();
    c.strokeStyle = shade(hk.boots); c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(-1 + l1, -2); c.lineTo(0.5 + l1, 0); c.stroke();
    c.beginPath(); c.moveTo(2 + l2, -2); c.lineTo(3.5 + l2, 0); c.stroke();
    // backpack, jacket, head, hat
    c.fillStyle = shade(hk.pack); c.beginPath(); c.roundRect(-7.5, -22 + bob, 5, 11, 1.5); c.fill();
    c.fillStyle = shade(hk.jacket); c.beginPath(); c.roundRect(-3.5, -23 + bob, 8, 14, 2); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0.2, -22 + bob, 1, 12);   // zip line
    c.fillStyle = shade(hk.skin); c.beginPath(); c.arc(1, -27 + bob, 3.8, 0, 6.283); c.fill();
    c.fillStyle = shade(hk.hat); c.beginPath(); c.arc(1, -29 + bob, 4.2, Math.PI, 0); c.fill(); c.fillRect(-3.2, -29.5 + bob, 9.5, 1.6);
    // arm: waving, or holding a pole
    c.strokeStyle = shade(hk.jacket); c.lineWidth = 2.4;
    if (wave) { c.beginPath(); c.moveTo(3, -19 + bob); c.lineTo(8, -30 + bob + 2 * Math.sin(phase * 3)); c.stroke(); }
    else {
      var a = moving ? 3 * Math.sin(phase + Math.PI) : 2;
      c.beginPath(); c.moveTo(3, -19 + bob); c.lineTo(7 + a, -12 + bob); c.stroke();
      c.strokeStyle = shade(hk.skin); c.lineWidth = 1.8; c.beginPath(); c.moveTo(6.5 + a, -12.5 + bob); c.lineTo(7.5 + a, -11.5 + bob); c.stroke();
      c.strokeStyle = '#8C9AA8'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(7 + a, -12 + bob); c.lineTo(9 + a, 0); c.stroke();
    }
    c.restore();
  }
  function drawTent(c, x, y, ang, glow, night, t) {
    var flick = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    c.save(); c.translate(x, y); c.rotate(ang);                              // base follows the slope
    if (glow > 0) {
      var g = c.createRadialGradient(0, -6, 3, 0, -6, 60);
      g.addColorStop(0, 'rgba(255,200,110,' + (0.32 * glow * flick).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,200,110,0)');
      c.fillStyle = g; c.fillRect(-60, -66, 120, 72);
    }
    var fabric = mix(hex('#4B2A14'), hex('#E0873A'), 1 - night * 0.7), lit = mix(fabric, hex('#FFD27A'), glow * 0.9);
    c.fillStyle = 'rgba(15,26,36,0.55)'; c.beginPath(); c.ellipse(1, 0.5, 19, 2.2, 0, 0, 6.283); c.fill();   // ground shadow
    c.fillStyle = rgb(lit); c.beginPath(); c.ellipse(0, 0, 17, 12, 0, Math.PI, 0); c.closePath(); c.fill();   // dome
    c.strokeStyle = rgb(mix(lit, hex('#000000'), 0.28)); c.lineWidth = 0.9;                                  // pole seams
    c.beginPath(); c.ellipse(0, 0, 9, 12, 0, Math.PI, 0); c.stroke();
    c.beginPath(); c.moveTo(-17, 0); c.quadraticCurveTo(0, -14, 17, 0); c.stroke();
    c.fillStyle = rgb(mix(lit, hex('#000000'), 0.42)); c.beginPath(); c.ellipse(4, 0, 5.5, 8, 0, Math.PI, 0); c.closePath(); c.fill();  // door
    if (glow > 0) { c.fillStyle = 'rgba(255,228,160,' + (0.9 * glow * flick).toFixed(3) + ')'; c.beginPath(); c.arc(4, -6, 1.4, 0, 6.283); c.fill(); }
    c.fillStyle = rgb(mix(hex('#9AA4AE'), hex('#3B4652'), night)); c.fillRect(-1.5, -12.5, 3, 1.2);   // vent
    c.restore();
  }
  function drawFire(c, x, y, a, t) {
    if (a <= 0) return;
    var g = c.createRadialGradient(x, y - 3, 1, x, y - 3, 30);
    g.addColorStop(0, 'rgba(255,170,70,' + (0.4 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = g; c.fillRect(x - 30, y - 33, 60, 36);
    c.fillStyle = 'rgba(70,45,30,0.95)'; c.fillRect(x - 4.5, y - 1.5, 9, 1.8);
    for (var i = 0; i < 3; i++) {
      var h = 4 + 3 * Math.abs(Math.sin(t * 9 + i * 2.1)), w = 1.8 - i * 0.4;
      c.fillStyle = i === 2 ? 'rgba(255,240,170,' + (0.9 * a).toFixed(2) + ')' : 'rgba(255,' + (150 + 40 * i) + ',60,' + (0.85 * a).toFixed(2) + ')';
      c.beginPath(); c.moveTo(x - w * 2, y - 1.5); c.quadraticCurveTo(x - w, y - h * 0.6, x + 0.4 * Math.sin(t * 11 + i), y - h - 1.5 * i); c.quadraticCurveTo(x + w, y - h * 0.6, x + w * 2, y - 1.5); c.closePath(); c.fill();
    }
  }
  function paintHikers(c, light, night, sun, t) {
    var hiking = sun.elev > 4, glow = smooth(3, -4, sun.elev);
    drawTent(c, CAMP.x, CAMP.y, CAMP.ang, glow, night, t);
    if (hiking) {
      var T = 64, p = t % T, s, moving = true, wave = false;
      if (p < 24) s = TRAIL_TOTAL * p / 24;
      else if (p < 30) { s = TRAIL_TOTAL; moving = false; wave = true; }
      else if (p < 54) s = TRAIL_TOTAL * (1 - (p - 30) / 24);
      else { s = 0; moving = false; }
      var dir = (p < 30) ? 1 : -1;
      for (var i = 0; i < HIKERS.length; i++) {
        var pt = trailPoint(s - dir * i * 13);
        drawHiker(c, pt[0], pt[1], dir, t * 6 + i * 1.1, moving, HIKERS[i], light, wave && i === 0, false);
      }
    } else {
      var fx = CAMP.x + 34;
      drawFire(c, fx, ridgeY(fx) + 0.5, glow, t);
      drawHiker(c, CAMP.x + 22, ridgeY(CAMP.x + 22) + 0.5, 1, 0, false, HIKERS[0], light, false, true);
      drawHiker(c, CAMP.x + 48, ridgeY(CAMP.x + 48) + 0.5, -1, 0, false, HIKERS[1], light, false, true);
    }
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
    var dt = lastT == null ? 0.033 : Math.min(0.1, t - lastT); lastT = t;
    updateBears(t, dt);
    paintBears(tctx, light, t, true);          // in the forest: behind the trees
    paintTrees(tctx, light, t, w);
    paintHikers(tctx, light, night, sun, t);
    paintBears(tctx, light, t, false);         // on the shore: in front

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
