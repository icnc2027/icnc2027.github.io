/* =====================================================================
   ICNC 2027 — live hero scene
   Draws a Rockies lake scene on <canvas id="hero-canvas"> whose lighting
   follows the real time of day in Banff (sun elevation computed for
   51.18 N, 115.57 W), with wind-swayed trees, a rippling reflection,
   drifting clouds, alpenglow on the snow around sunrise/sunset, stars,
   a phase-correct moon and a faint aurora at night.

   Preview helpers (add to the URL):
     ?t=19.5      freeze the scene at 19:30 Banff local time
     ?cycle       run a whole day in about 60 seconds
   Respects prefers-reduced-motion (renders one still frame).
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
  var fixedDate = params.has('d') ? params.get('d') : null;              // e.g. ?d=2027-06-02
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- virtual scene space: 1600 x 700, bottom-centre anchored ----------
  var VW = 1600, VH = 700, SHORE = 560;
  var W = 0, H = 0, S = 1, OX = 0, OY = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = hero.clientWidth; H = hero.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    S = Math.max(W / VW, H / VH);
    OX = (W - VW * S) / 2; OY = H - VH * S;
    buildTop();
  }

  // ---------- utilities ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }
  function rgb(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  var seed = 2027;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  // ---------- astronomy (good enough for a sky) ----------
  var LAT = 51.178 * Math.PI / 180, LON = -115.571;
  function solar(date) {
    var y = date.getUTCFullYear();
    var n = (date - Date.UTC(y, 0, 1)) / 864e5;                       // fractional day of year (UTC)
    var decl = 0.4093 * Math.sin(2 * Math.PI * (284 + n) / 365);       // declination, rad
    var b = 2 * Math.PI * (n - 81) / 365;
    var eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // equation of time, min
    var utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    var solarMin = utcMin + 4 * LON + eot;
    var Hdeg = solarMin / 4 - 180;                                      // hour angle, deg (0 = solar noon)
    Hdeg = ((Hdeg + 540) % 360) - 180;
    var Hr = Hdeg * Math.PI / 180;
    var sinE = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(Hr);
    return { elev: Math.asin(sinE) * 180 / Math.PI, H: Hdeg, decl: decl };
  }
  function moonPhase(date) {                                             // 0 new, .5 full
    var age = ((date - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588853;
    if (age < 0) age += 29.530588853;
    return age / 29.530588853;
  }
  function banffOffsetMinutes(date) {
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(date);
      var h = 0, m = 0;
      p.forEach(function (x) { if (x.type === 'hour') h = +x.value % 24; if (x.type === 'minute') m = +x.value; });
      var local = h * 60 + m, utc = date.getUTCHours() * 60 + date.getUTCMinutes();
      var d = local - utc; if (d > 720) d -= 1440; if (d < -720) d += 1440;
      return d;
    } catch (e) { return -360; }
  }
  function banffTimeString(date) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit', hour12: false }).format(date); }
    catch (e) { return ''; }
  }

  // ---------- scene time ----------
  var t0 = performance.now();
  function sceneDate() {
    var now = new Date();
    if (fixedDate) { var fd = fixedDate.split('-'); now = new Date(Date.UTC(+fd[0], +fd[1] - 1, +fd[2], now.getUTCHours(), now.getUTCMinutes())); }
    if (fixedHour != null) {
      var off = banffOffsetMinutes(now);
      var d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      d = new Date(d.getTime() + (fixedHour * 60 - off) * 60000);
      return d;
    }
    if (demo) return new Date(now.getTime() + ((performance.now() - t0) / 60000) * 86400000);
    return now;
  }

  // ---------- palette by sun elevation ----------
  // [elevation, top, middle, horizon]
  var SKY = [
    [-18, '#050B1A', '#0B1730', '#16283F'],
    [-9,  '#0A1630', '#182A52', '#3E3A62'],
    [-3,  '#182C58', '#484C86', '#C96A58'],
    [1,   '#2C5A8C', '#7B8AB0', '#F0A868'],
    [7,   '#3A7AB6', '#84B2D8', '#F3D2A0'],
    [22,  '#3F86C6', '#7CB5E2', '#C8DFF0'],
    [65,  '#2F79C0', '#6FAEE0', '#BFDCF2']
  ];
  function skyColors(e) {
    var i = 0; while (i < SKY.length - 2 && e > SKY[i + 1][0]) i++;
    var a = SKY[i], b = SKY[i + 1], t = clamp((e - a[0]) / (b[0] - a[0]), 0, 1);
    return { top: mix(hex(a[1]), hex(b[1]), t), mid: mix(hex(a[2]), hex(b[2]), t), hor: mix(hex(a[3]), hex(b[3]), t) };
  }

  // ---------- static geometry ----------
  var RIDGES = [
    { pts: [[0,500],[120,380],[240,445],[380,310],[500,405],[630,335],[770,420],[900,345],[1080,285],[1200,400],[1370,320],[1490,385],[1600,340]], day: '#9EB6C8', night: '#1B2D45', para: 0.02 },
    { pts: [[0,470],[160,355],[290,420],[450,300],[570,400],[700,350],[860,450],[1020,320],[1150,405],[1290,355],[1430,430],[1600,380]], day: '#56788F', night: '#162A40', para: 0.04 },
    { pts: [[0,520],[130,470],[260,525],[390,475],[550,540],[700,480],[850,530],[1010,470],[1220,545],[1380,485],[1600,540]], day: '#22425C', night: '#0F2034', para: 0.06 }
  ];
  var SNOW = [
    [[450,300],[418,348],[433,340],[446,356],[462,340],[477,350],[486,340]],
    [[1020,320],[992,362],[1005,356],[1017,370],[1032,355],[1046,364],[1054,353]],
    [[160,355],[140,385],[152,380],[162,392],[175,381],[184,386]],
    [[1080,285],[1056,318],[1068,313],[1080,326],[1094,314],[1104,320]],
    [[380,310],[360,340],[372,336],[382,348],[394,337],[402,342]]
  ];
  var STARS = [], TREES = [], CLOUDS = [];
  (function init() {
    var i;
    for (i = 0; i < 160; i++) STARS.push({ x: rnd() * VW, y: rnd() * 420, r: 0.5 + rnd() * 1.3, p: rnd() * 6.28 });
    var x = -10;
    while (x < VW + 10) { TREES.push({ x: x, h: 24 + rnd() * 26, w: 7 + rnd() * 5, p: rnd() * 6.28, row: 1 }); x += 16 + rnd() * 7; }
    x = -10;
    while (x < VW + 10) { TREES.push({ x: x, h: 16 + rnd() * 16, w: 5 + rnd() * 4, p: rnd() * 6.28, row: 0 }); x += 22 + rnd() * 10; }
    for (i = 0; i < 7; i++) CLOUDS.push({ x: rnd() * VW, y: 60 + rnd() * 200, s: 0.7 + rnd() * 0.9, v: 0.35 + rnd() * 0.5, o: 0.5 + rnd() * 0.4 });
  })();

  // ---------- wind ----------
  function wind(t) { return 0.5 + 0.35 * Math.sin(t * 0.21) * Math.sin(t * 0.067 + 1.3) + 0.15 * Math.sin(t * 0.9 + Math.sin(t * 0.31)); }

  // offscreen canvas holding everything above the shoreline (used for the reflection)
  var top = document.createElement('canvas'), tctx = top.getContext('2d');
  function buildTop() { top.width = Math.max(1, Math.round(VW * S * DPR)); top.height = Math.max(1, Math.round(SHORE * S * DPR)); }

  // ---------- drawing ----------
  function poly(c, pts, close) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (close !== false) c.closePath(); }

  function drawSky(c, sc, light, elev) {
    var g = c.createLinearGradient(0, 0, 0, SHORE);
    g.addColorStop(0, rgb(sc.top)); g.addColorStop(0.55, rgb(sc.mid)); g.addColorStop(1, rgb(sc.hor));
    c.fillStyle = g; c.fillRect(0, 0, VW, SHORE);
  }
  function drawStars(c, night, t) {
    if (night <= 0.02) return;
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i], tw = 0.65 + 0.35 * Math.sin(t * 1.7 + s.p);
      c.fillStyle = 'rgba(255,255,255,' + (night * tw * 0.9).toFixed(3) + ')';
      c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
    }
  }
  function drawAurora(c, night, t) {
    var a = smooth(0.55, 1, night) * 0.16; if (a <= 0) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var band = 0; band < 3; band++) {
      c.beginPath();
      for (var x = 0; x <= VW; x += 40) {
        var y = 110 + band * 45 + 40 * Math.sin(x / 210 + t * 0.12 + band) + 22 * Math.sin(x / 90 - t * 0.07 + band * 2);
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      for (var x2 = VW; x2 >= 0; x2 -= 40) {
        var y2 = 110 + band * 45 + 40 * Math.sin(x2 / 210 + t * 0.12 + band) + 22 * Math.sin(x2 / 90 - t * 0.07 + band * 2) - 150 - 40 * Math.sin(x2 / 150 + t * 0.09);
        c.lineTo(x2, y2);
      }
      c.closePath();
      var g = c.createLinearGradient(0, 0, 0, 300);
      g.addColorStop(0, 'rgba(120,255,190,0)'); g.addColorStop(0.55, 'rgba(90,240,170,' + (a * (0.6 + 0.4 * Math.sin(t * 0.3 + band))).toFixed(3) + ')'); g.addColorStop(1, 'rgba(160,120,255,0)');
      c.fillStyle = g; c.fill();
    }
    c.restore();
  }
  function bodyPos(Hdeg, elev) {                         // sky position from hour angle / elevation
    return { x: VW * (0.5 + clamp(Hdeg, -150, 150) / 150 * 0.44), y: SHORE - 70 - clamp(elev, -12, 70) / 70 * (SHORE - 140) };
  }
  function drawSun(c, sun, sc, t) {
    if (sun.elev < -6) return;
    var p = bodyPos(sun.H, sun.elev), low = smooth(14, -3, sun.elev);
    var col = mix(hex('#FFF7DA'), hex('#FFB067'), low), pulse = 1 + 0.03 * Math.sin(t * 0.8);
    var g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 200 * pulse);
    g.addColorStop(0, rgb(col, 0.55)); g.addColorStop(0.25, rgb(col, 0.18)); g.addColorStop(1, rgb(col, 0));
    c.fillStyle = g; c.fillRect(p.x - 220, p.y - 220, 440, 440);
    c.fillStyle = rgb(col); c.beginPath(); c.arc(p.x, p.y, 34 + 10 * low, 0, 6.283); c.fill();
  }
  function drawMoon(c, sun, night, date, sc) {
    var Hm = ((sun.H + 180 + 540) % 360) - 180, elevM = -sun.elev * 0.85 + 8;
    if (elevM < -4 || night < 0.05) return;
    var p = bodyPos(Hm, elevM), r = 26, ph = moonPhase(date), k = (1 - Math.cos(2 * Math.PI * ph)) / 2;
    var g = c.createRadialGradient(p.x, p.y, r, p.x, p.y, r * 4);
    g.addColorStop(0, 'rgba(230,238,255,' + (0.22 * night).toFixed(3) + ')'); g.addColorStop(1, 'rgba(230,238,255,0)');
    c.fillStyle = g; c.fillRect(p.x - r * 4, p.y - r * 4, r * 8, r * 8);
    c.save(); c.globalAlpha = 0.6 + 0.4 * night;
    c.fillStyle = '#F2F5FA'; c.beginPath(); c.arc(p.x, p.y, r, 0, 6.283); c.fill();
    c.beginPath(); c.arc(p.x, p.y, r, 0, 6.283); c.clip();
    var dir = ph < 0.5 ? -1 : 1;                          // waxing: dark part on the left
    c.fillStyle = rgb(sc.mid, 0.96); c.beginPath(); c.arc(p.x + dir * (2 * r * (1 - k) + 0.5), p.y, r + 1, 0, 6.283); c.fill();
    c.restore();
  }
  function drawClouds(c, light, sc, t, w) {
    for (var i = 0; i < CLOUDS.length; i++) {
      var cl = CLOUDS[i];
      cl.x += (0.12 + w * cl.v) * 0.25; if (cl.x > VW + 220) cl.x = -220;
      var base = mix(mix(hex('#FFFFFF'), sc.hor, 0.35), hex('#5C6F86'), 1 - light);
      var a = cl.o * (0.55 + 0.35 * light);
      c.save(); c.translate(cl.x, cl.y); c.scale(cl.s, cl.s * 0.6);
      var g = c.createRadialGradient(0, 0, 10, 0, 0, 120);
      g.addColorStop(0, rgb(base, a)); g.addColorStop(0.6, rgb(base, a * 0.7)); g.addColorStop(1, rgb(base, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 120, 0, 6.283); c.arc(-80, 10, 80, 0, 6.283); c.arc(85, 6, 90, 0, 6.283); c.fill();
      c.restore();
    }
  }
  function drawRidges(c, light, elev, w, t) {
    var glow = smooth(-5, 0, elev) * smooth(12, 3, elev);              // alpenglow around sunrise / sunset
    for (var i = 0; i < RIDGES.length; i++) {
      var r = RIDGES[i], col = mix(hex(r.night), hex(r.day), light);
      col = mix(col, hex('#D98A6B'), glow * (0.35 - i * 0.08));
      c.fillStyle = rgb(col);
      var pts = r.pts.map(function (p) { return [p[0], p[1]]; });
      pts.push([VW, SHORE + 5]); pts.push([0, SHORE + 5]);
      poly(c, pts); c.fill();
      if (i === 1) {
        var snow = mix(mix(hex('#1E2F4A'), hex('#F3F6F9'), light), hex('#F7A98A'), glow * 0.85);
        c.fillStyle = rgb(snow);
        for (var s = 0; s < SNOW.length; s++) { poly(c, SNOW[s]); c.fill(); }
      }
    }
  }
  function drawTrees(c, light, t, w) {
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
  function drawLake(c, light, sc, sun, night, t, w, date) {
    // base water
    var wc = mix(hex('#0B2333'), hex('#2F7A90'), light);
    var g = c.createLinearGradient(0, SHORE, 0, VH);
    g.addColorStop(0, rgb(mix(wc, sc.hor, 0.35))); g.addColorStop(1, rgb(mix(wc, hex('#0A1E2C'), 0.5)));
    c.fillStyle = g; c.fillRect(0, SHORE, VW, VH - SHORE);
    // rippled reflection of the offscreen "top" image
    var depth = VH - SHORE, strips = 46, sh = depth / strips;
    c.save(); c.globalAlpha = 0.38 + 0.14 * light;
    for (var i = 0; i < strips; i++) {
      var y = SHORE + i * sh, d = i / strips;
      var dx = (2 + 14 * d * w) * Math.sin(y * 0.09 + t * 2.1 * (0.6 + w)) + (1 + 5 * d) * Math.sin(y * 0.23 - t * 1.3);
      var srcY = SHORE - (y - SHORE) * 1.25;               // mirrored, slightly compressed
      var srcH = sh * 1.25;
      if (srcY - srcH < 0) continue;
      c.drawImage(top, 0, (srcY - srcH) * S * DPR, top.width, srcH * S * DPR, dx, y, VW, sh + 0.8);
    }
    c.restore();
    // glitter path under sun or moon
    var body = sun.elev > -4 ? bodyPos(sun.H, sun.elev) : null;
    if (!body && night > 0.05) { var Hm = ((sun.H + 180 + 540) % 360) - 180; body = bodyPos(Hm, -sun.elev * 0.85 + 8); }
    if (body) {
      var low = sun.elev > -4 ? smooth(30, -2, sun.elev) : 0.7;
      var gc = sun.elev > -4 ? mix(hex('#FFF4CF'), hex('#FFB067'), smooth(14, -3, sun.elev)) : hex('#DCE6FF');
      c.save(); c.globalCompositeOperation = 'lighter';
      for (var j = 0; j < 26; j++) {
        var yy = SHORE + 8 + j * 5.2, spread = 12 + j * 3.2 * (0.6 + w);
        var xx = body.x + spread * Math.sin(t * 3.1 + j * 1.7 + Math.sin(t + j)), len = 8 + 20 * Math.abs(Math.sin(t * 2.3 + j * 0.9));
        var al = (0.05 + 0.25 * low) * (0.4 + 0.6 * Math.abs(Math.sin(t * 4 + j)));
        c.fillStyle = rgb(gc, al); c.fillRect(xx - len / 2, yy, len, 1.6);
      }
      c.restore();
    }
    // faint moving ripple lines
    c.strokeStyle = 'rgba(255,255,255,' + (0.05 + 0.05 * light).toFixed(3) + ')'; c.lineWidth = 1;
    for (var k = 0; k < 6; k++) {
      var ry = SHORE + 22 + k * 22 + 3 * Math.sin(t * 0.8 + k);
      c.beginPath();
      for (var x = 40; x <= VW - 40; x += 20) { var yv = ry + 1.5 * Math.sin(x * 0.03 + t * 1.8 + k); if (x === 40) c.moveTo(x, yv); else c.lineTo(x, yv); }
      c.stroke();
    }
    // dusk/night darkening of the water surface
    c.fillStyle = 'rgba(8,24,40,' + (0.15 + 0.25 * night).toFixed(3) + ')'; c.fillRect(0, SHORE, VW, depth);
  }
  function drawScrim(c, light) {
    var a0 = lerp(0.74, 0.60, light), a1 = lerp(0.38, 0.16, light);
    var g = c.createLinearGradient(0, 0, VW * 0.72, 0);
    g.addColorStop(0, 'rgba(14,37,64,' + a0.toFixed(2) + ')'); g.addColorStop(0.55, 'rgba(14,37,64,' + a1.toFixed(2) + ')'); g.addColorStop(1, 'rgba(14,37,64,0)');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  }

  function frame(now) {
    var t = now / 1000, date = sceneDate(), sun = solar(date);
    var light = smooth(-8, 8, sun.elev), night = smooth(2, -10, sun.elev), sc = skyColors(sun.elev), w = wind(t);

    // 1) everything above the shoreline into the offscreen canvas (also used for reflection)
    tctx.setTransform(S * DPR, 0, 0, S * DPR, 0, 0);
    tctx.clearRect(0, 0, VW, SHORE);
    drawSky(tctx, sc, light, sun.elev);
    drawStars(tctx, night, t);
    drawAurora(tctx, night, t);
    drawMoon(tctx, sun, night, date, sc);
    drawSun(tctx, sun, sc, t);
    drawClouds(tctx, light, sc, t, w);
    drawRidges(tctx, light, sun.elev, w, t);
    drawTrees(tctx, light, t, w);

    // 2) composite onto the visible canvas
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(S * DPR, 0, 0, S * DPR, OX * DPR, OY * DPR);
    ctx.drawImage(top, 0, 0, top.width, top.height, 0, 0, VW, SHORE);
    drawLake(ctx, light, sc, sun, night, t, w, date);
    drawScrim(ctx, light);

    if (clockEl) {
      var s = banffTimeString(date);
      if (s && clockEl.textContent !== 'Banff time ' + s) clockEl.textContent = 'Banff time ' + s;
    }
  }

  // ---------- run ----------
  var running = false, visible = true, rafId = 0;
  function loop(now) { if (!running) return; frame(now); rafId = requestAnimationFrame(loop); }
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
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); else stop(); }, { threshold: 0.02 }).observe(hero);
    }
  }
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { resize(); frame(performance.now()); }, 120); });
})();
