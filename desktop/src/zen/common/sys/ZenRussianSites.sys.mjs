const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

const LIST_URL =
  "https://raw.githubusercontent.com/FlasterMC/OverNet/updates/russian-sites.json";
const LIST_PREF = "zen.russian-sites.list";
const DISABLED_PREF = "zen.russian-sites.disabled";
const CUSTOM_PREF = "zen.russian-sites.custom";
const TRUSTED_PREF = "zen.russian-sites.trusted-certificates";
const REFRESH_INTERVAL_SECONDS = 4 * 60 * 60;
const FINGERPRINT_PATTERN = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;
const RUSSIAN_HOST_PATTERN = /\.(ru|su|xn--p1ai)$/;

function readJSONPref(name) {
  try {
    return JSON.parse(Services.prefs.getStringPref(name, ""));
  } catch {
    return null;
  }
}

class nsZenRussianSites {
  #initialized = false;

  init() {
    if (this.#initialized) {
      return;
    }
    this.#initialized = true;
    for (const pref of [LIST_PREF, DISABLED_PREF, CUSTOM_PREF]) {
      Services.prefs.addObserver(pref, () => this.#applyTrustedCertificates());
    }
    this.#applyTrustedCertificates();
    Cc["@mozilla.org/updates/timer-manager;1"]
      .getService(Ci.nsIUpdateTimerManager)
      .registerTimer(
        "zen-russian-sites",
        { notify: () => this.refresh() },
        REFRESH_INTERVAL_SECONDS
      );
    this.refresh();
  }

  get sites() {
    const sites = readJSONPref(LIST_PREF)?.sites;
    return Array.isArray(sites) ? sites : [];
  }

  get customSites() {
    const sites = readJSONPref(CUSTOM_PREF);
    return Array.isArray(sites) ? sites : [];
  }

  get disabledSites() {
    return new Set(
      Services.prefs.getStringPref(DISABLED_PREF, "").split(",").filter(Boolean)
    );
  }

  setSiteEnabled(id, enabled) {
    const disabled = this.disabledSites;
    if (enabled) {
      disabled.delete(id);
    } else {
      disabled.add(id);
    }
    Services.prefs.setStringPref(DISABLED_PREF, [...disabled].join(","));
  }

  async addCustomSite(address) {
    let host;
    try {
      host = Services.io
        .newURI(address.includes("://") ? address : `https://${address}`)
        .asciiHost.toLowerCase();
    } catch {
      throw new Error("invalid-address");
    }
    if (!RUSSIAN_HOST_PATTERN.test(host)) {
      throw new Error("not-russian");
    }
    const fingerprint = await this.#fetchCertificateFingerprint(host);
    const sites = this.customSites.filter(site => site.host != host);
    sites.push({ host, certificates: [fingerprint] });
    Services.prefs.setStringPref(CUSTOM_PREF, JSON.stringify(sites));
    return host;
  }

  removeCustomSite(host) {
    Services.prefs.setStringPref(
      CUSTOM_PREF,
      JSON.stringify(this.customSites.filter(site => site.host != host))
    );
  }

  async refresh() {
    try {
      const response = await fetch(LIST_URL, { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const list = await response.json();
      if (Array.isArray(list?.sites)) {
        Services.prefs.setStringPref(LIST_PREF, JSON.stringify(list));
      }
    } catch (error) {
      console.error("ZenRussianSites: failed to refresh the list", error);
    }
  }

  #applyTrustedCertificates() {
    const disabled = this.disabledSites;
    const fingerprints = new Set();
    for (const site of this.sites) {
      if (!disabled.has(site.id)) {
        for (const fingerprint of Object.keys(site.certificates ?? {})) {
          fingerprints.add(fingerprint);
        }
      }
    }
    for (const site of this.customSites) {
      for (const fingerprint of site.certificates ?? []) {
        fingerprints.add(fingerprint);
      }
    }
    Services.prefs.setStringPref(
      TRUSTED_PREF,
      [...fingerprints]
        .filter(fingerprint => FINGERPRINT_PATTERN.test(fingerprint))
        .join(" ")
    );
  }

  #fetchCertificateFingerprint(host) {
    const channel = lazy.NetUtil.newChannel({
      uri: `https://${host}/`,
      loadUsingSystemPrincipal: true,
    });
    channel.loadFlags |=
      Ci.nsIRequest.LOAD_BYPASS_CACHE |
      Ci.nsIRequest.INHIBIT_CACHING |
      Ci.nsIRequest.LOAD_ANONYMOUS;
    return new Promise((resolve, reject) => {
      channel.asyncOpen({
        onStartRequest(request) {
          request.cancel(Cr.NS_BINDING_ABORTED);
        },
        onDataAvailable() {},
        onStopRequest() {
          const fingerprint = channel.securityInfo?.serverCert?.sha256Fingerprint;
          if (fingerprint) {
            resolve(fingerprint);
          } else {
            reject(new Error("no-certificate"));
          }
        },
      });
    });
  }
}

export const gZenRussianSites = new nsZenRussianSites();
