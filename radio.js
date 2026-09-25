/* Commonwealth Radio -- radio.js
   Drives index.html and the pop-up player.html from AzuraCast's public API.
   No framework, no build step. Every value from the server goes in through
   textContent, never innerHTML: song tags are typed by whoever ripped the
   file, and the request line lists the whole library. Every element lookup
   is allowed to miss, because the pop-up page has only the player on it. */
(function () {
  "use strict";

  var C = window.RADIO || {};
  var BASE = (C.base || "").replace(/\/+$/, "");
  var SC = C.shortcode || "commonwealth_radio";
  var POLL = Math.max(5, C.poll || 15);
  var ROWS = C.requestRows || 20;

  var np = null, npAt = 0, lastOk = 0, scrollText = "";

  function $(id) { return document.getElementById(id); }
  function api(p) { return BASE + p; }
  /* AzuraCast hands back some URLs relative (request_url) and some absolute (art). */
  function abs(u) { return !u ? "" : /^https?:/i.test(u) ? u : BASE + u; }
  function text(id, s) { var n = $(id); if (n) n.textContent = s == null ? "" : String(s); }
  function el(tag, cls, s) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (s != null) n.textContent = String(s);
    return n;
  }
  function flag(id, on) { var n = $(id); if (n) n.className = n.className.replace(/ ?lit/, "") + (on ? " lit" : ""); }

  function getJSON(url, opts) {
    var ctl = "AbortController" in window ? new AbortController() : null;
    var t = ctl && setTimeout(function () { ctl.abort(); }, 10000);
    opts = opts || {};
    if (ctl) opts.signal = ctl.signal;
    opts.headers = { "Accept": "application/json" };
    return fetch(url, opts).then(function (r) {
      if (t) clearTimeout(t);
      return r.json().catch(function () { return null; }).then(function (body) {
        if (!r.ok) {
          var e = new Error((body && (body.formatted_message || body.message)) || ("HTTP " + r.status));
          e.status = r.status;
          throw e;
        }
        return body;
      });
    }, function (e) { if (t) clearTimeout(t); throw e; });
  }

  function two(n) { return (n < 10 ? "0" : "") + n; }
  function mmss(s) { s = Math.max(0, Math.floor(s || 0)); return two(Math.floor(s / 60)) + ":" + two(s % 60); }
  function clock(unix) { var d = new Date(unix * 1000); return two(d.getHours()) + ":" + two(d.getMinutes()); }
  function pad7(n) { var s = String(Math.max(0, n | 0)); while (s.length < 7) s = "0" + s; return s; }
  var DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  function songLine(song) {
    if (!song) return "";
    if (song.artist && song.title) return song.artist + " - " + song.title;
    return song.text || song.title || "";
  }
  function defaultMount(st) {
    var ms = (st && st.mounts) || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].is_default) return ms[i];
    return ms[0] || null;
  }

  /* ================================================================ now playing */

  function loadNowPlaying() {
    return getJSON(api("/api/nowplaying_static/" + encodeURIComponent(SC) + ".json"))
      .catch(function () {
        /* the static file only exists once the station has been online at least once */
        return getJSON(api("/api/nowplaying/" + encodeURIComponent(SC)));
      })
      .then(function (d) {
        if (!d || !d.station) throw new Error("the reply had no station in it");
        np = d; npAt = Date.now(); lastOk = npAt;
        render();
      })
      .catch(function (e) {
        /* AzuraCast writes no now-playing at all until a playlist has music in
           it, so a 404 here can mean "up, but silent". Ask about the station
           itself before blaming the transmitter. */
        return getJSON(api("/api/station/" + encodeURIComponent(SC)))
          .then(function () {
            offAir("The station is up but has not reported a song yet. Until there is music in a playlist it has nothing to play.");
          }, function () {
            offAir("The transmitter at Midoriheiki is not answering (" + (e && e.message || "no reply") + ").");
          });
      });
  }

  function sign(kind, big, sub) {
    var s = $("sign");
    if (s) { s.className = "big " + kind; s.textContent = big; }
    text("sign-sub", sub);
    flag("f-live", kind === "live");
    flag("f-auto", kind === "auto");
    flag("f-off", kind === "off");
  }

  function setScroll(s) {
    if (s === scrollText) return;   /* rewriting a marquee restarts its scroll */
    scrollText = s;
    text("np-scroll", s);
  }

  function offAir(why) {
    var box = $("offair");
    if (box) box.hidden = false;
    text("offair-why", why + (lastOk ? " Last good reply at " + new Date(lastOk).toLocaleTimeString() + "." : ""));
    sign("off", "OFF AIR", "no signal");
    setScroll("*** NO SIGNAL FROM MIDORIHEIKI *** TRY AGAIN IN A FEW MINUTES ***");
    if (!lastOk) {
      text("np-src", " ");
      text("oa-show", "Off air");
    }
  }

  function render() {
    var d = np, st = d.station || {}, cur = d.now_playing || {}, song = cur.song || {};
    var live = !!(d.live && d.live.is_live);
    var dj = live ? (d.live.streamer_name || cur.streamer || "a DJ") : "";

    /* AzuraCast also says offline when broadcasting is running but no
       playlist has music in it; the stream then carries only its fallback clip. */
    if (d.is_online === false) { renderTuneIn(st); offAir("AzuraCast reports the station offline: broadcasting is stopped, or no playlist has music in it yet."); return; }
    if ($("offair")) $("offair").hidden = true;

    live ? sign("live", "ON AIR", dj) : sign("auto", "AUTO DJ", cur.playlist || "rotation");
    flag("f-req", !!cur.is_request);

    var len = cur.duration ? " (" + mmss(cur.duration) + ")" : "";
    setScroll("*** " + songLine(song) + len + " ***" + (song.album ? " " + song.album + " ***" : ""));
    text("np-live", "Now playing: " + songLine(song));

    var src = live ? "LIVE: " + dj : cur.is_request ? "REQUESTED BY A LISTENER" : cur.playlist ? "PLAYLIST: " + cur.playlist : "";
    text("np-src", src || " ");
    /* during a live show playing_next is still the Auto DJ's queue, which
       will not air until the DJ leaves, so don't advertise it */
    var nx = !live && d.playing_next && d.playing_next.song;
    text("np-next", live ? "NEXT: THE DJ'S CHOICE" : nx ? "NEXT: " + songLine(nx) : " ");

    var art = $("np-art");
    if (art && song.art && art.getAttribute("src") !== song.art) {
      art.src = song.art;
      art.alt = "Cover of " + (song.album || song.title || "the current song");
    }

    var L = d.listeners || {}, now = L.current != null ? L.current : (L.total || 0);
    text("lcd-lis", now);
    text("counter", pad7(now));
    text("unique", L.unique != null ? L.unique : "--");

    var m = defaultMount(st);
    if (m) {
      text("lcd-kbps", m.bitrate || "---");
      text("lcd-fmt", (m.format || "mp3").toUpperCase());
      text("tune-fmt", (m.bitrate ? m.bitrate + "k " : "") + (m.format || "mp3").toUpperCase());
      if (m.bitrate) text("b-kbps", m.bitrate + "k");
    }
    text("amp-sync", new Date(npAt).toLocaleTimeString());

    renderOnAir(live, dj, cur, d.live);
    renderPlaylist(d);
    renderTuneIn(st);
    tick();
  }

  function renderOnAir(live, dj, cur, liv) {
    if (!$("oa-show")) return;
    var slot = scheduleNow();
    text("oa-show", slot ? (slot.title || slot.name) : live ? "Live with " + dj : (cur.playlist || "General rotation"));
    text("oa-host", live ? "Your DJ: " + dj : "The Auto DJ is at the desk.");
    text("oa-since", live && liv.broadcast_start ? "on since " + clock(liv.broadcast_start) : slot && slot.end_timestamp ? "until " + clock(slot.end_timestamp) : " ");
  }

  /* Winamp's playlist editor: numbered, oldest first, the current row lit. */
  function renderPlaylist(d) {
    var ol = $("pl");
    if (!ol) return;
    ol.textContent = "";
    var hist = (d.song_history || []).slice(0, 5).reverse();
    var n = 1;
    function row(cls, rec, when, tail) {
      var s = rec.song || {}, li = el("li", cls);
      li.appendChild(el("span", "t", tail));
      li.appendChild(document.createTextNode(n++ + ". " + songLine(s) + " "));
      if (rec.is_request) li.appendChild(el("span", "req", "[REQ]"));
      li.title = when;
      ol.appendChild(li);
    }
    hist.forEach(function (h) {
      row("", h, h.played_at ? "aired " + clock(h.played_at) : "", h.played_at ? clock(h.played_at) : "--:--");
    });
    if (d.now_playing && d.now_playing.song) {
      var cur = d.now_playing;
      row("cur", cur, "on now", d.live && d.live.is_live ? "LIVE" : "NOW");
    }
    var nx = !(d.live && d.live.is_live) && d.playing_next;
    if (nx && nx.song) row("next", nx, "up next", "NEXT");
    text("pl-count", (n - 1) + " TRACKS");
  }

  function renderTuneIn(st) {
    var m = defaultMount(st);
    var url = (m && m.url) || st.listen_url;
    function set(id, href) { var a = $(id); if (a && href) a.href = href; }
    set("tune-mp3", url);
    set("b-listen", url);
    set("tune-pls", st.playlist_pls_url);
    set("tune-m3u", st.playlist_m3u_url);
    if (url && $("dj-host")) { try { text("dj-host", new URL(url).hostname); } catch (e) { /* relative */ } }
  }

  /* Once a second, advance the clock and the position bar from the last
     reply, without asking the server. */
  function tick() {
    if (!np || !np.now_playing) return;
    var cur = np.now_playing, dur = cur.duration || 0;
    /* offline, AzuraCast sends played_at 0, which makes "elapsed" the whole
       Unix epoch: 29838146 minutes on the clock */
    if (np.is_online === false || !cur.played_at) {
      text("np-clock", "--:--");
      if ($("np-pos")) $("np-pos").style.width = "0";
      return;
    }
    var t = (cur.elapsed || 0) + (Date.now() - npAt) / 1000;
    if (dur) t = Math.min(t, dur);
    text("np-clock", mmss(t));
    var pos = $("np-pos");
    if (pos) pos.style.width = dur ? (100 * t / dur).toFixed(2) + "%" : "0";
    /* a song that has run out means a new one started; don't wait for the poll */
    if (dur && t >= dur && Date.now() - npAt > 3000 && !tick.pending) {
      tick.pending = true;
      setTimeout(function () { loadNowPlaying().then(function () { tick.pending = false; }); }, 2000);
    }
  }

  /* ================================================================ the player */

  /* Two audio elements. The first asks for the stream with CORS so the
     spectrum can read it. If the server won't allow that, the element errors
     before it ever plays, and the second, plain one takes over with the
     spectrum dark. It can't be one element: once routed through Web Audio,
     a stream that fails CORS plays as silence rather than failing. */
  var corsOK = null, audioCors = null, audioPlain = null, audio = null;
  var actx = null, analyser = null, wantPlay = false, everPlayed = false;
  var chan = "BroadcastChannel" in window ? new BroadcastChannel("commonwealth-radio") : null;

  function streamURL() {
    var st = np && np.station, m = defaultMount(st);
    var u = (m && m.url) || (st && st.listen_url) || api("/listen/" + SC + "/radio.mp3");
    /* A fresh query string defeats a cached copy of the stream: without it,
       some browsers resume from their old buffer, minutes behind live. */
    return u + (u.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now();
  }
  function playerState(s) { text("player-state", s); }

  function makeAudio(cors) {
    var a = new Audio();
    a.preload = "none";
    if (cors) a.crossOrigin = "anonymous";
    a.addEventListener("playing", function () {
      everPlayed = true;
      playerState("PLAYING");
      if (cors && corsOK === null) { corsOK = true; wireSpectrum(a); }
    });
    a.addEventListener("waiting", function () { if (wantPlay && a === audio) playerState("BUFFERING"); });
    /* A live stream never ends on its own. If it does, the server dropped us
       (a restart, a DJ handover): rejoin instead of falling silent. */
    a.addEventListener("ended", function () {
      if (!wantPlay || a !== audio) return;
      playerState("RECONNECTING");
      a.src = streamURL();
      a.play().catch(function () {});
    });
    a.addEventListener("error", function () {
      if (!wantPlay || a !== audio) return;
      if (cors && corsOK === null && !everPlayed) {
        corsOK = false;                 /* no CORS on the stream: play it plain */
        start();
        return;
      }
      playerState("STREAM LOST - RETRY IN 5s");
      setTimeout(function () { if (wantPlay && a === audio) { a.src = streamURL(); a.play().catch(function () {}); } }, 5000);
    });
    return a;
  }

  function wireSpectrum(a) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || analyser) return;
    try {
      actx = new AC();
      var srcNode = actx.createMediaElementSource(a);
      analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      srcNode.connect(analyser);
      analyser.connect(actx.destination);
      if (actx.state === "suspended") actx.resume();
    } catch (e) { analyser = null; }
  }

  function start() {
    wantPlay = true;
    audio = corsOK === false ? (audioPlain = audioPlain || makeAudio(false))
                             : (audioCors = audioCors || makeAudio(true));
    audio.src = streamURL();
    audio.volume = ($("vol") ? $("vol").value : 80) / 100;
    playerState("CONNECTING");
    if (actx && actx.state === "suspended") actx.resume();
    var p = audio.play();
    if (p && p.catch) p.catch(function (e) {
      if (e && e.name === "NotAllowedError") playerState("PRESS LISTEN");
    });
    if ($("btn-listen")) $("btn-listen").disabled = true;
    if ($("btn-stop")) $("btn-stop").disabled = false;
    if (chan) chan.postMessage("playing");
  }

  function stop() {
    wantPlay = false;
    [audioCors, audioPlain].forEach(function (a) {
      if (!a) return;
      a.pause();
      a.removeAttribute("src");
      a.load();                         /* actually closes the connection */
    });
    playerState("");
    if ($("btn-listen")) $("btn-listen").disabled = false;
    if ($("btn-stop")) $("btn-stop").disabled = true;
  }

  if ($("btn-listen")) $("btn-listen").addEventListener("click", start);
  if ($("btn-stop")) $("btn-stop").addEventListener("click", stop);
  if ($("vol")) $("vol").addEventListener("input", function () { if (audio) audio.volume = this.value / 100; });
  /* only one window plays at a time: starting one stops the others */
  if (chan) chan.onmessage = function (ev) { if (ev.data === "playing" && wantPlay) stop(); };

  function popUp(ev) {
    if (ev) ev.preventDefault();
    stop();
    window.open("player.html?autoplay=1", "cwradio", "width=640,height=260,resizable=yes");
  }
  if ($("btn-pop")) $("btn-pop").addEventListener("click", popUp);
  if ($("tune-pop")) $("tune-pop").addEventListener("click", popUp);
  if (/[?&]autoplay=1/.test(location.search)) start();

  /* ------------------------------------------------ the spectrum
     76x16, Winamp's own size: 19 bars of 3 px with a 1 px gap. The ramp is
     sixteen flat colours, one per row, stepped, not blended. */
  var vis = $("vis"), vctx = vis && vis.getContext("2d");
  var RAMP = ["#FF2000", "#FF4000", "#FF6000", "#FF8000", "#FFA000", "#FFC000", "#E0E000", "#C0F000",
              "#A0FF00", "#80FF00", "#60F000", "#40E000", "#20D000", "#10C000", "#00B000", "#00A000"];
  var peaks = new Array(19).fill(0), bins = null;

  function drawVis() {
    requestAnimationFrame(drawVis);
    if (!vctx) return;
    vctx.fillStyle = "#000";
    vctx.fillRect(0, 0, 76, 16);
    var playing = analyser && wantPlay && audio === audioCors && !audio.paused;
    for (var b = 0; b < 19; b++) {
      var h = 0;
      if (playing) {
        bins = bins || new Uint8Array(analyser.frequencyBinCount);
        if (b === 0) analyser.getByteFrequencyData(bins);
        /* log-spaced bands, so the bass doesn't take half the display */
        var lo = Math.floor(Math.pow(bins.length, b / 19)), hi = Math.max(lo + 1, Math.floor(Math.pow(bins.length, (b + 1) / 19)));
        var m = 0;
        for (var i = lo; i < hi && i < bins.length; i++) m = Math.max(m, bins[i]);
        h = Math.round(m / 255 * 16);
      }
      peaks[b] = Math.max(h, peaks[b] - 0.25);
      for (var y = 0; y < h; y++) {
        vctx.fillStyle = RAMP[15 - y];   /* colour belongs to the row, bottom green, top red */
        vctx.fillRect(b * 4, 15 - y, 3, 1);
      }
      if (peaks[b] >= 1) {
        vctx.fillStyle = "#C0C0C0";
        vctx.fillRect(b * 4, 16 - Math.ceil(peaks[b]), 3, 1);
      }
    }
    if (!playing) { vctx.fillStyle = "#003000"; vctx.fillRect(0, 15, 75, 1); }
  }
  if (vctx) requestAnimationFrame(drawVis);

  /* ================================================================ schedule */

  var sched = [];
  function scheduleNow() {
    for (var i = 0; i < sched.length; i++) if (sched[i].is_now) return sched[i];
    return null;
  }

  /* AzuraCast's default (no start/end) schedule reply only covers a short
     "upcoming" cache window that can fall short of a full week. Passing an
     explicit start/end makes it expand every recurring schedule item across
     that range instead, so the guide sees into next calendar week too. */
  function isoDate(d) { return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()); }

  function loadSchedule() {
    if (!$("week-body") && !$("up-list")) return Promise.resolve();
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var d6 = new Date(d0.getTime() + 6 * 86400000);
    var qs = "?start=" + isoDate(d0) + "&end=" + isoDate(d6);
    return getJSON(api("/api/station/" + encodeURIComponent(SC) + "/schedule" + qs))
      .then(function (rows) { sched = rows || []; renderWeek(); renderUpNext(); if (np) render(); })
      .catch(function (e) { sched = []; renderWeek("Could not read the schedule (" + e.message + ")."); renderUpNext(); });
  }

  /* The programme guide: the next seven days as seven columns. */
  function renderWeek(err) {
    var head = $("week-head"), body = $("week-body");
    if (!head || !body) return;
    head.textContent = ""; body.textContent = "";
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    for (var k = 0; k < 7; k++) {
      var day = new Date(d0.getTime() + k * 86400000);
      var label = DAYS[day.getDay()] + " " + day.getDate();
      head.appendChild(el("th", k === 0 ? "today" : null, k === 0 ? "TODAY" : label));
      var td = el("td", k === 0 ? "today" : null);
      td.setAttribute("data-day", k === 0 ? "TODAY" : label);
      var from = day.getTime() / 1000, to = from + 86400;
      sched.filter(function (r) { return r.start_timestamp >= from && r.start_timestamp < to; })
        .sort(function (a, b) { return a.start_timestamp - b.start_timestamp; })
        .forEach(function (r) {
          var s = el("div", "slot" + (r.type === "streamer" ? " live" : "") + (r.is_now ? " now" : ""));
          s.appendChild(el("span", "when", clock(r.start_timestamp) + (r.end_timestamp ? "-" + clock(r.end_timestamp) : "")));
          s.appendChild(document.createTextNode((r.title || r.name || "") + " "));
          if (r.is_now) s.appendChild(el("span", "nowtag", "NOW"));
          td.appendChild(s);
        });
      if (!td.childNodes.length) { td.className += " idle"; td.appendChild(document.createTextNode(err && k === 0 ? err : "rotation")); }
      body.appendChild(td);
    }
  }

  function renderUpNext() {
    var ul = $("up-list");
    if (!ul) return;
    ul.textContent = "";
    var now = Date.now() / 1000;
    var next = sched.filter(function (r) { return r.start_timestamp > now; })
      .sort(function (a, b) { return a.start_timestamp - b.start_timestamp; }).slice(0, 4);
    if (!next.length) { ul.appendChild(el("li", null, "Nothing scheduled. The rotation plays on.")); return; }
    next.forEach(function (r) {
      var li = el("li"), d = new Date(r.start_timestamp * 1000);
      var sameDay = new Date().toDateString() === d.toDateString();
      li.appendChild(el("span", "when", (sameDay ? "" : DAYS[d.getDay()] + " ") + clock(r.start_timestamp)));
      li.appendChild(document.createTextNode((r.title || r.name || "") + (r.type === "streamer" ? " (live)" : "")));
      ul.appendChild(li);
    });
  }

  /* ================================================================ requests */

  var reqPage = 1, reqQuery = "";

  function reqMsg(s, ok) {
    var m = $("req-msg");
    if (!m) return;
    m.textContent = s || "";
    m.className = "msg" + (s ? (ok ? " ok" : " bad") : "");
  }

  function loadRequests(page) {
    reqPage = page || 1;
    reqMsg("Searching…", true);
    var q = "?searchPhrase=" + encodeURIComponent(reqQuery) + "&rowCount=" + ROWS + "&current=" + reqPage;
    return getJSON(api("/api/station/" + encodeURIComponent(SC) + "/requests" + q))
      .then(function (d) {
        reqMsg("");
        if (Array.isArray(d)) {
          /* older AzuraCast ignores the paging parameters and sends the whole library */
          var ql = reqQuery.toLowerCase();
          var hit = d.filter(function (r) {
            var s = r.song || {};
            return !ql || [s.artist, s.title, s.album].join(" ").toLowerCase().indexOf(ql) >= 0;
          });
          renderRequests(hit.slice((reqPage - 1) * ROWS, reqPage * ROWS), hit.length, Math.max(1, Math.ceil(hit.length / ROWS)));
        } else {
          renderRequests(d.rows || [], d.total || 0, d.total_pages || 1);
        }
      })
      .catch(function (e) {
        if (e.status === 403) reqMsg("The request line is closed right now.");
        else reqMsg("Could not reach the request line (" + e.message + ").");
      });
  }

  function renderRequests(rows, total, pages) {
    var tb = $("req-body");
    tb.textContent = "";
    if (!rows.length) {
      var tr = el("tr"), td = el("td", "empty", reqQuery ? "Nothing in the library matches “" + reqQuery + "”." : "The library is empty.");
      td.colSpan = 4; tr.appendChild(td); tb.appendChild(tr);
    }
    rows.forEach(function (r) {
      var s = r.song || {}, tr = el("tr");
      tr.appendChild(el("td", null, s.artist || ""));
      tr.appendChild(el("td", null, s.title || s.text || ""));
      tr.appendChild(el("td", null, s.album || ""));
      var td = el("td", "act"), b = el("button", "b", "REQUEST");
      b.type = "button";
      b.addEventListener("click", function () { sendRequest(r, b, s); });
      td.appendChild(b);
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    var pg = $("req-pager");
    pg.textContent = "";
    if (pages > 1) {
      if (reqPage > 1) pg.appendChild(pagerLink("« prev", reqPage - 1));
      pg.appendChild(document.createTextNode(" page " + reqPage + " of " + pages + " (" + total + " songs) "));
      if (reqPage < pages) pg.appendChild(pagerLink("next »", reqPage + 1));
    } else if (total) {
      pg.textContent = total + (total === 1 ? " song" : " songs");
    }
  }

  function pagerLink(label, page) {
    var a = el("a", null, label);
    a.href = "#requests";
    a.addEventListener("click", function (ev) { ev.preventDefault(); loadRequests(page); });
    return a;
  }

  function sendRequest(r, btn, s) {
    if (!r.request_url) return;
    btn.disabled = true;
    getJSON(abs(r.request_url), { method: "POST" })
      .then(function (d) { reqMsg((d && d.message) || ("Requested: " + songLine(s) + "."), true); btn.textContent = "QUEUED"; })
      .catch(function (e) { reqMsg(e.message); btn.disabled = false; });
  }

  if ($("req-go")) {
    $("req-go").addEventListener("click", function () { reqQuery = $("req-q").value.trim(); loadRequests(1); });
    $("req-q").addEventListener("keydown", function (ev) { if (ev.key === "Enter") { reqQuery = this.value.trim(); loadRequests(1); } });
  }

  /* ================================================================ panels
     The station buttons swap panels in place, so the player never reloads
     and the music never stops. Panel ids are prefixed p- so a #hash never
     makes the browser jump past the player. */
  var PANELS = ["listen", "schedule", "requests", "djs", "about"];
  function showPanel() {
    var want = (location.hash || "#listen").slice(1);
    if (PANELS.indexOf(want) < 0) return;
    PANELS.forEach(function (p) {
      var sec = $("p-" + p);
      if (sec) sec.className = "panel" + (p === want ? " on" : "");
    });
    Array.prototype.forEach.call(document.querySelectorAll("nav.buttons a"), function (a) {
      a.className = a.getAttribute("data-p") === want ? "on" : "";
    });
    var sec = $("p-" + want);
    if (sec && location.hash && sec.getBoundingClientRect().top > window.innerHeight) sec.scrollIntoView();
    if (want === "requests" && $("req-body") && !loadRequests.done) { loadRequests.done = true; loadRequests(1); }
  }
  if (document.querySelector("nav.buttons")) {
    window.addEventListener("hashchange", showPanel);
    showPanel();
  }

  /* ================================================================ start */

  Array.prototype.forEach.call(document.querySelectorAll(".shortcode"), function (n) { n.textContent = SC; });
  text("poll-s", POLL);

  loadNowPlaying();
  loadSchedule();
  setInterval(loadNowPlaying, POLL * 1000);
  setInterval(loadSchedule, 5 * 60 * 1000);
  setInterval(tick, 1000);
  /* a stale reply is worse than none: if polling has quietly failed for a while, say so */
  setInterval(function () {
    if (lastOk && Date.now() - lastOk > (POLL * 4 + 30) * 1000) {
      offAir("No reply from the transmitter for " + Math.round((Date.now() - lastOk) / 1000) + " s.");
    }
  }, 5000);
})();
