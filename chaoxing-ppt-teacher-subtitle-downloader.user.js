// ==UserScript==
// @name         超星课程直播录播下载助手
// @namespace    https://newes.chaoxing.com/
// @version      0.4.5
// @description  下载教师录像、PPT录像、学生全景、字幕VTT和清洗字幕。
// @author       Codex
// @match        http://newes.chaoxing.com/*
// @match        https://newes.chaoxing.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @connect      *
// ==/UserScript==

(function () {
  "use strict";

  var ID = "cx-record-download-panel", rv = 0, full = false, lesson = "";
  var VS = [["teacherTrack", "教师录像", "teacher"], ["pptVideo", "PPT录像", "ppt"], ["studentFull", "学生全景", "student"]];

  function q(s, r) { return (r || document).querySelector(s); }
  function enc(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&"); }
  function param(k, u) { try { return new URL(u || location.href, location.href).searchParams.get(k) || ""; } catch (e) { return ""; } }
  function cleanName(s) { return String(s || "chaoxing-record").replace(/\s+/g, " ").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 90) || "chaoxing-record"; }
  function ext(u) { try { return (new URL(u).pathname.match(/\.([a-z0-9]{2,5})$/i) || [])[0] || ".mp4"; } catch (e) { return ".mp4"; } }
  function fmt(b) {
    var n = Number(b);
    if (!n) return "";
    if (n >= 1024 * 1024) return Math.round(n / 1024 / 1024) + "MB";
    if (n >= 1024) return Math.round(n / 1024) + "KB";
    return n + "B";
  }
  function toast(t) {
    var n = q("#cx-record-toast") || document.body.appendChild(document.createElement("div"));
    n.id = "cx-record-toast"; n.textContent = t;
    n.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:8px;border-radius:4px;background:#222;color:#fff;font-size:12px";
    clearTimeout(toast.t); toast.t = setTimeout(function () { n.remove(); }, 2500);
  }
  function cn(n) {
    var c = "零一二三四五六七八九", x = Number(n);
    return !x ? n || "" : x <= 10 ? (x === 10 ? "十" : c[x]) : x < 20 ? "十" + c[x % 10] : c[Math.floor(x / 10)] + "十" + (x % 10 ? c[x % 10] : "");
  }
  function wday(n) { return ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"][Number(n)] || ""; }
  function pageTitle() {
    if (lesson) return lesson;
    try {
      var d = window.top.document, nodes = d.querySelectorAll(".w_top_vidio_ul li,#signleCourseList li");
      var text = Array.prototype.map.call(nodes, function (x) { return x.innerText || ""; }).join("\n") || d.body.innerText || "";
      var c = (text.match(/课程[:：]\s*([^\n\r_·]+)/) || [])[1], w = (text.match(/第\s*(\d+)\s*周/) || text.match(/进度[:：]\s*第\s*(\d+)\s*\//) || [])[1];
      if (c) return cleanName(c + (w ? "-第" + cn(w) + "周" : ""));
    } catch (e) {}
    return cleanName(document.title);
  }
  function file(suffix) { return pageTitle() + "-" + suffix; }

  function scriptVal(k) {
    var text = Array.prototype.map.call(document.scripts, function (s) { return s.textContent || ""; }).join("\n");
    return (text.match(new RegExp('["\\\']?' + k + '["\\\']?\\s*[:=]\\s*[\\\'"]?(\\d+)')) || [])[1] || "";
  }
  function parseInfoText(txt) {
    var m = String(txt || "").match(/var\s+infostr\s*=\s*(["'][\s\S]*?["'])\s*;/);
    if (!m) return null;
    try {
      var s = JSON.parse(m[1]);
      try { return JSON.parse(decodeURIComponent(s)); } catch (e) { return JSON.parse(s); }
    } catch (e) { return null; }
  }
  function parseInfo(doc, win) {
    try { if (win && win.info && win.info.videoPath) return win.info; } catch (e) {}
    for (var i = 0, ss = doc ? doc.scripts : []; i < ss.length; i++) {
      var info = parseInfoText(ss[i].textContent);
      if (info) return info;
    }
    return { videoPath: {} };
  }
  function items(info) {
    var p = (info && info.videoPath) || {};
    return VS.map(function (v) {
      var u = p[v[0]];
      return /^https?:\/\//i.test(u || "") ? { key: v[0], label: v[1], url: u, suffix: v[2] + ext(u) } : null;
    }).filter(Boolean);
  }
  function findTarget() {
    var list = [{ win: unsafeWindow, doc: document, url: location.href }];
    Array.prototype.forEach.call(document.querySelectorAll("iframe"), function (f) {
      try { list.push({ win: f.contentWindow, doc: f.contentDocument, url: f.src || f.contentWindow.location.href }); }
      catch (e) { list.push({ win: null, doc: null, url: f.src || "" }); }
    });
    for (var i = 0; i < list.length; i++) {
      var info = parseInfo(list[i].doc, list[i].win);
      if (items(info).length) return { info: info, url: list[i].url || location.href };
    }
    return { info: parseInfo(document, unsafeWindow), url: location.href };
  }
  function playerUrl(t) {
    var f = q("#viewFrame");
    return f && f.src ? f.src : /playVideo2Keda/.test(t.url || "") ? t.url : "";
  }
  function loadTarget(done) {
    var t = findTarget(), u = playerUrl(t);
    if (items(t.info).length || !u) return done(t);
    fetch(u, { credentials: "include" }).then(function (r) { return r.text(); }).then(function (html) {
      var info = parseInfoText(html);
      done(info && items(info).length ? { info: info, url: u } : t);
    }).catch(function () { done(t); });
  }
  function subUrl(t) {
    var id = param("workDetailId", t.url) || param("workDetailId"), f = q("#viewFrame");
    if (!id && f && f.src) id = param("workDetailId", f.src);
    return id ? new URL("/xidianpj/smartSupervisor/getVideoSubtitles2Vtt?workDetailId=" + encodeURIComponent(id), location.origin).href : "";
  }
  function loadLesson(t, done) {
    var liveId = (t.info && t.info.liveId) || param("liveId", t.url) || param("liveId") || scriptVal("liveId");
    var fid = scriptVal("fid"), uId = scriptVal("uId");
    if (lesson || !liveId || !fid || !uId) return done();
    fetch("/xidianpj/live/listSignleCourse", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: enc({ liveId: liveId, fid: fid, uId: uId })
    }).then(function (r) { return r.json(); }).then(function (list) {
      var it = (list || []).filter(function (x) { return String(x.id) === String(liveId); })[0];
      if (it) lesson = cleanName([it.courseName, it.days && "第" + it.days + "周", wday(it.weekDay), it.jie && "第" + it.jie + "节"].filter(Boolean).join("-"));
      done();
    }).catch(done);
  }

  function clickDl(u, name) {
    var a = document.body.appendChild(document.createElement("a"));
    a.href = u; a.download = name || ""; a.target = "_blank"; a.rel = "noopener"; a.click(); a.remove();
  }
  function copy(u) {
    function ok() { toast("已复制链接"); }
    if (typeof GM_setClipboard === "function") { GM_setClipboard(u); return ok(); }
    if (navigator.clipboard) return navigator.clipboard.writeText(u).then(ok).catch(function () { copyFallback(u); });
    copyFallback(u);
  }
  function copyFallback(u) {
    var t = document.body.appendChild(document.createElement("textarea"));
    t.value = u; t.style.cssText = "position:fixed;left:-9999px;top:-9999px"; t.select(); document.execCommand("copy"); t.remove(); toast("已复制链接");
  }
  function shQuote(s) {
    return "'" + String(s).replace(/'/g, "'\"'\"'") + "'";
  }
  function aria2(u, name) {
    copy("aria2c -c -o " + shQuote(name) + " " + shQuote(u));
    toast("已复制 aria2 命令");
  }
  function progress(name) {
    var panel = q("#" + ID) || document.body, box = q("#cx-record-progress") || panel.appendChild(document.createElement("div"));
    box.id = "cx-record-progress"; box.style.cssText = "margin-top:6px;padding-top:4px;border-top:1px solid #ccc";
    var row = box.appendChild(document.createElement("div"));
    row.style.cssText = "margin-top:4px;font-size:12px";
    row.innerHTML = '<div style="display:flex;gap:4px;align-items:center"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span><button type="button">取消</button></div><div style="height:4px;margin-top:3px;background:#ddd;overflow:hidden"><i style="display:block;width:0;height:100%;background:#333"></i></div><div style="margin-top:2px;color:#555">等待中...</div>';
    var span = row.querySelector("span"), cancel = row.querySelector("button"), bar = row.querySelector("i"), status = row.querySelectorAll("div")[2];
    span.textContent = name;
    return {
      cancel: cancel,
      set: function (pct, text) { if (pct != null) bar.style.width = Math.max(0, Math.min(100, pct)) + "%"; status.textContent = text || ""; },
      done: function (text) { cancel.remove(); bar.style.width = "100%"; status.textContent = text || "完成"; setTimeout(function () { row.remove(); if (!box.children.length) box.remove(); }, 5000); }
    };
  }
  function download(u, name) {
    if (!u) return toast("没有找到资源地址");
    if (typeof GM_xmlhttpRequest !== "function") return clickDl(u, name);
    var p = progress(name), req = GM_xmlhttpRequest({
      method: "GET", url: u, responseType: "blob", timeout: 0,
      onprogress: function (e) {
        var loaded = fmt(e.loaded);
        e.lengthComputable ? p.set(Math.floor(e.loaded / e.total * 100), Math.floor(e.loaded / e.total * 100) + "% · " + loaded + " / " + fmt(e.total)) : p.set(null, "已加载 " + loaded);
      },
      onload: function (r) {
        if (r.status < 200 || r.status >= 300) { clickDl(u, name); return p.done("请求失败，已打开链接"); }
        var bu = URL.createObjectURL(r.response); clickDl(bu, name); setTimeout(function () { URL.revokeObjectURL(bu); }, 30000); p.done("已开始下载"); toast("已开始下载：" + name);
      },
      onerror: function () { clickDl(u, name); p.done("准备失败，已打开链接"); },
      ontimeout: function () { clickDl(u, name); p.done("准备超时，已打开链接"); }
    });
    p.cancel.addEventListener("click", function () { if (req && req.abort) req.abort(); p.done("已取消"); toast("已取消：" + name); });
    p.set(0, "正在连接...");
  }
  function textDl(text, name) {
    var u = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    clickDl(u, name); setTimeout(function () { URL.revokeObjectURL(u); }, 10000);
  }
  function cleanVtt(vtt) {
    return String(vtt || "").replace(/^\uFEFF/, "").split(/\r?\n/).map(function (x) { return x.trim(); }).filter(function (x) {
      return x && !/^WEBVTT\b|^NOTE\b/i.test(x) && !/-->/.test(x) && !/^\d+$/.test(x);
    }).join("，");
  }
  function subtitleTxt(u, name) {
    fetch(u, { credentials: "include" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (vtt) { textDl(cleanVtt(vtt), name); toast("已生成清洗字幕：" + name); })
      .catch(function () { toast("字幕处理失败，已改为下载原 VTT"); download(u, name.replace(/\.txt$/i, ".vtt")); });
  }

  function headerSize(h) {
    var m = String(h || "").match(/^content-length:\s*(\d+)/im) || String(h || "").match(/^content-range:\s*bytes\s+\d+-\d+\/(\d+)/im);
    return m ? Number(m[1]) : 0;
  }
  function showSize(btn, label, u) {
    if (!u || typeof GM_xmlhttpRequest !== "function") return;
    function set(h) { var s = fmt(headerSize(h)); if (s) btn.textContent = btn.title = label + " (" + s + ")"; }
    GM_xmlhttpRequest({ method: "HEAD", url: u, timeout: 10000, onload: function (r) {
      headerSize(r.responseHeaders) ? set(r.responseHeaders) : GM_xmlhttpRequest({ method: "GET", url: u, headers: { Range: "bytes=0-0" }, timeout: 10000, onload: function (rr) { set(rr.responseHeaders); } });
    } });
  }
  function addBtn(panel, label, u, action, size, name) {
    var row = panel.appendChild(document.createElement("div")), b = row.appendChild(document.createElement("button")), c = row.appendChild(document.createElement("button")), d = row.appendChild(document.createElement("button"));
    row.style.cssText = "display:flex;gap:4px;margin-top:3px;align-items:center";
    b.type = c.type = d.type = "button"; b.textContent = label; c.textContent = "链接"; d.textContent = "aria2"; b.disabled = c.disabled = d.disabled = !u;
    b.style.cssText = "font-size:12px;white-space:nowrap;width:132px;padding-left:4px;padding-right:4px";
    c.style.cssText = d.style.cssText = "font-size:12px;white-space:nowrap;width:42px;padding-left:2px;padding-right:2px";
    if (u) {
      b.addEventListener("click", action);
      c.addEventListener("click", function () { copy(u); });
      d.addEventListener("click", function () { aria2(u, name || label); });
    }
    if (size) showSize(b, label, u);
  }

  function render() {
    var token = ++rv;
    loadTarget(function (t) {
      if (token !== rv) return;
      loadLesson(t, function () {
        if (token !== rv) return;
        var info = t.info, vs = items(info), vtt = subUrl(t), old = q("#" + ID);
        if (full || (old && old.getAttribute("data-has-videos") === "1") || (old && !vs.length)) return;
        if (old) old.remove();
        if (!vs.length && !vtt) return;
        var p = document.body.appendChild(document.createElement("div"));
        p.id = ID; p.setAttribute("data-has-videos", vs.length ? "1" : "0"); full = !!vs.length;
        p.style.cssText = "position:fixed;right:8px;top:60px;z-index:2147483647;width:230px;padding:4px;box-sizing:border-box;border:1px solid #999;background:#fff;color:#000;font:12px sans-serif";
        p.innerHTML = '<div style="font-weight:bold;margin-bottom:3px">录播下载</div>';
        vs.forEach(function (x) { var name = file(x.suffix); addBtn(p, x.label, x.url, function () { download(x.url, name); }, true, name); });
        addBtn(p, "字幕 VTT", vtt, function () { download(vtt, file("subtitle.vtt")); }, true, file("subtitle.vtt"));
        addBtn(p, "字幕 TXT", vtt, function () { subtitleTxt(vtt, file("subtitle.txt")); }, false, file("subtitle.vtt"));
        var r = p.appendChild(document.createElement("button"));
        r.type = "button"; r.textContent = "刷新识别"; r.style.cssText = "margin-top:4px;font-size:12px";
        r.addEventListener("click", function () { full = false; p.remove(); setTimeout(render, 200); });
        toast("已识别到录播资源");
      });
    });
  }
  function boot() {
    if (window.top !== window.self) return;
    render(); setTimeout(render, 1200); setTimeout(render, 3000);
    var f = q("#viewFrame");
    if (f) f.addEventListener("load", function () {
      var old = q("#" + ID);
      if (old && old.getAttribute("data-has-videos") === "1") return;
      if (old) old.remove();
      setTimeout(render, 300);
    });
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();
})();
