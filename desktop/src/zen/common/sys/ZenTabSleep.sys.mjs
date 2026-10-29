const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
  webrtcUI: "resource:///modules/webrtcUI.sys.mjs",
});

const SLEEP_TIMEOUT_PREF = "zen.tabs.sleep.timeout-minutes";
const SLEEP_CHECK_INTERVAL_MS = 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

class nsZenTabSleep {
  #checkInterval = null;

  init() {
    Services.prefs.addObserver(SLEEP_TIMEOUT_PREF, () => this.#schedule());
    this.#schedule();
  }

  get #sleepTimeoutMs() {
    return Services.prefs.getIntPref(SLEEP_TIMEOUT_PREF, 0) * MS_PER_MINUTE;
  }

  #schedule() {
    if (this.#checkInterval) {
      lazy.clearInterval(this.#checkInterval);
      this.#checkInterval = null;
    }
    if (this.#sleepTimeoutMs > 0) {
      this.#checkInterval = lazy.setInterval(
        () => this.#sleepIdleTabs().catch(console.error),
        SLEEP_CHECK_INTERVAL_MS
      );
    }
  }

  #isBusy(tab) {
    const browser = tab.linkedBrowser;
    return (
      !browser ||
      browser.docShellIsActive ||
      tab.soundPlaying ||
      tab.pictureinpicture ||
      tab.hasAttribute("busy") ||
      lazy.webrtcUI.browserHasStreams(browser) ||
      !!browser.browsingContext?.currentWindowGlobal?.hasActivePeerConnections()
    );
  }

  #canSleep(tab, lastAccessDeadline) {
    return (
      !tab.selected &&
      !tab.closing &&
      !tab.hasAttribute("pending") &&
      tab.linkedPanel &&
      tab.lastAccessed < lastAccessDeadline &&
      !this.#isBusy(tab)
    );
  }

  async #sleepIdleTabs() {
    const lastAccessDeadline = Date.now() - this.#sleepTimeoutMs;
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      const { gBrowser, gZenWorkspaces } = win;
      if (!gBrowser || win.closed) {
        continue;
      }
      const tabs = gZenWorkspaces?.allStoredTabs ?? gBrowser.tabs;
      for (const tab of tabs) {
        if (!this.#canSleep(tab, lastAccessDeadline)) {
          continue;
        }
        await gBrowser.prepareDiscardBrowser(tab);
        if (this.#canSleep(tab, lastAccessDeadline)) {
          gBrowser.discardBrowser(tab);
        }
      }
    }
  }
}

export const gZenTabSleep = new nsZenTabSleep();
