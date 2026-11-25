/* TikWok TV - lightweight TV player.
   One <video> element and a small TV-style UI instead of TikTok's heavy website.
   Plain ES5 on purpose so it also runs on older webOS TVs. */
(function () {
  "use strict";
  var DEFAULT_BASE = "https://www.tikwm.com";
  // Server address: a typed IP / host (e.g. 192.168.1.20:8080 or https://my-server.example.com), saved on the TV.
  function normBase(s) {
    s = String(s || "").replace(/^\s+|\s+$/g, "");
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) {
      var lan = /^(\d{1,3}(\.\d{1,3}){3}|localhost)(:\d+)?(\/|$)/i.test(s) || /^[^\/]+:\d+(\/|$)/.test(s);
      s = (lan ? "http://" : "https://") + s;
    }
    return s.replace(/\/+$/, "");
  }
  var BASE = (function () { try { return normBase(localStorage.getItem("tt2_server")) || DEFAULT_BASE; } catch (e) { return DEFAULT_BASE; } })();
  var SITE = "https://www.tiktok.com/";
  var RNAMES = { AU: "Australia", BR: "Brazil", CA: "Canada", FR: "France", DE: "Germany", GR: "Greece", IN: "India", ID: "Indonesia", IT: "Italy", JP: "Japan", MX: "Mexico", NL: "Netherlands", PL: "Poland", SA: "Saudi Arabia", KR: "South Korea", ES: "Spain", TR: "Turkey", AE: "United Arab Emirates", GB: "United Kingdom", US: "United States", AUTO: "Auto (all countries)" };
  var REGIONS = ["AUTO"].concat(Object.keys(RNAMES).filter(function (k) { return k !== "AUTO"; }).sort(function (a, b) { return RNAMES[a] < RNAMES[b] ? -1 : 1; }));
  function rname(r) { return RNAMES[r] || r; }
  var VIS = 6;                                   // modal rows visible at once

  var $ = function (id) { return document.getElementById(id); };
  var v = $("v"), body = document.body;

  // ---------- settings (saved on the TV) ----------
  function load(k, d) { try { var x = localStorage.getItem("tt2_" + k); return x === null ? d : x; } catch (e) { return d; } }
  function save(k, val) { try { localStorage.setItem("tt2_" + k, String(val)); } catch (e) {} }
  function loadJSON(k) { try { var a = JSON.parse(load(k, "[]")); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  var region = load("region", ""); if (load("regv", "") !== "2") { region = ""; save("regv", "2"); }
  if (REGIONS.indexOf(region) < 0) {
    var loc = ((navigator.language || "").split("-")[1] || "").toUpperCase();
    region = "AUTO";
  }
  var fill = load("fill", "0") === "1";
  var hd = load("hd", "0") === "1";
  var autoNext = load("auto", "1") === "1";
  var legend = load("legend", "1") === "1";
  var likes = loadJSON("likes");
  var loggedIn = false; try { localStorage.removeItem("tt2_login"); } catch (e) {}
  var follows = loadJSON("follows");             // [{u:uniqueId, n:nickname, a:avatarUrl}]
  var muted = false;

  // ---------- state ----------
  var items = [], seen = {}, idx = -1;
  var src = { type: "trend", cursor: 0 };
  var busy = false, gen = 0, lastReq = 0, lastError = "", errStreak = 0, failed = false, booting = true, showTok = 0;
  var zone = "video", ri = 1, ai = 1;            // focus: "video" | "rail" (left menu) | "act" (right buttons)
  var RAIL = ["search", "foryou", "explore", "minidramas", "live", "profile", "more", "login"];
  var ACTS = ["follow", "like", "comments", "more"];
  var railEls = Array.prototype.slice.call(document.querySelectorAll(".r"));
  var actEls = Array.prototype.slice.call(document.querySelectorAll("#actions .a"));

  function setCls(el, c, on) { if (on) el.classList.add(c); else el.classList.remove(c); }
  function applyView() { setCls(body, "fill", fill); setCls(body, "nolegend", !legend); }

  // ---------- small UI helpers ----------
  var toastT = 0;
  function toast(msg, ms) {
    var t = $("toast"); t.textContent = msg; t.style.display = msg ? "block" : "none";
    clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = "none"; }, ms || 1400);
  }
  function hideBoot() { booting = false; var b = $("boot"); if (b) b.style.display = "none"; }
  function center(msg) {
    var c = $("center");
    if (msg) { c.textContent = msg; c.style.display = "flex"; c.style.pointerEvents = failed ? "auto" : "none"; } else c.style.display = "none";
  }
  function loader() { var c = $("center"); c.innerHTML = '<div class="ld"><i></i><i></i></div>'; c.style.display = "flex"; c.style.pointerEvents = "none"; }
  function state(msg) { $("state").textContent = msg || ""; }
  function setPaused(p) { $("pausedIcon").style.display = p ? "flex" : "none"; }
  function fmt(n) {
    n = +n || 0;
    return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function trim(s) { return String(s || "").replace(/^\s+|\s+$/g, ""); }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function isLiked(it) { return !!it && likes.some(function (l) { return l.id === it.id; }); }
  function isFollowing(u) { return follows.some(function (f) { return f.u === u; }); }
  function flags(it) { var f = []; if (isFollowing(it.user)) f.push("Following"); if (isLiked(it)) f.push("Liked"); return f.join("  ·  "); }
  function slim(it) {
    return { id: it.id, images: it.images || [], urls: it.urls, cover: it.cover, title: it.title, user: it.user, nick: it.nick, avatar: it.avatar, likes: it.likes, comments: it.comments, music: it.music };
  }
  var NOTE = '<svg viewBox="0 0 24 24" width="24" height="24" style="display:inline-block;vertical-align:-4px;margin-right:8px"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';

  // ---------- feed ----------
  function abs(u) {
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.charAt(0) === "/") return BASE + u;
    return u;
  }
  function urlsOf(o) {
    var list = hd ? [o.hdplay, o.play, o.wmplay] : [o.play, o.hdplay, o.wmplay];
    if (o.video && o.video.play_addr && o.video.play_addr.url_list) list = list.concat(o.video.play_addr.url_list);
    var vid = String(o.video_id || o.id || o.aweme_id || "");
    if (/^\d{8,}$/.test(vid) && !(o.images && o.images.length)) list = list.concat([BASE + "/video/media/" + (hd ? "hdplay" : "play") + "/" + vid + ".mp4", BASE + "/video/media/" + (hd ? "play" : "hdplay") + "/" + vid + ".mp4"]);
    var out = [];
    list.forEach(function (u) { u = abs(u); if (u && out.indexOf(u) < 0) out.push(u); });
    return out;
  }
  function norm(o) {
    var a = o.author || {};
    var imgs = [];
    var rawImgs = o.images || (o.image_post_info && o.image_post_info.images) || [];
    if (Array.isArray(rawImgs)) rawImgs.forEach(function (x) {
      var u = typeof x === "string" ? x : (x && (x.url || (x.display_image && x.display_image.url_list && x.display_image.url_list[0]) || (x.url_list && x.url_list[0]))) || "";
      u = abs(u); if (u) imgs.push(u);
    });
    var urls = urlsOf(o);
    if (imgs.length) {   // photo slideshow: the sound is the music track
      urls = [];
      var mu = abs(o.music || (o.music_info && o.music_info.play) || o.music_url || "");
      if (mu && typeof o.music === "string" || mu) urls.push(mu);
    }
    return {
      id: String(o.video_id || o.id || o.aweme_id || ""),
      images: imgs,
      urls: urls, ui: 0, cover: abs(o.cover || o.origin_cover || ""),
      title: o.title || o.desc || "",
      user: a.unique_id || a.uniqueId || "", nick: a.nickname || a.nick || a.unique_id || "",
      avatar: abs(a.avatar || a.avatar_thumb || ""),
      likes: o.digg_count || 0, comments: o.comment_count || 0,
      music: (o.music_info && o.music_info.title) || o.music_title || ""
    };
  }
  function parse(j, cur) {
    if (!j || (j.code !== undefined && j.code !== 0)) throw new Error((j && j.msg) || "feed returned an error");
    var d = j.data, list = Array.isArray(d) ? d : (d && (d.videos || d.list || d.items)) || [];
    if (d && !Array.isArray(d) && d.cursor !== undefined) cur.cursor = d.cursor;
    if (d && !Array.isArray(d) && d.hasMore === false) cur.done = true;
    return list.map(norm).filter(function (x) { return x.urls.length || x.images.length; });
  }

  // The free service allows ~1 request per second. Requests reserve a time slot so
  // parallel calls can never go out together, and failures are retried a couple of times.
  function once(u, post) {
    var slot = Math.max(Date.now(), lastReq + 1300); lastReq = slot;
    return delay(slot - Date.now()).then(function () {
      var ctl = typeof AbortController === "function" ? new AbortController() : null;
      return new Promise(function (resolve, reject) {
        var done = false;
        var to = setTimeout(function () { if (done) return; done = true; if (ctl) ctl.abort(); reject(new Error("The service did not answer in time")); }, 15000);
        fetch(post ? u.split("?")[0] : u, post ? { method: "POST", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }, body: u.split("?")[1] || "", signal: ctl ? ctl.signal : undefined } : { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
          if (!r.ok) { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
          return r.json();
        }).then(function (j) { if (done) return; done = true; clearTimeout(to); resolve(j); },
                function (e) { if (done) return; done = true; clearTimeout(to); reject(e); });
      });
    });
  }
  // tikwm sometimes answers 404/403/405 for one way of calling an endpoint (GET vs POST form, or
  // www vs bare host). On such an error we cycle through all four ways and remember the one that works.
  var WWW = "https://www.tikwm.com", ALT = "https://tikwm.com", modes = {};
  function swapHost(u) { return u.indexOf(WWW) === 0 ? ALT + u.slice(WWW.length) : u.indexOf(ALT) === 0 ? WWW + u.slice(ALT.length) : u; }
  function pathOf(u) { return u.replace(/^https?:\/\/[^\/]+/, "").split("?")[0]; }
  function getJSON(u0, n, stage, k) {
    n = n || 0; k = k || 0;
    if (stage === undefined) stage = modes[pathOf(u0)] || 0;      // 0 GET, 1 POST, 2 GET other host, 3 POST other host
    var u = stage >= 2 ? swapHost(u0) : u0, post = stage === 1 || stage === 3;
    return once(u, post).then(function (j) {
      if (j && j.code === -1 && /limit|second/i.test(String(j.msg || "")) && n < 3) return delay(1500).then(function () { return getJSON(u0, n + 1, stage, k); });
      modes[pathOf(u0)] = stage;
      return j;
    }, function (e) {
      var st = e && e.status;
      if ((st === 400 || st === 403 || st === 404 || st === 405) && u0.indexOf("?") > 0 && k < 3) return getJSON(u0, 0, (stage + 1) % 4, k + 1);
      if (n < 2 && !st) return delay(1200 * (n + 1)).then(function () { return getJSON(u0, n + 1, stage, k); });
      delete modes[pathOf(u0)];
      throw e;
    });
  }
  function postsUrl(u, cursor, count) { return BASE + "/api/user/posts?unique_id=" + encodeURIComponent(u) + "&count=" + count + "&cursor=" + (cursor || 0); }
  var uidCache = {};
  function userPosts(name, cur, count, quick) {
    var tries = [
      function () { return getJSON(postsUrl(name, cur.cursor, count)); },
      function () { return getJSON(postsUrl("@" + name, cur.cursor, count)); },
      function () {
        var idp = uidCache[name] ? Promise.resolve(uidCache[name]) : getJSON(BASE + "/api/user/info?unique_id=" + encodeURIComponent(name)).then(function (j) {
          var u = j && j.data && (j.data.user || j.data); var id = u && (u.id || u.uid || u.user_id);
          if (!id) throw new Error("user not found"); return (uidCache[name] = id);
        });
        return idp.then(function (id) { return getJSON(BASE + "/api/user/posts?user_id=" + encodeURIComponent(id) + "&count=" + count + "&cursor=" + (cur.cursor || 0)); });
      },
      function () { return getJSON(BASE + "/api/feed/search?keywords=" + encodeURIComponent("@" + name) + "&count=" + count + "&cursor=" + (cur.cursor || 0)); }
    ];
    if (cur.cursor) tries = tries.slice(0, 3);   // later pages: no search fallback (it 404s)
    else {
      tries.push(function () { return getJSON(BASE + "/api/user/posts?unique_id=" + encodeURIComponent(name) + "&count=" + count + "&cursor=0&web=1&hd=0"); });
      tries.push(function () {
        return getJSON(BASE + "/api/feed/search?keywords=" + encodeURIComponent(name) + "&count=20&cursor=0").then(function (j) {
          try {
            var d = j.data, l = Array.isArray(d) ? d : (d && (d.videos || d.list || d.items)) || [];
            var m = l.filter(function (o) { var a = o.author || {}; return String(a.unique_id || a.uniqueId || "").toLowerCase() === String(name).toLowerCase(); });
            if (m.length) return { code: 0, data: { videos: m, hasMore: false } };
          } catch (e) {}
          return j;
        });
      });
    }
    if (quick) tries = tries.slice(0, 3);
    var i = 0, last;
    var next = function () {
      if (i >= tries.length) return Promise.reject(last);
      return tries[i++]().then(function (j) { var arr = parse(j, cur); if (!arr.length && i < tries.length && !cur.cursor) { last = new Error("no videos"); return next(); } return arr; }, function (e) { last = e; return next(); });
    };
    return next();
  }
  function fetchBatch() {
    // returns a promise of an array of items for the current source
    if (src.type === "search") {
      var q = src.q, kw = encodeURIComponent(q), tag = q.replace(/^#/, "");
      var words = tag.toLowerCase().replace(/[^\w\u00C0-\uFFFF\s]/g, " ").split(/\s+/).filter(Boolean);
      var cands = [];
      var addC = function (t) { if (t && cands.indexOf(t) < 0) cands.push(t); };
      addC(words.join("")); addC(words.join("_")); words.slice().sort(function (x, y) { return y.length - x.length; }).forEach(addC);
      src.chIds = src.chIds || {};
      var oneTag = function (t) {
        var step = src.chIds[t] ? Promise.resolve(src.chIds[t]) : getJSON(BASE + "/api/challenge/search?keywords=" + encodeURIComponent(t) + "&count=5&cursor=0").then(function (j) {
          var d = j && j.data, l = Array.isArray(d) ? d : (d && (d.challenge_list || d.list)) || [];
          var c = l[0]; var id = c && (c.id || c.cid || c.challenge_id);
          if (!id) throw new Error("no hashtag");
          return (src.chIds[t] = id);
        });
        return step.then(function (id) { return getJSON(BASE + "/api/challenge/posts?challenge_id=" + encodeURIComponent(id) + "&count=12&cursor=" + (src.cursor || 0)); }).then(function (j) { return parse(j, src); });
      };
      var viaTag = function () {
        var i = 0, last;
        var next = function () {
          if (i >= cands.length || i >= 4) return Promise.reject(last || new Error("no results"));
          var t = cands[i++];
          return oneTag(t).then(function (arr) { if (arr.length) return arr; last = new Error("empty"); return next(); }, function (e) { last = e; return next(); });
        };
        return next();
      };
      var simple = function () { return getJSON(BASE + "/api/feed/search?keywords=" + kw + "&count=12&cursor=" + (src.cursor || 0)).then(function (j) { return parse(j, src); }); };
      return getJSON(BASE + "/api/feed/search?keywords=" + kw + "&count=12&cursor=" + (src.cursor || 0) + "&web=1&hd=" + (hd ? 1 : 0)).then(function (j) { return parse(j, src); }).then(null, function (e1) {
        return simple().then(null, function (e2) {
          return viaTag().then(null, function (e3) {
            var nm = words.join("");
            if (!nm) throw e3;
            return userPosts(nm, src, 12).then(null, function () { throw e3; });
          }).then(null, function (e3) {
            throw new Error("Search blocked by service (" + ((e1 && e1.message) || "?") + " / " + ((e3 && e3.message) || "?") + ")");
          });
        });
      });
    }
    if (src.type === "user") {
      return userPosts(src.q, src, 12).then(null, function (e) { if (src.cursor) { src.done = true; return []; } throw e; });
    }
    if (src.type === "follow") {
      var tries = 0;
      var step = function () {
        var list = src.list.filter(function (c) { return !src.cur[c.u] || !src.cur[c.u].done; });
        if (!list.length || tries >= 8) return Promise.resolve([]);
        var c = list[src.pos % list.length]; src.pos++; tries++;
        var cur = src.cur[c.u] = src.cur[c.u] || { cursor: 0 };
        return userPosts(c.u, cur, 6, true).then(function (arr) {
          if (!arr.length) { cur.done = true; return step(); }
          return arr;
        }, function (e) { cur.done = true; src.lastErr = e; if (!src.list.filter(function (x) { return !src.cur[x.u] || !src.cur[x.u].done; }).length || tries >= 8) throw (e || src.lastErr); return step(); });
      };
      return step();
    }
    return getJSON(BASE + "/api/feed/list?" + "region=" + (region === "AUTO" ? REGIONS[1 + Math.floor(Math.random() * (REGIONS.length - 1))] : region) + "&" + "count=12").then(function (j) { return parse(j, src); });
  }
  function more() {
    if (busy || src.type === "liked" || src.done) return Promise.resolve(0);
    busy = true; state("Loading…");
    var mySrc = src, myGen = gen;
    return fetchBatch().then(function (arr) {
      if (myGen !== gen) return 0;                                 // the user switched to another feed meanwhile
      var add = arr.filter(function (x) { if (x.id && seen[x.id]) return false; if (x.id) seen[x.id] = 1; return true; });
      items = items.concat(add);
      if (items.length > 150 && idx > 60) { items = items.slice(40); idx -= 40; }
      lastError = ""; busy = false; state(""); return add.length;
    }, function (e) {
      if (myGen === gen) {
        busy = false; state("");
        if (items.length && /404|HTTP 4/.test((e && e.message) || "")) { src.done = true; return 0; }   // end of the list
        lastError = (e && e.message) || String(e);
      }
      throw e;
    });
  }
  var slEl = $("sl"), slT = 0, slI = 0, slOn = false, slPaused = false;
  function slStop() { clearTimeout(slT); slT = 0; slOn = false; slPaused = false; slEl.style.display = "none"; slEl.removeAttribute("src"); v.style.visibility = "visible"; }
  function slPaint(it) {
    slEl.src = it.images[slI];
    $("pos").textContent = label() + "   " + (idx + 1) + "/" + items.length + "   \u00b7   photo " + (slI + 1) + "/" + it.images.length;
    if (!it.urls.length) $("barf").style.width = (100 * (slI + 1) / it.images.length) + "%";
  }
  function slTick(tok) {
    if (tok !== showTok || !slOn) return;
    var it = items[idx]; if (!it) return;
    if (!slPaused) {
      if (slI + 1 < it.images.length) { slI++; slPaint(it); }
      else if (!it.urls.length) { if (autoNext) { nav(next); return; } slI = 0; slPaint(it); }
      else { slI = 0; slPaint(it); }   // music still playing: loop photos until it ends
    }
    slT = setTimeout(function () { slTick(tok); }, 3500);
  }
  function slStart(it) {
    slOn = true; slPaused = false; slI = 0;
    v.style.visibility = "hidden"; slEl.style.display = "block";
    slPaint(it);
    var tok = showTok; clearTimeout(slT);
    slT = setTimeout(function () { slTick(tok); }, 3500);
  }
  function slMove(d) {
    var it = items[idx]; if (!slOn || !it) return false;
    slI = (slI + d + it.images.length) % it.images.length; slPaint(it); return true;
  }
  function resetInfo() {
    slStop();
    v.pause(); v.removeAttribute("src"); v.removeAttribute("poster");
    $("nick").textContent = ""; $("cap").textContent = ""; $("music").textContent = ""; $("stats").textContent = ""; $("pos").textContent = "";
    $("actions").style.display = "none"; setPaused(false); $("barf").style.width = "0";
  }
  var srcStack = [];
  function begin(s, noPush) {
    if (!noPush && src && s !== src) {
      if (s.type === "trend" || s.type === "follow" || s.type === "liked") srcStack = [];
      else if (!(src.type === s.type && src.q === s.q)) { srcStack.push({ type: src.type, q: src.q, cursor: 0 }); if (srcStack.length > 8) srcStack.shift(); }
    }
    src = s; gen++; items = []; seen = {}; idx = -1; errStreak = 0; lastError = ""; failed = false; busy = false; showTok++;
    resetInfo(); state(""); paintFocus();
    if (s.type === "liked") {
      items = likes.slice().reverse();
      if (!items.length) { hideBoot(); center("No liked videos yet."); return; }
      center(""); show(0); return;
    }
    if (s.type === "follow") {
      s.list = follows.slice(); s.pos = 0; s.cur = {};
      if (!s.list.length) { hideBoot(); center("You are not following anyone yet."); return; }
    }
    if (s.first) { var f0 = s.first; s.first = null; items = [f0]; if (f0.id) seen[f0.id] = 1; center(""); show(0); return; }
    if (!booting) loader();
    more().then(function (n) {
      if (s !== src) return;
      if (!n) { fail(src.type === "follow" ? "No videos from the creators you follow." : src.type === "search" ? "No videos found for “" + src.q + "”." : "The feed returned no videos."); return; }
      center(""); show(0);
    }, function (e) { if (s === src) fail((e && e.message) || lastError); });
  }
  function fail(msg) {
    hideBoot(); failed = true;
    if (src && src.type === "user" && /404/.test(String(msg || lastError))) msg = "This creator's videos are not available right now.";
    center("Could not load videos.\n" + (msg || lastError) );
  }

  // ---------- playback ----------
  function play() {
    var p;
    try { p = v.play(); } catch (e) { return; }
    if (p && p.catch) p.catch(function (err) {
      if (!err || err.name !== "NotAllowedError") return;       // other errors are handled by the video "error" event
      v.muted = true; muted = true; paintActions(items[idx]);
      try { var q = v.play(); if (q && q.catch) q.catch(function () {}); } catch (e) {}
      toast("Sound is off", 1500);
    });
  }
  function label() {
    return src.type === "trend" ? "For You  ·  " + rname(region) : src.type === "search" ? "Search: " + src.q : src.type === "user" ? "@" + src.q : src.type === "follow" ? "Following" : "Liked";
  }
  function curKey() { return src.type === "trend" ? "foryou" : src.type === "follow" ? "following" : src.type === "liked" ? "profile" : ""; }
  function paintInfo(it) {
    $("nick").textContent = it.user || it.nick ? "@" + (it.user || it.nick) : "";
    $("cap").textContent = it.title || "";
    $("music").innerHTML = it.music ? NOTE + esc(it.music) : "";
    $("stats").textContent = flags(it);
  }
  function paintActions(it) {
    var A = $("actions");
    if (!it) { A.style.display = "none"; return; }
    A.style.display = "flex";
    var av = $("av");
    if (it.avatar) { if (av.getAttribute("src") !== it.avatar) av.src = it.avatar; av.style.visibility = "visible"; } else av.style.visibility = "hidden";
    var on = isFollowing(it.user);
    $("plus").textContent = on ? "✓" : "+"; setCls($("plus"), "on", on);
    $("lk").textContent = fmt(it.likes); setCls($("a_like"), "liked", isLiked(it));
    $("cm").textContent = fmt(it.comments);
  }
  function show(i) {
    if (i < 0 || i >= items.length) return;
    failed = false; idx = i; showTok++; stallN = 0; lastT = -1;
    var it = items[i];
    if (!it.urls || !it.urls.length) it.urls = it.url ? [it.url] : [];
    it.ui = 0; it.refreshed = false;
    setPaused(false);
    v.poster = it.cover || "";
    $("bg").style.backgroundImage = it.cover ? "url(" + JSON.stringify(it.cover) + ")" : "none";
    slStop();
    if (it.urls[0]) v.src = it.urls[0]; else v.removeAttribute("src");
    v.muted = muted;
    v.loop = !autoNext;
    if (it.images && it.images.length) { if (it.urls[0]) play(); slStart(it); } else play();
    paintInfo(it); paintActions(it);
    $("pos").textContent = label() + "   " + (i + 1) + "/" + items.length;
    $("barf").style.width = "0";
    center("");
    if (src.type !== "liked" && i >= items.length - 3) more().catch(function () {});
    firstHint();
  }
  var navT = 0;
  function nav(f) { var n = Date.now(); if (n - navT < 280) return; navT = n; f(); }   // holding a key must not thrash the decoder
  function next() {
    if (!items.length) { if (failed) begin(src); return; }
    if (idx + 1 < items.length) { show(idx + 1); return; }
    if (src.type === "liked") { toast("That was the last liked video"); return; }
    toast("Loading more…");
    var tok = showTok;
    more().then(function (n) { if (tok !== showTok) return; if (n && idx + 1 < items.length) show(idx + 1); else toast("No more videos"); }, function (e) { toast("Could not load more: " + e.message, 2500); });
  }
  function prev() { if (idx > 0) show(idx - 1); else toast("First video"); }
  function toggle() {
    if (failed) { begin(src); return; }
    if (!items[idx]) return;
    if (slOn) { var itx = items[idx]; if (slPaused) { slPaused = false; if (itx.urls.length) play(); setPaused(false); } else { slPaused = true; v.pause(); setPaused(true); } return; }
    if (v.paused) { play(); setPaused(false); state(""); } else { v.pause(); setPaused(true); }
  }
  function seek(d) {
    if (slOn) { slMove(d > 0 ? 1 : -1); return; }
    if (!isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + d));
    toast((d > 0 ? "+" : "") + d + " sec", 600);
  }
  function needLogin() { return false; }
  function markLogin() { loggedIn = true; save("login", "1"); }
  function like() {
    if (needLogin()) return;
    var it = items[idx]; if (!it) return;
    if (loggedIn && it.id && it.user) { acct("@" + it.user + "/video/" + it.id + "#like", "Liking on your TikTok account…"); return; }
    if (isLiked(it)) { likes = likes.filter(function (l) { return l.id !== it.id; }); toast("Removed from liked"); }
    else { likes.push(slim(it)); if (likes.length > 200) likes.shift(); toast("Liked"); }
    save("likes", JSON.stringify(likes));
    paintInfo(it); paintActions(it);
  }
  function setFollow(c, on) {
    follows = follows.filter(function (f) { return f.u !== c.u; });
    if (on) follows.push({ u: c.u, n: c.n || c.u, a: c.a || "" });
    save("follows", JSON.stringify(follows));
  }
  function follow() {
    if (needLogin()) return;
    var it = items[idx];
    if (loggedIn && ((it && it.user) || (src && src.type === "user" && src.q))) { var cu0 = (it && it.user) || src.q; acct("@" + cu0 + "#follow", "Following @" + cu0 + " on your TikTok account…"); return; }
    if ((!it || !it.user) && src && src.type === "user" && src.q) { var nm = src.q, o2 = !isFollowing(nm); setFollow({ u: nm, n: nm, a: "" }, o2); toast(o2 ? "Following @" + nm : "Unfollowed @" + nm, 1500); return; }
    if (!it || !it.user) { toast("No creator to follow"); return; }
    var on = !isFollowing(it.user);
    setFollow({ u: it.user, n: it.nick, a: it.avatar }, on);
    toast(on ? "Following @" + it.user : "Unfollowed @" + it.user, 1500);
    paintInfo(it); paintActions(it);
  }
  function creator() {
    var it = items[idx]; if (!it || !it.user) { toast("No creator page for this video"); return; }
    setZone("video"); begin({ type: "user", q: it.user, cursor: 0 });
  }
  function openComments() {
    var it = items[idx]; if (!it || !it.id) { toast("No comments for this video"); return; }
    var rows = [{ t: "act", l: "Loading comments…", sub: "", val: "", go: function () {} }];
    openList("Comments", rows, "");
    var lv = listView, cursor = 0, first = true;
    function absU(u) { return !u ? "" : u.indexOf("//") === 0 ? "https:" + u : u.charAt(0) === "/" ? BASE + u : u; }
    function redraw() { if (modal && listView === lv) drawMenu(); }
    function load() {
      getJSON(BASE + "/api/comment/list?url=" + encodeURIComponent(it.id) + "&count=30&cursor=" + cursor).then(function (j) {
        if (listView !== lv) return;
        var d = (j && j.data) || {}, cs = d.comments || [];
        if (first) lv.rows = [];
        lv.rows = lv.rows.filter(function (r) { return !r.more; });
        cs.forEach(function (c) {
          var u = c.user || {};
          lv.rows.push({ t: "act", l: u.nickname || u.unique_id || "user", sub: c.text || "", img: absU(u.avatar), val: c.digg_count ? "♥ " + fmt(c.digg_count) : "", go: function () {} });
        });
        if (first && !cs.length) lv.rows.push({ t: "act", l: "No comments available", sub: (j && j.msg) || "", val: "", go: function () {} });
        first = false;
        if (d.hasMore && cs.length) { cursor = d.cursor || (cursor + cs.length); lv.rows.push({ t: "act", more: 1, l: "Load more comments", sub: "", val: "", go: function () { load(); } }); }
        redraw();
      }, function () {
        if (listView !== lv) return;
        lv.rows = [{ t: "act", l: "Couldn't load comments", sub: "Check the internet connection and try again", val: "", go: function () {} }];
        redraw();
      });
    }
    load();
  }
  function mute() { muted = !muted; v.muted = muted; toast(muted ? "Muted" : "Sound on", 900); paintActions(items[idx]); }
  function toggleFill() { fill = !fill; save("fill", fill ? 1 : 0); applyView(); toast(fill ? "Fill screen" : "Fit screen", 900); }
  function openSite(path) { window.location.href = SITE + (typeof path === "string" ? path : ""); }
  // Logged in = the real TikTok site, so For You / follows / likes are your real account (synced).
  function acct(path, msg) { if (msg) toast(msg, 1800); setTimeout(function () { openSite(path); }, msg ? 350 : 0); }

  // A video link that stops working (expired / blocked) gets a second chance:
  // other quality variants first, then a freshly requested link, and only then it is skipped.
  function videoFailed() {
    var it = items[idx]; if (!it || !it.urls) return;
    var tok = showTok;
    if (it.ui < it.urls.length - 1) { it.ui++; v.src = it.urls[it.ui]; play(); return; }
    if (!it.refreshed && it.id) { refreshItem(it, tok); return; }
    skipVideo(tok);
  }
  function refreshItem(it, tok) {
    it.refreshed = true; toast("Refreshing the video link…", 1500);
    getJSON(BASE + "/api/?url=" + encodeURIComponent(SITE + "@" + (it.user || "tiktok") + "/video/" + it.id) + "&hd=" + (hd ? 1 : 0)).then(function (j) {
      if (!j || j.code !== 0 || !j.data) throw new Error("no data");
      var fresh = urlsOf(j.data);
      if (!fresh.length) throw new Error("no links");
      it.urls = fresh; it.ui = 0;
      if (tok === showTok) { v.src = fresh[0]; play(); }
    }).catch(function () { if (tok === showTok) skipVideo(tok); });
  }
  function skipVideo(tok) {
    errStreak++;
    if (errStreak >= 4) { fail("Videos will not play (the video links may have expired or are blocked)."); return; }
    toast("Skipping a video that will not play", 1200);
    setTimeout(function () { if (tok === showTok) next(); }, 500);
  }

  v.addEventListener("ended", function () { if (autoNext) nav(next); });
  v.addEventListener("timeupdate", function () { if (v.duration) $("barf").style.width = (100 * v.currentTime / v.duration) + "%"; });
  v.addEventListener("playing", function () { errStreak = 0; hideBoot(); if ($("state").textContent === "Buffering…") state(""); });
  v.addEventListener("waiting", function () { if (!v.paused) state("Buffering…"); });
  v.addEventListener("error", function () { if (slOn) return; if (v.getAttribute("src")) videoFailed(); });

  // watchdog: a video that sits there without moving for 12 seconds is treated like a broken link
  var stallN = 0, lastT = -1;
  setInterval(function () {
    if (!items[idx] || v.paused || modal || failed || !v.getAttribute("src")) { stallN = 0; return; }
    if (v.currentTime === lastT && !v.ended) stallN++; else { stallN = 0; lastT = v.currentTime; }
    if (stallN >= 12) { stallN = 0; state(""); videoFailed(); }
  }, 1000);

  // pause while the app is in the background, come back where we were
  var bgPaused = false;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { if (!v.paused) { v.pause(); bgPaused = true; } }
    else if (bgPaused) { bgPaused = false; if (!modal && items[idx]) play(); }
  });
  window.addEventListener("offline", function () { toast("No internet connection", 3000); });
  window.addEventListener("online", function () { toast("Back online", 1500); if (failed || !items.length) begin(src); });

  // ---------- focus: left menu / video / right buttons ----------
  var hintDone = false;
  function firstHint() {
    return;
  }
  function paintFocus() {
    var ck = curKey(), typing = document.activeElement === $("q");
    railEls.forEach(function (el, i) {
      var k = el.getAttribute("data-r");
      setCls(el, "cur", k === ck);
      setCls(el, "foc", zone === "rail" && i === ri && !modal && !typing);
      setCls(el, "typing", k === "search" && typing);
    });
    actEls.forEach(function (el, i) { setCls(el, "foc", zone === "act" && i === ai && !modal); });
    setCls(body, "menuopen", zone === "rail" && !modal);
    setCls(body, "zv", zone === "video" && !modal);
    if (canBack()) arm();
  }
  function setZone(z) {
    zone = z;
    if (z === "rail") { var k = railIndex(curKey()); if (k >= 0) ri = k; $("edgehint").style.display = "none"; }
    if (z === "video") { var q = $("q"); if (document.activeElement === q) q.blur(); }
    paintFocus();
  }
  function railIndex(key) { return RAIL.indexOf(key); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function focusSearch() { zone = "rail"; ri = 0; $("q").focus(); paintFocus(); }
  function activateRail(key) {
    if (loggedIn && { foryou: 1, following: 1, explore: 1, live: 1, profile: 1 }[key]) {
      acct(key === "profile" ? "foryou#profile" : key);
      return;
    }
    switch (key) {
      case "search": focusSearch(); break;
      case "foryou": setZone("video"); begin({ type: "trend", cursor: 0 }); break;
      case "following": setZone("video"); begin({ type: "follow" }); break;
      case "explore": openExplore(); break;
      case "minidramas": setZone("video"); begin({ type: "search", q: "#minidrama", cursor: 0 }); break;
      case "live": setZone("video"); toast("LIVE highlights (recorded lives)", 2200); begin({ type: "search", q: "#livehighlights", cursor: 0 }); break;
      case "profile": setZone("video"); begin({ type: "liked" }); break;
      case "login": openSite(); break;
      case "more": openMenu(); break;
    }
  }
  function activateAct(key) {
    if (key === "comments") openComments(); else if (key === "follow") follow(); else if (key === "like") like(); else if (key === "more") openMenu();
  }

  // ---------- search (left menu) ----------
  var qEl = $("q");
  qEl.onfocus = qEl.onblur = function () { paintFocus(); };
  qEl.onkeydown = function (e) {
    var k = e.keyCode;
    if (k === 13) { e.preventDefault(); e.stopPropagation(); submitSearch(); }
    else if (k === 38 || k === 40) { e.preventDefault(); e.stopPropagation(); qEl.blur(); ri = k === 40 ? 1 : 0; paintFocus(); }
    else if (isBack(k) && (k !== 8 || !qEl.value)) { e.preventDefault(); e.stopPropagation(); qEl.blur(); paintFocus(); }
  };
  function submitSearch() {
    var q = trim(qEl.value);
    if (!q) { toast("Type something to search"); return; }
    qEl.blur();
    if (q.charAt(0) === "@" && trim(q.slice(1))) { setZone("video"); begin({ type: "user", q: trim(q.slice(1)), cursor: 0 }); return; }
    openResults(q);
  }
  function parseUsers(j) {
    if (!j || (j.code !== undefined && j.code !== 0)) throw new Error((j && j.msg) || "search returned an error");
    var d = j.data, list = Array.isArray(d) ? d : (d && (d.user_list || d.users || d.list || d.userList)) || [];
    return list.map(function (x) {
      var u = x.user_info || x.user || x, st = x.stats || u.stats || {};
      var av = u.avatar || u.avatarThumb || u.avatar_larger || (u.avatar_thumb && u.avatar_thumb.url_list && u.avatar_thumb.url_list[0]) || "";
      return { u: u.unique_id || u.uniqueId || "", n: u.nickname || u.nick || "", a: abs(av), f: st.followerCount || u.follower_count || u.followerCount || 0 };
    }).filter(function (c) { return c.u; });
  }
  function normQ(s) { return String(s || "").toLowerCase().replace(/^@/, "").replace(/[^\w\u00C0-\uFFFF]/g, ""); }
  function rankUsers(list, q) {
    var n = normQ(q), seenU = {}, out = [];
    list.forEach(function (c) { var k = c.u.toLowerCase(); if (!seenU[k]) { seenU[k] = 1; out.push(c); } });
    function score(c) { var u = normQ(c.u), nn = normQ(c.n); return u === n ? 4 : nn === n ? 3 : (u.indexOf(n) === 0 || nn.indexOf(n) === 0) ? 2 : (u.indexOf(n) >= 0 || nn.indexOf(n) >= 0) ? 1 : 0; }
    out.forEach(function (c, i) { c._s = score(c) * 1e9 + (c.f || 0) - i; });
    out.sort(function (x, y) { return y._s - x._s; });
    return out;
  }
  // exact @handle lookup (gives avatar + follower count)
  function exactUser(handle) {
    return getJSON(BASE + "/api/user/info?unique_id=" + encodeURIComponent(handle)).then(function (j) {
      var d = j && j.data, u = d && (d.user || d), st = (d && d.stats) || (u && u.stats) || {};
      if (!u || !(u.uniqueId || u.unique_id)) throw new Error("none");
      var av = u.avatarThumb || u.avatar || u.avatarMedium || u.avatar_thumb || "";
      return [{ u: u.uniqueId || u.unique_id, n: u.nickname || "", a: abs(typeof av === "string" ? av : ""), f: st.followerCount || 0 }];
    });
  }
  function creatorsFromVideos(q, count) {
    return getJSON(BASE + "/api/feed/search?keywords=" + encodeURIComponent(q) + "&count=" + count + "&cursor=0&web=1").then(function (j) {
      if (!j || (j.code !== undefined && j.code !== 0)) throw new Error((j && j.msg) || "search returned an error");
      var d = j.data, list = Array.isArray(d) ? d : (d && (d.videos || d.list || d.items)) || [], seenU = {}, out = [];
      list.forEach(function (o) {
        var a = o.author || {}, id = a.unique_id || a.uniqueId;
        if (id && !seenU[id]) { seenU[id] = 1; out.push({ u: id, n: a.nickname || a.nick || id, a: abs(a.avatar || a.avatar_thumb || ""), f: 0 }); }
      });
      return out;
    });
  }
  // Creator search: real user search first, then several fallbacks; results merged and ranked.
  function searchCreators(q) {
    var clean = trim(q).replace(/^@/, ""), found = [];
    var kw = encodeURIComponent(clean);
    var steps = [
      function () { return getJSON(BASE + "/api/user/search?keywords=" + kw + "&count=20&cursor=0").then(parseUsers); },
      function () { return creatorsFromVideos(clean, 20); }
    ];
    var i = 0;
    var next = function () {
      if (i >= steps.length || found.length >= 3) return Promise.resolve(rankUsers(found, clean));
      return steps[i++]().then(function (u) { found = found.concat(u || []); return next(); }, function () { return next(); });
    };
    return next();
  }
  function submitSearchResults(q) {
    var handle = trim(q).replace(/^@/, "");
    var lv = { title: "Creators: " + q, rows: [{ t: "act", l: "Searching creators…", sub: "", val: "", go: function () {} }], hint: "OK open creator   ·   YELLOW follow / unfollow" };
    enterModal(); listView = lv; mi = 0; mtop = 0; drawMenu();
    var users = [], vids = [], pending = 3, errMsg = "";
    var top = [];
    if (loggedIn) top.push({ t: "act", l: "Search on TikTok with my account", sub: "Real results, real follow", val: "", go: function () { acct("search/user?q=" + encodeURIComponent(q)); } });
    function render() {
      if (listView !== lv) return;
      var bottom = [{ t: "act", l: 'Watch videos for "' + q + '"', sub: "Video search", val: "", go: function () { closeMenu(); begin({ type: "search", q: q, cursor: 0 }); } }];
      vids.slice(0, 3).forEach(function (it) {
        bottom.push({ t: "act", l: it.title || ("Video by @" + it.user), sub: "Video  ·  @" + it.user + (it.likes ? "  ·  ♥ " + fmt(it.likes) : ""), img: it.cover, val: "",
          go: function () { closeMenu(); begin({ type: "search", q: q, cursor: 0, first: it }); } });
      });
      var rest;
      if (users.length) rest = userRows(users.slice(0, 10), { head: top, tail: bottom });
      else if (pending > 0) rest = [{ t: "act", l: "Looking for creators…", sub: "", val: "", go: function () {} }];
      else rest = [{ t: "act", l: "No creators found", sub: errMsg || "Try the exact @username", val: "", go: function () {} }];
      lv.rows = top.concat(rest, bottom);
      if (mi >= lv.rows.length) mi = 0;
      drawMenu();
    }
    var exact = /^[\w.]{2,40}$/.test(handle) ? exactUser(handle) : Promise.reject(new Error("skip"));
    render();
    exact.then(function (e1) { users = rankUsers(e1.concat(users), handle); }, function () {}).then(function () { pending--; render(); });
    searchCreators(q).then(function (u) { users = rankUsers(users.concat(u), handle); }, function (e) { errMsg = (e && e.message) || ""; }).then(function () { pending--; render(); });
    getJSON(BASE + "/api/feed/search?keywords=" + encodeURIComponent(q) + "&count=12&cursor=0&web=1&hd=" + (hd ? 1 : 0)).then(function (j) {
      var d = j && j.data, list = Array.isArray(d) ? d : (d && (d.videos || d.list || d.items)) || [];
      vids = list.map(norm).filter(function (x) { return x.urls.length || x.images.length; });
    }).then(null, function () {}).then(function () { pending--; render(); });
  }
  function openResults(q) { submitSearchResults(q); }

  // ---------- centre modal: results, settings, log in ----------
  var modal = false, mi = 0, mtop = 0, listView = null, resumeAfter = false;
  function enterModal() { if (!modal) { resumeAfter = !v.paused && !!items[idx] && !failed; v.pause(); } modal = true; paintFocus(); }
  function userRows(list, opts) {
    return list.map(function (c) {
      return {
        t: "act", l: c.n || c.u, sub: "@" + c.u + (c.f ? "  ·  " + fmt(c.f) + " followers" : ""), img: c.a,
        val: isFollowing(c.u) ? "Following" : "",
        go: function () { closeMenu(); begin({ type: "user", q: c.u, cursor: 0 }); },
        alt: function () {
          if (needLogin()) return;
          if (loggedIn) { acct("@" + c.u + "#follow", "Following @" + c.u + " on your TikTok account…"); return; }
          setFollow(c, !isFollowing(c.u));
          if (opts && opts.removeOnUnfollow) {
            listView.rows = userRows(follows, opts);
            if (mi >= listView.rows.length) mi = Math.max(0, listView.rows.length - 1);
            if (!listView.rows.length) { closeMenu(); toast("You are not following anyone"); return; }
          } else listView.rows = (opts && opts.head ? [].concat(opts.head) : []).concat(userRows(list, opts), opts && opts.tail ? opts.tail : []);
          drawMenu();
        }
      };
    });
  }
  function openList(title, rows, hint, note) { enterModal(); listView = { title: title, rows: rows, hint: hint, note: note }; mi = 0; mtop = 0; drawMenu(); }
  function openExplore() {
    var cats = [["Comedy", "#comedy"], ["Singing & Dancing", "#dance"], ["Sports", "#sports"], ["Anime & Comics", "#anime"], ["Food", "#food"], ["Gaming", "#gaming"], ["Cars", "#cars"], ["Animals", "#pets"], ["Beauty Care", "#beauty"], ["Fitness & Health", "#fitness"], ["Travel", "#travel"], ["Technology", "#tech"]];
    openList("Explore", cats.map(function (c) {
      return { t: "act", l: c[0], sub: "", val: "", go: function () { closeMenu(); begin({ type: "search", q: c[1], cursor: 0 }); } };
    }), "");
  }
  function openLogin() {
    openList("Log in to TikTok", [
      { t: "act", l: "Log in with QR code", sub: "TikTok shows a QR code on the screen", val: "", go: function () { markLogin(); openSite("login/qrcode"); } },
      { t: "act", l: "Don't want to scan? Log in with email or username", sub: "tiktok.com/login/phone-or-email/email", val: "", go: function () { markLogin(); openSite("login/phone-or-email/email"); } }
    ], "",
    "After logging in, For You, Following, Explore, Profile, likes and follows all use your real TikTok account.");
  }
  var svEl = null;
  function closeServerBox() { if (svEl && svEl.parentNode) svEl.parentNode.removeChild(svEl); svEl = null; paintFocus(); }
  function askServer() {
    closeMenu();
    svEl = document.createElement("div");
    svEl.style.cssText = "position:absolute;left:50%;top:50%;width:1100px;margin:-170px 0 0 -550px;background:#121212;border:2px solid #333;border-radius:26px;padding:30px 36px;z-index:40;box-shadow:0 20px 80px rgba(0,0,0,.8)";
    svEl.innerHTML = '<div style="font-size:36px;font-weight:700;margin-bottom:8px">Server address</div>' +
      '<div style="font-size:23px;color:#aaa;line-height:1.4;margin-bottom:16px;white-space:pre-line">Type your server IP or web address, for example\n192.168.1.20:8080   or   https://my-server.example.com\nPress OK to save. Leave it empty to go back to the default server.</div>' +
      '<input id="svq" type="text" autocomplete="off" spellcheck="false" style="width:100%;height:70px;font-size:34px;padding:0 20px;border-radius:14px;border:3px solid #1a3584;background:#fff;color:#000;outline:0">';
    document.body.appendChild(svEl);
    var inp = svEl.querySelector("#svq");
    inp.value = BASE === DEFAULT_BASE ? "" : BASE;
    inp.onkeydown = function (e) {
      if (e.keyCode !== 13) return;
      e.preventDefault(); e.stopPropagation();
      var nb = normBase(inp.value);
      if (nb) save("server", nb); else { try { localStorage.removeItem("tt2_server"); } catch (x) {} }
      BASE = nb || DEFAULT_BASE; modes = {}; uidCache = {};
      closeServerBox(); toast("Server: " + BASE.replace(/^https?:\/\//, ""), 2500);
      begin({ type: "trend", cursor: 0 });
    };
    setTimeout(function () { inp.focus(); }, 50);
  }
  function mainRows() {
    var it = items[idx], cu = it && it.user, r = [];
    if (cu) {
      r.push({ t: "act", l: "More from @" + cu, val: "", go: function () { closeMenu(); begin({ type: "user", q: cu, cursor: 0 }); } });
      r.push({ t: "act", l: isFollowing(cu) ? "Unfollow @" + cu : "Follow @" + cu, val: "", go: function () { follow(); } });
    }
    r.push({ t: "act", l: "For You region", val: "< " + rname(region) + " >", go: function () { closeMenu(); begin({ type: "trend", cursor: 0 }); }, lr: function (d) { region = REGIONS[(REGIONS.indexOf(region) + d + REGIONS.length) % REGIONS.length]; save("region", region); } });
    r.push({ t: "act", l: "Creators I follow", val: follows.length + "", go: function () {
      if (!follows.length) { toast("You are not following anyone yet"); return; }
      openList("Creators I follow", userRows(follows, { removeOnUnfollow: true }), "");
    } });
    r.push({ t: "act", l: "Sound", val: muted ? "Off" : "On", go: mute, lr: mute });
    r.push({ t: "act", l: "Fill screen", val: fill ? "On" : "Off", go: toggleFill, lr: toggleFill });
    var q = function () { hd = !hd; save("hd", hd ? 1 : 0); };
    r.push({ t: "act", l: "Video quality", val: hd ? "HD (slower)" : "Fast", go: q, lr: q });
    var a = function () { autoNext = !autoNext; save("auto", autoNext ? 1 : 0); v.loop = !autoNext; };
    r.push({ t: "act", l: "After a video ends", val: autoNext ? "Play next" : "Repeat", go: a, lr: a });
    r.push({ t: "act", l: "Server address", val: BASE === DEFAULT_BASE ? "Off" : BASE.replace(/^https?:\/\//, ""), go: function () { askServer(); } });
    r.push({ t: "act", l: "Switch to Web", val: "", go: function () { openSite("foryou"); } });
    r.push({ t: "act", l: "Close", val: "", go: function () { closeMenu(); } });
    return r;
  }
  function curView() {
    return listView || { title: "Settings", rows: mainRows(), hint: "" };
  }
  function drawMenu() {
    var vw = curView(), r = vw.rows;
    if (mi >= r.length) mi = Math.max(0, r.length - 1);
    if (mi < mtop) mtop = mi; if (mi >= mtop + VIS) mtop = mi - VIS + 1;
    var h = "<h2>" + esc(vw.title) + "</h2>";
    if (vw.note) h += '<div class="note">' + esc(vw.note) + "</div>";
    h += '<div class="more">' + (mtop > 0 ? "▲ more" : "&nbsp;") + "</div>";
    for (var i = mtop; i < Math.min(r.length, mtop + VIS); i++) {
      var x = r[i];
      h += '<div class="m' + (i === mi ? " sel" : "") + '" data-i="' + i + '"><span class="lab">' + (x.img ? '<img src="' + esc(x.img) + '" alt="">' : "") + "<span>" + esc(x.l) + (x.sub ? "<small>" + esc(x.sub) + "</small>" : "") + "</span></span>";
      h += '<span class="val">' + esc(x.val || "") + "</span></div>";
    }
    h += '<div class="more">' + (mtop + VIS < r.length ? "▼ more" : "&nbsp;") + "</div>";
    var m = $("menu"); m.innerHTML = h; m.style.display = "block";
    Array.prototype.forEach.call(m.querySelectorAll(".m"), function (el) {
      el.onclick = function () { mi = +el.getAttribute("data-i"); activate(); };
    });
  }
  function openMenu() { enterModal(); listView = null; mi = 0; mtop = 0; drawMenu(); }
  function closeMenu() {
    var was = modal;
    modal = false; listView = null; $("menu").style.display = "none";
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    zone = "video"; paintFocus();
    if (was && items[idx] && !failed && resumeAfter) { play(); state(""); paintInfo(items[idx]); paintActions(items[idx]); }
    resumeAfter = false;
  }
  function activate() {
    var x = curView().rows[mi]; if (!x) return;
    x.go && x.go(); if (modal) drawMenu();
  }

  // ---------- keys ----------
  function colorKey(k) {
    switch (k) {
      case 403: like(); return true;
      case 404: mute(); return true;
      case 405: follow(); return true;
      case 406: openMenu(); return true;
      case 457: creator(); return true;
      case 427: case 34: nav(next); return true;
      case 428: case 33: nav(prev); return true;
      case 412: seek(-10); return true;
      case 417: seek(10); return true;
    }
    return false;
  }
  function isBack(k) { return k === 461 || k === 27 || k === 8 || k === 4 || k === 10009 || k === 166 || k === 95; }
  function modalKey(e) {
    var k = e.keyCode, rows = curView().rows, n = rows.length, x = rows[mi];
    if (isBack(k) || k === 406 || k === 457) { e.preventDefault(); closeMenu(); return; }
    if (!n) return;
    if (k === 38) mi = (mi + n - 1) % n;
    else if (k === 40) mi = (mi + 1) % n;
    else if (k === 13) { e.preventDefault(); activate(); return; }
    else if (k === 37 || k === 39) { if (x && x.lr) x.lr(k === 39 ? 1 : -1); }
    else if (k === 405) { if (x && x.alt) x.alt(); e.preventDefault(); return; }
    else return;
    e.preventDefault(); if (modal) drawMenu();
  }
  function railKey(e) {
    var k = e.keyCode;
    if (k === 38) ri = clamp(ri - 1, 0, RAIL.length - 1);
    else if (k === 40) ri = clamp(ri + 1, 0, RAIL.length - 1);
    else if (k === 13) { e.preventDefault(); activateRail(RAIL[ri]); return; }
    else if (k === 39 || isBack(k)) { e.preventDefault(); setZone("video"); return; }
    else if (k === 37) { /* already on the left */ }
    else if (colorKey(k)) { e.preventDefault(); return; }
    else return;
    e.preventDefault(); paintFocus();
  }
  var okAT = 0;
  function actKey(e) {
    var k = e.keyCode;
    if (k === 37) { if (ai > 0) ai--; else { e.preventDefault(); setZone("video"); return; } }
    else if (k === 39) ai = clamp(ai + 1, 0, ACTS.length - 1);
    else if (k === 38 || isBack(k)) { e.preventDefault(); setZone("video"); return; }
    else if (k === 40) { /* bottom */ }
    else if (k === 13) {
      e.preventDefault(); if (e.repeat) return;
      if (okAT) { clearTimeout(okAT); okAT = 0; like(); return; }   // double press = like
      var key = ACTS[ai]; okAT = setTimeout(function () { okAT = 0; activateAct(key); }, 300); return;
    }
    else if (colorKey(k)) { e.preventDefault(); return; }
    else return;
    e.preventDefault(); paintFocus();
  }
  function videoKey(e) {
    var k = e.keyCode, f = null;
    switch (k) {
      case 40: f = function () { nav(next); }; break;
      case 38: f = function () { nav(prev); }; break;
      case 13: f = function () { if (e.repeat) return; okPress(); }; break;
      case 415: case 19: f = toggle; break;
      case 37: f = function () { setZone("rail"); }; break;
      case 39: f = function () { if (items[idx]) setZone("act"); }; break;
      case 461: case 27: return;                                  // Back: let webOS close the app
      default: if (colorKey(k)) { e.preventDefault(); } return;
    }
    e.preventDefault(); f();
  }
  // ---- Back: close the top-most layer (typing, comments / menus, side panels, search results), else let webOS exit.
  // Handled on keydown AND keyup, by key code or key name, and through a history entry as a last resort.
  var backT = 0, backDown = false, armed = false;
  function canBack() { return !!svEl || modal || zone !== "video" || document.activeElement === qEl || srcStack.length > 0; }
  function arm() { if (armed) return; try { history.pushState({ tt: 1 }, ""); armed = true; } catch (e) {} }
  function goBack() {
    if (svEl) { closeServerBox(); return true; }
    if (document.activeElement === qEl) { qEl.blur(); paintFocus(); return true; }
    if (modal) { closeMenu(); return true; }
    if (zone !== "video") { setZone("video"); return true; }
    if (srcStack.length) { var p = srcStack.pop(); toast("Back", 700); begin({ type: p.type, q: p.q, cursor: 0 }, true); return true; }
    return false;
  }
  function handleBack() { if (!goBack()) return false; backT = Date.now(); arm(); return true; }
  function isBackEv(e) {
    var k = e.keyCode, key = e.key;
    if (k === 8 && e.target && e.target.tagName === "INPUT" && e.target.value) return false;   // Backspace while typing
    return isBack(k) || key === "GoBack" || key === "BrowserBack" || key === "XF86Back" || key === "Escape";
  }
  window.addEventListener("keydown", function (e) {
    if (!isBackEv(e)) return;
    if (handleBack()) { backDown = true; e.preventDefault(); e.stopPropagation(); } else backDown = false;
  }, true);
  window.addEventListener("keyup", function (e) {
    if (!isBackEv(e)) return;
    if (backDown) { backDown = false; e.preventDefault(); e.stopPropagation(); return; }
    if (handleBack()) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener("popstate", function () {
    armed = false;
    if (Date.now() - backT < 400) { arm(); return; }
    if (goBack()) { backT = Date.now(); arm(); return; }
    try { window.close(); } catch (e) {}
  });
  document.addEventListener("keydown", function (e) {
    if (e.target && e.target.tagName === "INPUT") return;       // typing is handled by the field itself
    wake();
    if (modal) modalKey(e);
    else if (zone === "rail") railKey(e);
    else if (zone === "act") actKey(e);
    else videoKey(e);
  }, true);

  // ---------- magic remote / mouse ----------
  var curT = 0;
  function wake() { body.classList.remove("nocur"); clearTimeout(curT); curT = setTimeout(function () { body.classList.add("nocur"); }, 5000); }
  document.addEventListener("mousemove", wake);
  v.addEventListener("click", function () { if (modal) return; if (zone !== "video") setZone("video"); okPress(); });
  $("center").addEventListener("click", function () { if (failed) begin(src); });
  railEls.forEach(function (el, i) {
    el.addEventListener("click", function () { ri = i; zone = "rail"; activateRail(RAIL[i]); });
  });
  actEls.forEach(function (el, i) {
    el.addEventListener("click", function () { ai = i; zone = "act"; paintFocus(); activateAct(ACTS[i]); });
  });
  var wheelT = 0;
  window.addEventListener("wheel", function (e) {
    if (modal || Date.now() - wheelT < 450) return;
    wheelT = Date.now(); if (e.deltaY > 0) nav(next); else if (e.deltaY < 0) nav(prev);
  }, { passive: true });

  // ---------- start ----------
  applyView(); paintFocus(); wake();
  window.__app = {
    begin: begin,
    rowLabels: function () { return curView().rows.map(function (r) { return r.l; }); },
    state: function () { return { idx: idx, n: items.length, src: src.type, q: src.q, muted: muted, fill: fill, paused: v.paused, follows: follows.length, boot: booting, zone: zone, modal: modal, failed: failed }; }
  };
  setTimeout(hideBoot, 15000);                                   // never leave the splash up forever
  if (navigator.onLine === false) {
    hideBoot(); center("No internet connection.\nConnect your TV to the network and the videos will load by themselves.");
  } else begin(src);
})();
