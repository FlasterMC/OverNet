const YANDEX_ENGINE_ID = "yandex";

const BUNDLED_ENGINE_ICONS = {
  [YANDEX_ENGINE_ID]: "chrome://browser/content/zen-images/search/yandex.png",
};

const bundledIconURLs = new Map();

function yandexEngineRecord() {
  const isRussianLocale = Services.locale.appLocaleAsBCP47.startsWith("ru");
  return {
    recordType: "engine",
    identifier: YANDEX_ENGINE_ID,
    base: {
      aliases: ["yandex", "ya", "яндекс", "я"],
      classification: "general",
      name: isRussianLocale ? "Яндекс" : "Yandex",
      urls: {
        search: {
          base: "https://yandex.ru/search/",
          searchTermParamName: "text",
        },
        suggestions: {
          base: "https://suggest.yandex.ru/suggest-ff.cgi",
          params: [{ name: "uil", value: isRussianLocale ? "ru" : "en" }],
          searchTermParamName: "part",
        },
      },
    },
    variants: [{ environment: { allRegionsAndLocales: true } }],
  };
}

export const ZenSearchEngines = {
  withBundledEngines(configuration) {
    if (!Array.isArray(configuration) || !configuration.length) {
      return configuration;
    }
    const withoutBundled = configuration.filter(
      record => record.identifier !== YANDEX_ENGINE_ID
    );
    return [...withoutBundled, yandexEngineRecord()];
  },

  iconURL(engineId) {
    const chromeURL = BUNDLED_ENGINE_ICONS[engineId];
    if (!chromeURL) {
      return null;
    }
    if (!bundledIconURLs.has(engineId)) {
      bundledIconURLs.set(
        engineId,
        fetch(chromeURL)
          .then(response => response.blob())
          .then(blob => URL.createObjectURL(blob))
      );
    }
    return bundledIconURLs.get(engineId);
  },
};
