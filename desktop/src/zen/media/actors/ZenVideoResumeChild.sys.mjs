const MIN_RESUME_SECONDS = 10;
const SAVE_INTERVAL_SECONDS = 5;
const PAUSE_ON_RESTORE_PREF = "zen.video-resume.pause-on-restore";

export class ZenVideoResumeChild extends JSWindowActorChild {
  #checkedVideoId = null;
  #lastSavedTime = -Infinity;
  #firstVideoChecked = false;
  #pauseOnPlayVideoId = null;

  handleEvent(event) {
    if (event.type === "pagehide") {
      const video = this.document.querySelector("#movie_player video");
      if (video) {
        this.#save(video, true);
      }
      return;
    }
    const video = event.target;
    if (video.localName !== "video" || !video.closest("#movie_player")) {
      return;
    }
    if (event.type === "play") {
      this.#pauseIfRestored(video);
    } else if (event.type === "pause") {
      this.#save(video, true);
    } else if (event.type === "loadedmetadata") {
      this.#restore(video);
    } else {
      this.#save(video, false);
    }
  }

  #videoId() {
    const url = new URL(this.document.location.href);
    return url.pathname === "/watch" ? url.searchParams.get("v") : null;
  }

  #isAd(video) {
    return !!video.closest(".ad-showing");
  }

  async #restore(video) {
    const videoId = this.#videoId();
    if (!videoId || this.#checkedVideoId === videoId || this.#isAd(video)) {
      return;
    }
    this.#checkedVideoId = videoId;
    this.#lastSavedTime = -Infinity;
    const isRestoredPage = !this.#firstVideoChecked && this.#isRestoredNavigation();
    this.#firstVideoChecked = true;
    if (isRestoredPage) {
      this.#requestPause(video, videoId);
    }
    if (new URL(this.document.location.href).searchParams.has("t")) {
      return;
    }
    const time = await this.sendQuery("ZenVideoResume:Get", { videoId });
    if (
      time > MIN_RESUME_SECONDS &&
      video.currentTime < MIN_RESUME_SECONDS &&
      this.#videoId() === videoId &&
      !this.#isAd(video)
    ) {
      video.currentTime = time;
      this.#requestPause(video, videoId);
    }
  }

  #isRestoredNavigation() {
    const navigationType =
      this.contentWindow.performance.getEntriesByType("navigation")[0]?.type;
    return navigationType === "back_forward" || navigationType === "reload";
  }

  #requestPause(video, videoId) {
    if (!Services.prefs.getBoolPref(PAUSE_ON_RESTORE_PREF, true)) {
      return;
    }
    this.#pauseOnPlayVideoId = videoId;
    this.#pauseIfRestored(video);
  }

  #pauseIfRestored(video) {
    if (
      video.paused ||
      this.#isAd(video) ||
      !this.#pauseOnPlayVideoId ||
      this.#pauseOnPlayVideoId !== this.#videoId()
    ) {
      return;
    }
    this.#pauseOnPlayVideoId = null;
    video.pause();
  }

  #save(video, force) {
    const videoId = this.#videoId();
    if (!videoId || this.#isAd(video) || !Number.isFinite(video.duration)) {
      return;
    }
    if (this.#checkedVideoId !== videoId) {
      this.#restore(video);
      return;
    }
    const time = video.currentTime;
    if (!force && Math.abs(time - this.#lastSavedTime) < SAVE_INTERVAL_SECONDS) {
      return;
    }
    this.#lastSavedTime = time;
    this.sendAsyncMessage("ZenVideoResume:Save", {
      videoId,
      time,
      duration: video.duration,
    });
  }
}
