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
  var BEAR_MIN = 700, BEAR_MAX = 1540;
  var bears = { x: 1050, dir: 1, phase: 0, mode: 'walk', cubs: [{ x: 990, y: 0, ph: 1.2 }, { x: 940, y: 0, ph: 2.6 }] };
  var lastT = null;

  function drawBear(c, x, y, dir, scale, phase, sniff, light, cub) {
    // y = ground line under the feet; drawn facing +x, mirrored for dir = -1
    var fur = mix(hex('#3A2612'), cub ? hex('#8A6338') : hex('#6E4A28'), light);
    var fur2 = mix(hex('#2B1A0C'), cub ? hex('#6F4C28') : hex('#54371C'), light);
    var muzzle = mix(hex('#4E3A26'), hex('#C9A57C'), light);
    c.save(); c.translate(x, y); c.scale(dir * scale, scale);
    var bob = 1.2 * Math.sin(phase * 2);
    // far legs (darker), near legs — quadruped walk: diagonal pairs swing together
    var legs = [[-18, 0], [-8, Math.PI], [14, Math.PI], [22, 0]];
    for (var pass = 0; pass < 2; pass++) {
      c.strokeStyle = rgb(pass === 0 ? fur2 : fur); c.lineWidth = cub ? 7 : 6.5; c.lineCap = 'round';
      for (var i = 0; i < legs.length; i++) {
        if ((i % 2 === 0) !== (pass === 0)) continue;
        var sw = 9 * Math.sin(phase + legs[i][1]) * (sniff ? 0.15 : 1);
        var lift = Math.max(0, Math.sin(phase + legs[i][1])) * 3 * (sniff ? 0 : 1);
        c.beginPath(); c.moveTo(legs[i][0], -10 + bob); c.lineTo(legs[i][0] + sw, -lift); c.stroke();
      }
      if (pass === 0) {
        // body + shoulder hump
        c.fillStyle = rgb(fur);
        c.beginPath(); c.ellipse(0, -18 + bob, 31, 15, 0, 0, 6.283); c.fill();
        c.beginPath(); c.arc(-6, -29 + bob, 12, 0, 6.283); c.fill();
        c.beginPath(); c.arc(-30, -20 + bob, 4, 0, 6.283); c.fill();          // tail
      }
    }
    // head (lowers when sniffing)
    var hy = -26 + bob + (sniff ? 9 : 0), hx = 27 + (sniff ? 3 : 0);
    c.fillStyle = rgb(fur);
    c.beginPath(); c.arc(hx - 4, hy - 8, 4, 0, 6.283); c.arc(hx + 4, hy - 9, 4, 0, 6.283); c.fill();   // ears
    c.beginPath(); c.arc(hx, hy, cub ? 11 : 10, 0, 6.283); c.fill();
    c.fillStyle = rgb(muzzle); c.beginPath(); c.ellipse(hx + 8, hy + 3, 6, 4.2, 0, 0, 6.283); c.fill();
    c.fillStyle = rgb(fur2); c.beginPath(); c.arc(hx + 12.5, hy + 2, 2, 0, 6.283); c.fill();          // nose
    c.fillStyle = 'rgba(20,12,6,0.9)'; c.beginPath(); c.arc(hx + 3, hy - 2, 1.3, 0, 6.283); c.fill(); // eye
    c.restore();
  }
  function updateBears(t, dt) {
    var p = (t + 11) % 38;                                                    // 30 s walking, 8 s sniffing
    bears.mode = p < 30 ? 'walk' : 'sniff';
    if (bears.mode === 'walk') {
      var speed = 13;
      bears.x += bears.dir * speed * dt; bears.phase += speed * dt * 0.16;
      if (bears.x > BEAR_MAX) { bears.x = BEAR_MAX; bears.dir = -1; }
      if (bears.x < BEAR_MIN) { bears.x = BEAR_MIN; bears.dir = 1; }
    }
    for (var i = 0; i < bears.cubs.length; i++) {
      var cub = bears.cubs[i], target = bears.x - bears.dir * (58 + i * 46) + 10 * Math.sin(t * 0.3 + cub.ph);
      var dx = target - cub.x, step = clamp(dx * 1.8 * dt, -28 * dt, 28 * dt);
      cub.x += step; cub.v = Math.abs(step / dt);
      cub.dir = Math.abs(dx) > 4 ? (dx > 0 ? 1 : -1) : bears.dir;
      cub.ph += cub.v * dt * 0.22;
      var play = Math.max(0, Math.sin(t * 0.9 + cub.ph * 0.1)) > 0.97;          // occasional hop
      cub.y = play ? -4 * Math.abs(Math.sin(t * 6)) : 0;
    }
  }
  function paintBears(c, light, t) {
    var y = SHORE + 1;
    for (var i = bears.cubs.length - 1; i >= 0; i--) {
      var cub = bears.cubs[i];
      drawBear(c, cub.x, y + cub.y, cub.dir, 0.55, cub.ph, cub.v < 1 && bears.mode === 'sniff', light, true);
    }
    drawBear(c, bears.x, y, bears.dir, 1, bears.phase, bears.mode === 'sniff', light, false);
  }

  // ---------- hikers on the low peak, camp at night ----------
  var TRAIL = [[1225, ridgeY(1225)], [1300, ridgeY(1300)], [1380, 485], [1450, ridgeY(1450)], [1520, ridgeY(1520)]];
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
  var HIKERS = [{ jacket: '#D9482B', pack: '#2F5D8C' }, { jacket: '#2E7DBF', pack: '#C9A227' }, { jacket: '#E3B341', pack: '#4E7A4A' }];
  var CAMP = { x: 1318, y: ridgeY(1318) };
  function drawHiker(c, x, y, dir, phase, moving, jacket, pack, light, wave) {
    var skin = mix(hex('#5A4032'), hex('#E8B58F'), light), j = mix(hex(jacket), hex('#101820'), 0.55 * (1 - light)), pk = mix(hex(pack), hex('#101820'), 0.55 * (1 - light));
    c.save(); c.translate(x, y); c.scale(dir, 1);
    var bob = moving ? 1.2 * Math.abs(Math.sin(phase)) : 0;
    var l1 = moving ? 5 * Math.sin(phase) : 0, l2 = moving ? -5 * Math.sin(phase) : 0;
    c.strokeStyle = '#2B3340'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-1, -10 + bob); c.lineTo(-1 + l1, 0); c.stroke();
    c.beginPath(); c.moveTo(2, -10 + bob); c.lineTo(2 + l2, 0); c.stroke();
    c.fillStyle = rgb(pk); c.fillRect(-7, -22 + bob, 5, 11);                                   // backpack
    c.fillStyle = rgb(j); c.beginPath(); c.roundRect ? c.roundRect(-3.5, -23 + bob, 8, 14, 2) : c.rect(-3.5, -23 + bob, 8, 14); c.fill();
    c.fillStyle = rgb(skin); c.beginPath(); c.arc(1, -27 + bob, 3.8, 0, 6.283); c.fill();     // head
    c.fillStyle = rgb(j); c.beginPath(); c.arc(1, -29 + bob, 4, Math.PI, 0); c.fill();        // hat
    c.strokeStyle = rgb(skin); c.lineWidth = 2.2;
    if (wave) { c.beginPath(); c.moveTo(3, -19 + bob); c.lineTo(8, -30 + bob + 2 * Math.sin(phase * 3)); c.stroke(); }
    else { var a = moving ? 3 * Math.sin(phase + Math.PI) : 2; c.beginPath(); c.moveTo(3, -19 + bob); c.lineTo(7 + a, -12 + bob); c.stroke();
           c.strokeStyle = '#8C9AA8'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(7 + a, -12 + bob); c.lineTo(9 + a, 0); c.stroke(); }  // hiking pole
    c.restore();
  }
  function drawTent(c, x, y, glow, night, t) {
    var flick = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    // level pad
    c.fillStyle = 'rgba(20,32,44,0.9)'; c.beginPath(); c.moveTo(x - 30, y + 1); c.lineTo(x + 34, y + 1); c.lineTo(x + 30, y + 5); c.lineTo(x - 26, y + 5); c.closePath(); c.fill();
    if (glow > 0) {                                                                            // lamp light spilling out
      var g = c.createRadialGradient(x + 2, y - 8, 4, x + 2, y - 8, 70);
      g.addColorStop(0, 'rgba(255,200,110,' + (0.35 * glow * flick).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,200,110,0)');
      c.fillStyle = g; c.fillRect(x - 70, y - 78, 140, 84);
    }
    var canvasCol = mix(hex('#3B2418'), hex('#D9822B'), 1 - night * 0.7);
    var lit = mix(canvasCol, hex('#FFD27A'), glow * 0.9);
    c.fillStyle = rgb(mix(canvasCol, hex('#000000'), 0.25)); c.beginPath(); c.moveTo(x - 22, y); c.lineTo(x + 2, y - 24); c.lineTo(x + 30, y); c.closePath(); c.fill();
    c.fillStyle = rgb(lit); c.beginPath(); c.moveTo(x - 14, y); c.lineTo(x + 2, y - 24); c.lineTo(x + 20, y); c.closePath(); c.fill();
    c.fillStyle = rgb(mix(lit, hex('#000000'), 0.35)); c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 2, y - 14); c.lineTo(x + 8, y); c.closePath(); c.fill();  // door
    if (glow > 0) { c.fillStyle = 'rgba(255,225,150,' + (0.9 * glow * flick).toFixed(3) + ')'; c.beginPath(); c.arc(x + 2, y - 15, 1.8, 0, 6.283); c.fill(); }   // lamp
  }
  function drawFire(c, x, y, a, t) {
    if (a <= 0) return;
    var g = c.createRadialGradient(x, y - 4, 2, x, y - 4, 40);
    g.addColorStop(0, 'rgba(255,170,70,' + (0.4 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = g; c.fillRect(x - 40, y - 44, 80, 48);
    c.fillStyle = 'rgba(70,45,30,0.95)'; c.fillRect(x - 6, y - 2, 12, 2.2);
    for (var i = 0; i < 3; i++) {
      var h = 6 + 4 * Math.abs(Math.sin(t * 9 + i * 2.1)), w = 2.4 - i * 0.5;
      c.fillStyle = i === 2 ? 'rgba(255,240,170,' + (0.9 * a).toFixed(2) + ')' : 'rgba(255,' + (150 + 40 * i) + ',60,' + (0.85 * a).toFixed(2) + ')';
      c.beginPath(); c.moveTo(x - w * 2, y - 2); c.quadraticCurveTo(x - w, y - h * 0.6, x + 0.5 * Math.sin(t * 11 + i), y - h - 2 * i); c.quadraticCurveTo(x + w, y - h * 0.6, x + w * 2, y - 2); c.closePath(); c.fill();
    }
  }
  function paintHikers(c, light, night, sun, t) {
    var hiking = sun.elev > 4;
    var glow = smooth(3, -4, sun.elev);                                                       // lamp on from dusk
    drawTent(c, CAMP.x, CAMP.y, glow, night, t);
    if (hiking) {
      var T = 64, p = t % T, s, moving = true, wave = false;
      if (p < 24) s = TRAIL_TOTAL * p / 24;
      else if (p < 30) { s = TRAIL_TOTAL; moving = false; wave = true; }
      else if (p < 54) s = TRAIL_TOTAL * (1 - (p - 30) / 24);
      else { s = 0; moving = false; }
      var dir = (p < 30) ? 1 : -1;
      for (var i = 0; i < HIKERS.length; i++) {
        var pt = trailPoint(s - dir * i * 20 * (moving ? 1 : 0.9));
        drawHiker(c, pt[0], pt[1], dir, t * 6 + i * 1.1, moving, HIKERS[i].jacket, HIKERS[i].pack, light, wave && i === 0);
      }
    } else {
      drawFire(c, CAMP.x + 30, CAMP.y + 1, glow, t);
      drawHiker(c, CAMP.x + 46, CAMP.y + 1, -1, 0, false, HIKERS[0].jacket, HIKERS[0].pack, light, false);
      drawHiker(c, CAMP.x + 17, CAMP.y + 1, 1, 0, false, HIKERS[1].jacket, HIKERS[1].pack, light, false);
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
    paintTrees(tctx, light, t, w);
    paintHikers(tctx, light, night, sun, t);
    var dt = lastT == null ? 0.033 : Math.min(0.1, t - lastT); lastT = t;
    updateBears(t, dt);
    paintBears(tctx, light, t);

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
