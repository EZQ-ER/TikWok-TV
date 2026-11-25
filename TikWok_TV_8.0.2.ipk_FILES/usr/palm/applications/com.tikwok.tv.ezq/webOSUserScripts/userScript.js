;(function () {
  try {
    var host = location.hostname;
    if (!/(^|\.)tiktok\.com$/.test(host) || host === "tv.tiktok.com") return;
    if (window.__ttRemote) return;
    window.__ttRemote = 1;

    var ZOOMS = [1, 0.85, 1.25], zi = 0, muteSet = false, muted = false, toastT = 0;
    try { var z = parseInt(localStorage.getItem("tt_zoom2"), 10); if (z >= 0 && z < ZOOMS.length) zi = z; } catch (e) {}
    var $ = function (s, r) { return (r || document).querySelector(s); };

    // ---------- page helpers ----------
    function onLogin() { return /^\/(login|signup)/.test(location.pathname); }
    function feedPage() { return /^\/(foryou|following|friends)?\/?$/.test(location.pathname) || /\/video\//.test(location.pathname); }
    function vids() {
      return Array.prototype.slice.call(document.querySelectorAll("video")).filter(function (v) {
        var r = v.getBoundingClientRect(); return r.width > 50 && r.height > 50;
      });
    }
    function visible(r) {
      var h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      var w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      return h > 0 && w > 0 ? h * w : 0;
    }
    function current() {
      var best = null, ba = 0;
      vids().forEach(function (v) { var a = visible(v.getBoundingClientRect()); if (a > ba) { ba = a; best = v; } });
      return best;
    }
    function boxOf(v) { return (v && (v.closest("article") || v.closest('[data-e2e="recommend-list-item-container"]'))) || document; }
    function playSafe(v) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    function txt(box, sels) {
      for (var i = 0; i < sels.length; i++) { var el = $(sels[i], box); if (el && (el.textContent || "").trim()) return el.textContent.trim(); }
      return "";
    }

    // ---------- styles: TV performance + hide TikTok's own chrome + our UI ----------
    var css = "" +
      "*,*::before,*::after{transition-duration:.01ms!important;transition-delay:0s!important;animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;text-shadow:none!important;box-shadow:none!important}" +
      "body{cursor:none}" +
      // feed pages: hide TikTok's side nav, header, right action column, text overlays, banners
      "body.ttfeed [class*='DivSideNavContainer'],body.ttfeed [class*='SideNavContainer'],body.ttfeed [class*='DivHeaderContainer'],body.ttfeed [class*='HeaderContainer'],body.ttfeed [class*='DivActionItemContainer'],body.ttfeed [class*='ActionBarContainer'],body.ttfeed [class*='DivInfoContainer'],body.ttfeed [class*='DivVideoInfoContainer'],body.ttfeed [class*='DivBottomContainer'],body.ttfeed [class*='DivProgressBar'],body.ttfeed [class*='DivMediaCardBottom'],body.ttfeed [class*='DivKeyboardShortcut'],body.ttfeed [class*='DivBannerContainer'],body.ttfeed [class*='DivAppDownload'],body.ttfeed [data-e2e='video-desc'],body.ttfeed [data-e2e='video-author-uniqueid'],body.ttfeed [data-e2e='video-music'],body.ttfeed [data-e2e='feed-follow'],body.ttfeed [data-e2e='arrow-left'],body.ttfeed [data-e2e='arrow-right']{display:none!important}" +
      "body.ttfeed{background:#000!important}" +
      // our UI
      "#ttx{position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;pointer-events:none;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#fff;display:none}" +
      "body.ttfeed #ttx{display:block}" +
      "#ttx svg{display:block;fill:currentColor}" +
      "#ttshade{position:absolute;left:0;top:0;width:100%;height:100%;background:linear-gradient(180deg,rgba(0,0,0,.12) 0,rgba(0,0,0,0) 35%,rgba(0,0,0,.55) 78%,rgba(0,0,0,.85) 100%)}" +
      "#ttinfo{position:absolute;left:64px;bottom:118px;width:520px}" +
      "#ttnick{font-size:34px;font-weight:700;margin-bottom:12px;word-break:break-word}" +
      "#ttcap{font-size:38px;line-height:1.16;font-weight:700;color:#f0f0f0;max-height:4.7em;overflow:hidden;word-break:break-word}" +
      "#ttmusic{font-size:24px;color:#d2d2d2;margin-top:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#ttstats{font-size:24px;color:#5a78ee;margin-top:10px}" +
      "#ttact{position:absolute;left:50%;bottom:30px;width:1000px;margin-left:-500px;display:none;flex-direction:row;justify-content:center;align-items:flex-start}" +
      "body.ttfeed.ttshowact #ttact{display:flex}" +
      ".tta{width:200px;display:flex;flex-direction:column;align-items:center}" +
      ".ttico{width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff}" +
      ".ttico svg{width:58px;height:58px}" +
      ".tta.foc .ttico{background:#fff;color:#111;transform:scale(1.14)}" +
      ".tta.liked .ttico{color:#9508bb}.tta.liked.foc .ttico{color:#9508bb}" +
      ".ttal{margin-top:12px;height:34px;font-size:27px;font-weight:700;opacity:.8;white-space:nowrap}.tta.foc .ttal{opacity:1}" +
      "#ttavw{position:relative;width:80px;height:80px;margin:8px 0;border-radius:50%}" +
      ".tta.foc #ttavw{transform:scale(1.18);box-shadow:0 0 0 6px #fff!important}" +
      "#ttav{width:80px;height:80px;border-radius:50%;background:#333;border:3px solid #fff;object-fit:cover;display:block}" +
      "#ttplus{position:absolute;left:50%;bottom:-12px;margin-left:-14px;width:28px;height:28px;border-radius:50%;background:#9508bb;color:#fff;font-size:24px;line-height:27px;text-align:center;font-weight:700}" +
      "#ttplus.on{background:#fff;color:#9508bb}" +
      "#ttleft{position:absolute;left:0;top:0;bottom:0;width:480px;padding:48px 40px;background:rgba(14,14,14,.96);transform:translateX(-100%);pointer-events:none}" +
      "body.ttrail #ttleft{transform:none;pointer-events:auto;display:block}" +
      "body.ttrail #ttx{display:block}" +
      ".ttr{display:flex;align-items:center;height:52px;margin:0 0 2px;padding:0 18px;border-radius:26px;font-size:26px;font-weight:600;color:#e8e8e8;border:3px solid transparent;width:360px}" +
      ".ttr.foc{background:#fff;color:#000;border-color:#fff}" +
      ".ttr.search{background:rgba(255,255,255,.14);height:58px;margin-bottom:14px;font-weight:400}.ttr.search.foc{background:#fff}" +
      ".ttr input{flex:1;min-width:0;font:inherit;font-size:27px;color:inherit;background:transparent;border:0;outline:0;padding:0;height:56px;pointer-events:auto}" +
      ".ttr.search.typing{background:#fff;color:#000;border-color:#5a78ee}" +
      "#ttbar{position:absolute;left:0;bottom:0;height:7px;width:100%;background:rgba(255,255,255,.18)}#ttbarf{display:block;height:100%;width:0;background:#9508bb}" +
      "#ttpause{position:absolute;left:50%;top:50%;width:130px;height:130px;margin:-65px 0 0 -65px;border-radius:50%;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center}" +
      "#tttoast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:rgba(24,24,24,.95);border:2px solid #3a3a3a;border-radius:30px;padding:14px 34px;font-size:29px;color:#fff;font-family:sans-serif;display:none;white-space:pre;text-align:center;max-width:1600px;z-index:2147483647;pointer-events:none}";
    var st = document.createElement("style"); st.textContent = css;
    (document.head || document.documentElement).appendChild(st);

    // ---------- our overlay ----------
    var P = {
      heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
      chat: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
      grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
      snd: "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4z",
      play: "M8 5v14l11-7z"
    };
    function ico(p) { return '<svg viewBox="0 0 24 24"><path d="' + p + '"/></svg>'; }
    var RAIL = [
      { k: "search" }, { k: "foryou", t: "For You", go: "/foryou" }, { k: "explore", t: "Explore", go: "/explore" },
      { k: "following", t: "Following", go: "/following" }, { k: "live", t: "LIVE", go: "/live" }, { k: "profile", t: "Profile" },
      { k: "zoom", t: "Zoom" }, { k: "reload", t: "Reload page" }
    ];
    var ACTS = ["follow", "like", "comments", "creator", "mute"];
    var root = document.createElement("div"); root.id = "ttx";
    var h = '<div id="ttshade"></div><div id="ttinfo"><div id="ttnick"></div><div id="ttcap"></div><div id="ttmusic"></div><div id="ttstats"></div></div>' +
      '<div id="ttact">' +
      '<div class="tta" data-a="follow"><div id="ttavw"><img id="ttav" alt=""><div id="ttplus">+</div></div><div class="ttal">Follow</div></div>' +
      '<div class="tta" data-a="like" id="tta_like"><div class="ttico">' + ico(P.heart) + '</div><div class="ttal"><span id="ttlk">0</span></div></div>' +
      '<div class="tta" data-a="comments"><div class="ttico">' + ico(P.chat) + '</div><div class="ttal">Comments <span id="ttcm">0</span></div></div>' +
      '<div class="tta" data-a="creator"><div class="ttico">' + ico(P.grid) + '</div><div class="ttal">Videos</div></div>' +
      '<div class="tta" data-a="mute"><div class="ttico">' + ico(P.snd) + '</div><div class="ttal" id="ttsnd">Sound</div></div></div>' +
      '<div id="ttpause">' + ico(P.play).replace("<svg", '<svg style="width:64px;height:64px;margin-left:8px"') + '</div>' +
      '<div id="ttbar"><i id="ttbarf"></i></div>' +
      '<div id="ttleft"><div class="ttr search" data-r="search"><svg viewBox="0 0 24 24" style="width:30px;height:30px;margin-right:18px;flex:none"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg><input id="ttq" type="text" placeholder="Search creators" maxlength="80" autocomplete="off" spellcheck="false"></div>' +
      RAIL.slice(1).map(function (r) { return '<div class="ttr" data-r="' + r.k + '">' + r.t + "</div>"; }).join("") + "</div>";
    root.innerHTML = h;
    var toastEl = document.createElement("div"); toastEl.id = "tttoast";
    function mount() {
      if (!document.body) return;
      if (!root.parentNode) { document.body.appendChild(root); document.body.appendChild(toastEl); bind(); }
    }
    function toast(msg, ms) {
      if (!document.body) return;
      toastEl.textContent = msg; toastEl.style.display = "block";
      clearTimeout(toastT); toastT = setTimeout(function () { toastEl.style.display = "none"; }, ms || 1500);
    }

    // ---------- actions on the real page (your real account) ----------
    var FSEL = '[data-e2e="follow-button"],[data-e2e="feed-follow"],[data-e2e="browse-follow"],[data-e2e="user-follow-button"],[data-e2e="recommend-list-follow-button"]';
    function findFollow(box) {
      var el = $(FSEL, box);
      if (el) return el.closest("button") || el;
      var bs = box.querySelectorAll("button");
      for (var i = 0; i < bs.length; i++) { if ((bs[i].textContent || "").replace(/\s+/g, " ").trim().toLowerCase() === "follow") return bs[i]; }
      return null;
    }
    function likeBtn(box) { var el = $('[data-e2e="like-icon"],[data-e2e="browse-like-icon"]', box) || $('[data-e2e="like-icon"],[data-e2e="browse-like-icon"]'); return el && (el.closest("button") || el); }
    function isLiked(box) { var b = likeBtn(box); return !!b && b.getAttribute("aria-pressed") === "true"; }
    function isFollowing(box) { var b = findFollow(box); if (b) return false; return !!$('[data-e2e="feed-follow"],[data-e2e="browse-follow"],[data-e2e="follow-button"]', box) ? false : true; }
    function like() {
      var b = likeBtn(boxOf(current()));
      if (!b) { toast("Like button not found"); return; }
      b.click(); toast(b.getAttribute("aria-pressed") === "true" ? "Liked" : "Like toggled", 900); setTimeout(refresh, 400);
    }
    function follow() {
      var b = findFollow(boxOf(current())) || findFollow(document);
      if (!b) { toast("Already following (or no follow button)"); return; }
      var t = (b.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (t && t !== "follow") { toast("Already following"); return; }
      b.click(); toast("Followed", 900); setTimeout(refresh, 600);
    }
    function comments() {
      var el = $('[data-e2e="comment-icon"],[data-e2e="browse-comment-icon"]', boxOf(current())) || $('[data-e2e="comment-icon"],[data-e2e="browse-comment-icon"]');
      if (!el) { toast("Comments not available"); return; }
      (el.closest("button") || el).click();
    }
    function creator() {
      var a = $('a[href^="/@"]', boxOf(current()));
      if (!a) { toast("No creator page for this video"); return; }
      location.href = a.getAttribute("href").split("?")[0];
    }
    function mute() { muteSet = true; muted = !muted; vids().forEach(function (v) { v.muted = muted; }); toast(muted ? "Muted" : "Sound on", 900); refresh(); }
    function toggle() {
      var v = current(); if (!v) return;
      if (v.paused) playSafe(v); else v.pause();
      setTimeout(refresh, 100);
    }
    function seek(d) { var v = current(); if (!v) return; var max = isFinite(v.duration) ? v.duration : 1e9; v.currentTime = Math.max(0, Math.min(max, v.currentTime + d)); toast((d > 0 ? "+" : "") + d + " s", 600); }
    function go(dir) {
      var cur = current(), vs = vids();
      if (!cur) { window.scrollBy(0, dir * window.innerHeight); return; }
      vs.sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
      var t = vs[vs.indexOf(cur) + dir];
      if (t) (t.closest("article") || t.parentElement || t).scrollIntoView({ behavior: "auto", block: "center" });
      else {
        var el = cur.parentElement;
        while (el && el !== document.body && el.scrollHeight <= el.clientHeight + 5) el = el.parentElement;
        (el && el !== document.body ? el : window).scrollBy({ top: dir * (cur.clientHeight || window.innerHeight), behavior: "auto" });
      }
      setTimeout(function () { var c = current(); if (c && c.paused) playSafe(c); refresh(); }, 700);
    }
    function zoom() {
      zi = (zi + 1) % ZOOMS.length; document.documentElement.style.zoom = ZOOMS[zi];
      try { localStorage.setItem("tt_zoom2", String(zi)); } catch (e) {}
      toast("Zoom " + Math.round(ZOOMS[zi] * 100) + "%", 900);
    }
    function profile() {
      var p = $('[data-e2e="nav-profile"]');
      if (p) { (p.closest("a") || p).click(); return; }
      location.href = "/foryou#profile";
    }

    // ---------- refresh overlay from the current video ----------
    var lastV = null;
    function refresh() {
      if (!document.body) return;
      document.body.classList.toggle("ttfeed", feedPage() && !onLogin());
      if (!feedPage() || onLogin()) return;
      var v = current(); if (!v) return;
      var box = boxOf(v);
      if (v !== lastV) {   // keep only one video decoding at a time
        vids().forEach(function (o) { if (o !== v && !o.paused) o.pause(); });
        lastV = v; if (muteSet) v.muted = muted;
      }
      var nick = txt(box, ['[data-e2e="video-author-uniqueid"]', '[data-e2e="browse-username"]', 'a[href^="/@"]']);
      $("#ttnick").textContent = nick ? (nick.charAt(0) === "@" ? nick : "@" + nick) : "";
      $("#ttcap").textContent = txt(box, ['[data-e2e="video-desc"]', '[data-e2e="browse-video-desc"]']);
      $("#ttmusic").textContent = txt(box, ['[data-e2e="video-music"]', '[data-e2e="browse-music"]']);
      var liked = isLiked(box);
      $("#ttstats").textContent = liked ? "Liked" : "";
      $("#ttlk").textContent = txt(box, ['[data-e2e="like-count"]', '[data-e2e="browse-like-count"]']) || "Like";
      $("#ttcm").textContent = txt(box, ['[data-e2e="comment-count"]', '[data-e2e="browse-comment-count"]']) || "";
      $("#tta_like").classList.toggle("liked", liked);
      var av = $('[data-e2e="video-author-avatar"] img,[data-e2e="browse-user-avatar"] img', box);
      var avEl = $("#ttav"); if (av && av.src && avEl.getAttribute("src") !== av.src) avEl.src = av.src;
      var fb = findFollow(box); var on = !fb;
      $("#ttplus").textContent = on ? "✓" : "+"; $("#ttplus").classList.toggle("on", on);
      $("#ttsnd").textContent = v.muted ? "Muted" : "Sound";
      $("#ttpause").style.display = v.paused ? "flex" : "none";
      if (v.duration) $("#ttbarf").style.width = (100 * v.currentTime / v.duration) + "%";
    }
    setInterval(refresh, 500);
    document.addEventListener("play", function (e) {
      if (muteSet && e.target && e.target.tagName === "VIDEO") e.target.muted = muted;
    }, true);

    // ---------- focus zones: video / act (right buttons) / rail (left menu) ----------
    var zone = "video", ri = 1, ai = 1, railOpen = false, okAT = 0, qEl = null;
    function paintFocus() {
      var typing = document.activeElement === qEl;
      Array.prototype.forEach.call(root.querySelectorAll(".ttr"), function (el, i) {
        el.classList.toggle("foc", railOpen && i === ri && !typing);
        el.classList.toggle("typing", el.getAttribute("data-r") === "search" && typing);
      });
      Array.prototype.forEach.call(root.querySelectorAll(".tta"), function (el, i) { el.classList.toggle("foc", zone === "act" && i === ai); });
      document.body.classList.toggle("ttrail", railOpen);
      document.body.classList.toggle("ttshowact", zone === "act");
    }
    function setRail(on) { railOpen = on; if (on) zone = "video"; if (!on && qEl) qEl.blur(); paintFocus(); }
    function setZone(z) { zone = z; railOpen = false; paintFocus(); }
    function submitSearch() {
      var q = (qEl.value || "").replace(/^\s+|\s+$/g, "");
      if (!q) { toast("Type a creator name"); return; }
      location.href = "/search/user?q=" + encodeURIComponent(q.replace(/^@/, ""));
    }
    function railGo(key) {
      var r = RAIL.filter(function (x) { return x.k === key; })[0];
      if (key === "search") { qEl.focus(); paintFocus(); return; }
      if (key === "profile") { setRail(false); profile(); return; }
      if (key === "zoom") { zoom(); return; }
      if (key === "reload") { location.reload(); return; }
      if (r && r.go) location.href = r.go;
    }
    function bind() {
      qEl = $("#ttq");
      qEl.addEventListener("focus", paintFocus); qEl.addEventListener("blur", paintFocus);
      qEl.addEventListener("keydown", function (e) {
        var k = e.keyCode; e.stopPropagation();
        if (k === 13) { e.preventDefault(); submitSearch(); }
        else if (k === 38 || k === 40) { e.preventDefault(); qEl.blur(); ri = k === 40 ? 1 : 0; paintFocus(); }
        else if ((k === 461 || k === 27 || (k === 8 && !qEl.value)) ) { e.preventDefault(); qEl.blur(); paintFocus(); }
      }, true);
      Array.prototype.forEach.call(root.querySelectorAll(".ttr"), function (el, i) {
        el.style.pointerEvents = "auto"; el.addEventListener("click", function () { ri = i; railGo(el.getAttribute("data-r")); });
      });
      Array.prototype.forEach.call(root.querySelectorAll(".tta"), function (el, i) {
        el.style.pointerEvents = "auto"; el.addEventListener("click", function () { ai = i; doAct(ACTS[i]); });
      });
    }
    function doAct(k) { if (k === "follow") follow(); else if (k === "like") like(); else if (k === "comments") comments(); else if (k === "creator") creator(); else if (k === "mute") mute(); }

    var HELP = "LEFT: menu & search    RIGHT: follow / like / comments / videos\nUP / DOWN: next / previous video    OK: play / pause (twice = like)\nRed like   Green mute   Yellow follow   Blue menu   STOP reload";
    var LOGIN_ALT = "https://www.tiktok.com/login/phone-or-email/email";
    var loginBar = null;
    function loginHint() {
      if (!document.body) return;
      if (!onLogin()) { if (loginBar) loginBar.style.display = "none"; return; }
      if (!loginBar) {
        loginBar = document.createElement("div");
        loginBar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483646;background:rgba(0,0,0,.88);color:#fff;font:26px/1.5 sans-serif;padding:14px 30px;text-align:center;pointer-events:none";
        document.body.appendChild(loginBar);
      }
      var qr = /\/qrcode/.test(location.pathname);
      loginBar.textContent = (qr ? "Scan the QR code with the TikTok app on your phone.   No phone? Press YELLOW to log in with email or username.   " : "") + "Press BACK to return to the app.";
      loginBar.style.display = "block";
    }
    

    var COLOR = {
      403: like, 404: mute, 405: follow, 457: function () { toast(HELP, 6000); },
      413: function () { location.reload(); }, 406: function () { setRail(!railOpen); }
    };
    window.addEventListener("keydown", function (e) {
      var k = e.keyCode;
      if (onLogin()) {
        if (k === 405 && /\/qrcode/.test(location.pathname)) { e.preventDefault(); e.stopImmediatePropagation(); location.href = LOGIN_ALT; }
        return;
      }
      mount();
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
      var feed = feedPage(), used = true;
      if (COLOR[k]) { e.preventDefault(); e.stopImmediatePropagation(); COLOR[k](); return; }
      if (railOpen) {
        if (k === 38) ri = Math.max(0, ri - 1);
        else if (k === 40) ri = Math.min(RAIL.length - 1, ri + 1);
        else if (k === 13) { railGo(RAIL[ri].k); }
        else if (k === 39 || k === 461 || k === 27 || k === 8) setRail(false);
        else used = false;
        if (used) { e.preventDefault(); e.stopImmediatePropagation(); paintFocus(); }
        return;
      }
      if (!feed) return;   // search / profile pages: arrows and OK behave normally
      if (zone === "act") {
        if (k === 37) { if (ai > 0) ai--; else setZone("video"); }
        else if (k === 39) ai = Math.min(ACTS.length - 1, ai + 1);
        else if (k === 38 || k === 461 || k === 27 || k === 8) setZone("video");
        else if (k === 40) { }
        else if (k === 13) { if (e.repeat) { e.preventDefault(); return; } if (okAT) { clearTimeout(okAT); okAT = 0; like(); } else { var a = ACTS[ai]; okAT = setTimeout(function () { okAT = 0; doAct(a); }, 300); } }
        else used = false;
        if (used) { e.preventDefault(); e.stopImmediatePropagation(); paintFocus(); }
        return;
      }
      var f = null;
      switch (k) {
        case 40: case 427: case 34: f = function () { go(1); }; break;
        case 38: case 428: case 33: f = function () { go(-1); }; break;
        case 37: f = function () { setRail(true); }; break;
        case 39: f = function () { setZone("act"); refresh(); }; break;
        case 412: f = function () { seek(-10); }; break;
        case 417: f = function () { seek(10); }; break;
        case 13: f = function () { if (e.repeat) return; if (okAT) { clearTimeout(okAT); okAT = 0; like(); } else okAT = setTimeout(function () { okAT = 0; toggle(); }, 300); }; break;
        case 415: case 19: f = toggle; break;
      }
      if (!f) return;
      e.preventDefault(); e.stopImmediatePropagation(); f();
    }, true);

    // links from the lite app: #follow / #like / #profile run once the page has loaded
    function hashAction() {
      var what = (location.hash || "").replace("#", "");
      if (what !== "follow" && what !== "like" && what !== "profile") return;
      var n = 0, t = setInterval(function () {
        if (++n > 30) { clearInterval(t); return; }
        try {
          if (what === "profile") { var p = $('[data-e2e="nav-profile"]'); if (p) { clearInterval(t); (p.closest("a") || p).click(); } return; }
          if (what === "follow") {
            var b = findFollow(document); if (!b) return;
            clearInterval(t); history.replaceState(null, "", location.pathname + location.search);
            var tx = (b.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
            if (tx === "follow") { b.click(); toast("Followed", 1500); } else toast("Already following", 1500);
            return;
          }
          var l = likeBtn(document); if (!l) return;
          clearInterval(t); history.replaceState(null, "", location.pathname + location.search);
          if (l.getAttribute("aria-pressed") !== "true") { l.click(); toast("Liked", 1500); } else toast("Already liked", 1500);
        } catch (e) {}
      }, 600);
    }

    // close login / cookie pop-ups that cover the feed
    setInterval(function () { var b = $('[data-e2e="modal-close-inner-button"]'); if (b) b.click(); }, 3000);

    function init() {
      mount(); refresh();
      if (ZOOMS[zi] !== 1) document.documentElement.style.zoom = ZOOMS[zi];
      hashAction();
      var seen = 0;
      try { seen = localStorage.getItem("tt_help"); localStorage.setItem("tt_help", "1"); } catch (e) {}
      if (!seen && feedPage()) toast(HELP, 7000);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  } catch (err) { /* never break the page */ }
})();
