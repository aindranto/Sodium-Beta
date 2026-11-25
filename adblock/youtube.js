// Sodium — YouTube adblock (script version 1.1.0, see manifest.json)
//
// Maintained in the Sodium repo (adblock/youtube.js) so it can be
// updated independently of app releases: Sodium periodically
// downloads the newest version of this file and injects it into
// YouTube service webviews at creation time. The copy bundled with
// the app is the fallback until a download succeeds.
//
// What it does: hides ad slots with CSS and, for in-stream ads,
// plays the ad muted at 16x speed (and clicks the skip button the
// moment it appears) until the ad ends, then restores the video's
// own speed and mute state. Seeking to the end of the ad is only a
// bonus attempt: YouTube's ad player reverts seeks, so playback
// rate is the strategy that actually finishes ads.
// It only ever runs on youtube.com hosts (Sodium checks before
// injecting; the script checks again here). Not 100% by design:
// some YouTube ads are served from the same domains as the video
// itself, and YouTube actively detects blockers.
(function () {
  "use strict";
  var host = location.hostname || "";
  if (host !== "youtube.com" && !/\.youtube\.com$/.test(host)) return;
  if (window.__sodiumYtAdblock) return;
  window.__sodiumYtAdblock = true;

  var CSS_HIDE = [
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-sparkles-text-search-renderer",
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "#player-ads",
    "#masthead-ad",
    ".ytp-ad-overlay-container",
    ".ytp-ad-text-overlay",
    "ytd-statement-banner-renderer",
    ".ytd-mealbar-promo-renderer",
    "ytd-enforcement-message-view-model"
  ].join(",") + "{display:none!important}";

  function injectStyle() {
    try {
      if (document.getElementById("sodium-yt-adblock-style")) return;
      var st = document.createElement("style");
      st.id = "sodium-yt-adblock-style";
      st.textContent = CSS_HIDE;
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { /* page not ready yet; the observer retries */ }
  }

  // State of the video before the current ad break started, saved
  // once per break so the content's own speed/mute can be restored
  // when the break ends. null while no ad is showing.
  var adState = null;

  function skipAds() {
    try {
      var player = document.querySelector(".html5-video-player");
      var video = player ? player.querySelector("video") : null;
      var adShowing = !!(player && player.classList.contains("ad-showing"));

      if (!adShowing) {
        // Ad break over (or never started): hand the video back
        // exactly as it was before the break.
        if (adState) {
          if (video) {
            try { video.playbackRate = adState.rate; } catch (e) {}
            try { video.muted = adState.muted; } catch (e) {}
          }
          adState = null;
        }
        return;
      }

      if (!video) return;

      // First tick of a new break: remember the content's state.
      if (!adState) {
        adState = { muted: !!video.muted, rate: video.playbackRate || 1 };
      }

      var skip = document.querySelector(
        ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-skip-ad-button-modern, .ytp-ad-skip-button-container button"
      );
      if (skip) { try { skip.click(); } catch (e) {} return; }

      // Main strategy: race through the ad muted at 16x. (Seeking
      // to the end does not work on its own — the ad player reverts
      // it — but it is kept as a bonus attempt below.)
      try { video.muted = true; } catch (e) {}
      try { video.playbackRate = 16; } catch (e) {}
      if (isFinite(video.duration) && video.duration > 0) {
        try { video.currentTime = video.duration; } catch (e) {}
      }
    } catch (e) { /* never break the page */ }
  }

  var tickQueued = false;
  function tick() {
    if (tickQueued) return;
    tickQueued = true;
    setTimeout(function () {
      tickQueued = false;
      injectStyle();
      skipAds();
    }, 200);
  }

  function boot() {
    injectStyle();
    try {
      var obs = new MutationObserver(tick);
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* interval below still covers skipping */ }
    setInterval(skipAds, 500);
    skipAds();
  }

  if (document.documentElement) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
