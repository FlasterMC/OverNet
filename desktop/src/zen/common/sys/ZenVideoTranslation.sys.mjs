const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  ExtensionPermissions: "resource://gre/modules/ExtensionPermissions.sys.mjs",
});

const ADDON_ID = "vot-ext@firefox";
const ADDON_URL =
  "https://github.com/ilyhalight/voice-over-translation/releases/latest/download/vot-extension-firefox.xpi";
const INSTALLED_PREF = "zen.video-translation.installed";

class nsZenVideoTranslation {
  async init() {
    if (Services.prefs.getBoolPref(INSTALLED_PREF, false)) {
      return;
    }
    try {
      if (!(await lazy.AddonManager.getAddonByID(ADDON_ID))) {
        const install = await lazy.AddonManager.getInstallForURL(ADDON_URL, {
          telemetryInfo: { source: "internal" },
        });
        await install.install();
      }
      const addon = await lazy.AddonManager.getAddonByID(ADDON_ID);
      await lazy.ExtensionPermissions.add(
        ADDON_ID,
        { permissions: [], origins: addon.requestedPermissions?.origins ?? [] },
        WebExtensionPolicy.getByID(ADDON_ID)?.extension
      );
      Services.prefs.setBoolPref(INSTALLED_PREF, true);
    } catch (error) {
      console.error("ZenVideoTranslation: failed to install", error);
    }
  }
}

export const gZenVideoTranslation = new nsZenVideoTranslation();
