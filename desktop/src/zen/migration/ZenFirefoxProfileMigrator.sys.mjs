import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { MigrationUtils } from "moz-src:///browser/components/migration/MigrationUtils.sys.mjs";
import { MigratorBase } from "moz-src:///browser/components/migration/MigratorBase.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  ctypes: "resource://gre/modules/ctypes.sys.mjs",
});

const FIREFOX_DATA_DIRS = {
  macosx: [["ULibDir", "Application Support", "Firefox"]],
  win: [["AppData", "Mozilla", "Firefox"]],
  linux: [
    ["Home", ".mozilla", "firefox"],
    ["Home", ".config", "mozilla", "firefox"],
    ["Home", "snap", "firefox", "common", ".mozilla", "firefox"],
    ["Home", ".var", "app", "org.mozilla.firefox", ".mozilla", "firefox"],
  ],
};

const BOOKMARK_ROOTS = [
  ["toolbar_____", "toolbarGuid"],
  ["menu________", "menuGuid"],
  ["unfiled_____", "unfiledGuid"],
  ["mobile______", "unfiledGuid"],
];

const BOOKMARK_TYPE_URL = 1;
const BOOKMARK_TYPE_FOLDER = 2;
const BOOKMARK_TYPE_SEPARATOR = 3;

const HISTORY_LIMIT = 10000;
const TYPED_TRANSITION = 2;

const DER_SEQUENCE = 0x30;
const CKM_DES3_CBC = 0x133;
const CKM_AES_CBC = 0x1082;
const SDR_MECHANISMS = new Map([
  ["2a864886f70d0307", CKM_DES3_CBC],
  ["60864801650304012a", CKM_AES_CBC],
]);

function firefoxDataDirs() {
  const dirs = [];
  for (const [root, ...parts] of FIREFOX_DATA_DIRS[AppConstants.platform] ??
    []) {
    try {
      dirs.push(
        PathUtils.join(Services.dirsvc.get(root, Ci.nsIFile).path, ...parts)
      );
    } catch {}
  }
  return dirs;
}

async function readProfilesIni(dataDir) {
  const iniPath = PathUtils.join(dataDir, "profiles.ini");
  if (!(await IOUtils.exists(iniPath))) {
    return [];
  }
  const iniFile = await IOUtils.getFile(iniPath);
  const parser = Cc["@mozilla.org/xpcom/ini-parser-factory;1"]
    .getService(Ci.nsIINIParserFactory)
    .createINIParser(iniFile);
  const profiles = [];
  const sections = parser.getSections();
  while (sections.hasMore()) {
    const section = sections.getNext();
    if (!section.startsWith("Profile")) {
      continue;
    }
    let name;
    let path;
    let isRelative;
    try {
      name = parser.getString(section, "Name");
      path = parser.getString(section, "Path");
      isRelative = parser.getString(section, "IsRelative") == "1";
    } catch {
      continue;
    }
    const rootDir = isRelative
      ? PathUtils.join(dataDir, ...path.split("/"))
      : path;
    if (await IOUtils.exists(PathUtils.join(rootDir, "places.sqlite"))) {
      profiles.push({ id: rootDir, name });
    }
  }
  return profiles;
}

function decodeDer(bytes, offset) {
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < lengthBytes; i++) {
      length = length * 256 + bytes[start + i];
    }
    start += lengthBytes;
  }
  return { tag, value: bytes.subarray(start, start + length), end: start + length };
}

function parseSdrItem(base64) {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const outer = decodeDer(bytes, 0);
  if (outer.tag != DER_SEQUENCE) {
    throw new Error("Unexpected SDR item");
  }
  const keyId = decodeDer(outer.value, 0);
  const algorithm = decodeDer(outer.value, keyId.end);
  const cipherText = decodeDer(outer.value, algorithm.end);
  const oid = decodeDer(algorithm.value, 0);
  const iv = decodeDer(algorithm.value, oid.end);
  const oidHex = Array.from(oid.value, byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const mechanism = SDR_MECHANISMS.get(oidHex);
  if (!mechanism) {
    throw new Error("Unsupported SDR algorithm " + oidHex);
  }
  return { mechanism, iv: iv.value, cipherText: cipherText.value };
}

function removePkcs7Padding(bytes) {
  const padding = bytes[bytes.length - 1];
  if (!padding || padding > 16 || padding > bytes.length) {
    return null;
  }
  for (let i = bytes.length - padding; i < bytes.length; i++) {
    if (bytes[i] != padding) {
      return null;
    }
  }
  return bytes.subarray(0, bytes.length - padding);
}

class FirefoxKeyDatabase {
  #nss;
  #slot = null;
  #copyDir;
  #functions = {};

  static async open(profileDir) {
    const database = new FirefoxKeyDatabase();
    await database.#open(profileDir);
    return database;
  }

  async #open(profileDir) {
    const { ctypes } = lazy;
    this.#copyDir = await IOUtils.createUniqueDirectory(
      PathUtils.tempDir,
      "overwisp-firefox-keys"
    );
    for (const fileName of ["key4.db", "cert9.db"]) {
      const source = PathUtils.join(profileDir, fileName);
      if (await IOUtils.exists(source)) {
        await IOUtils.copy(source, PathUtils.join(this.#copyDir, fileName));
      }
    }
    this.#nss = ctypes.open(
      PathUtils.join(
        Services.dirsvc.get("GreBinD", Ci.nsIFile).path,
        ctypes.libraryName("nss3")
      )
    );
    this.SECItem = new ctypes.StructType("SECItem", [
      { type: ctypes.int },
      { data: ctypes.unsigned_char.ptr },
      { len: ctypes.unsigned_int },
    ]);
    const declare = (name, returnType, ...argTypes) => {
      this.#functions[name] = this.#nss.declare(
        name,
        ctypes.default_abi,
        returnType,
        ...argTypes
      );
    };
    declare("SECMOD_OpenUserDB", ctypes.voidptr_t, ctypes.char.ptr);
    declare("SECMOD_CloseUserDB", ctypes.int, ctypes.voidptr_t);
    declare("PK11_FreeSlot", ctypes.void_t, ctypes.voidptr_t);
    declare("PK11_NeedLogin", ctypes.int, ctypes.voidptr_t);
    declare(
      "PK11_ListFixedKeysInSlot",
      ctypes.voidptr_t,
      ctypes.voidptr_t,
      ctypes.char.ptr,
      ctypes.voidptr_t
    );
    declare("PK11_GetNextSymKey", ctypes.voidptr_t, ctypes.voidptr_t);
    declare("PK11_FreeSymKey", ctypes.void_t, ctypes.voidptr_t);
    declare(
      "PK11_ParamFromIV",
      this.SECItem.ptr,
      ctypes.unsigned_long,
      this.SECItem.ptr
    );
    declare("SECITEM_FreeItem", ctypes.void_t, this.SECItem.ptr, ctypes.int);
    declare(
      "PK11_Decrypt",
      ctypes.int,
      ctypes.voidptr_t,
      ctypes.unsigned_long,
      this.SECItem.ptr,
      ctypes.unsigned_char.ptr,
      ctypes.unsigned_int.ptr,
      ctypes.unsigned_int,
      ctypes.unsigned_char.ptr,
      ctypes.unsigned_int
    );
    const slot = this.#functions.SECMOD_OpenUserDB(
      `configdir='sql:${this.#copyDir}' tokenDescription='overwisp-firefox-import' flags=readOnly`
    );
    if (slot.isNull()) {
      throw new Error("Could not open the Firefox key database");
    }
    this.#slot = slot;
  }

  get needsPrimaryPassword() {
    return !!this.#functions.PK11_NeedLogin(this.#slot);
  }

  decrypt(base64) {
    const { ctypes } = lazy;
    const { mechanism, iv, cipherText } = parseSdrItem(base64);
    const ivBuffer = ctypes.unsigned_char.array()(Array.from(iv));
    const ivItem = new this.SECItem(0, ivBuffer.addressOfElement(0), iv.length);
    const param = this.#functions.PK11_ParamFromIV(mechanism, ivItem.address());
    if (param.isNull()) {
      throw new Error("Could not create decryption parameters");
    }
    const input = ctypes.unsigned_char.array()(Array.from(cipherText));
    const output = ctypes.unsigned_char.array(cipherText.length)();
    const outputLength = ctypes.unsigned_int(0);
    let result = null;
    let key = this.#functions.PK11_ListFixedKeysInSlot(
      this.#slot,
      null,
      null
    );
    try {
      while (!key.isNull() && !result) {
        const status = this.#functions.PK11_Decrypt(
          key,
          mechanism,
          param,
          output.addressOfElement(0),
          outputLength.address(),
          cipherText.length,
          input.addressOfElement(0),
          cipherText.length
        );
        if (status == 0) {
          const decrypted = new Uint8Array(outputLength.value);
          for (let i = 0; i < decrypted.length; i++) {
            decrypted[i] = output[i];
          }
          const plain = removePkcs7Padding(decrypted);
          if (plain) {
            result = new TextDecoder().decode(plain);
          }
        }
        const next = this.#functions.PK11_GetNextSymKey(key);
        this.#functions.PK11_FreeSymKey(key);
        key = next;
      }
    } finally {
      while (!key.isNull()) {
        const next = this.#functions.PK11_GetNextSymKey(key);
        this.#functions.PK11_FreeSymKey(key);
        key = next;
      }
      this.#functions.SECITEM_FreeItem(param, 1);
    }
    if (result === null) {
      throw new Error("Could not decrypt a Firefox login");
    }
    return result;
  }

  async close() {
    if (this.#slot) {
      this.#functions.SECMOD_CloseUserDB(this.#slot);
      this.#functions.PK11_FreeSlot(this.#slot);
      this.#slot = null;
    }
    this.#nss?.close();
    await IOUtils.remove(this.#copyDir, { recursive: true }).catch(() => {});
  }
}

function convertBookmarkChildren(children) {
  const items = [];
  for (const node of children) {
    if (node.type == BOOKMARK_TYPE_URL) {
      if (!node.url || node.url.startsWith("place:")) {
        continue;
      }
      items.push({ url: node.url, title: node.title ?? "" });
    } else if (node.type == BOOKMARK_TYPE_FOLDER) {
      items.push({
        type: lazy.PlacesUtils.bookmarks.TYPE_FOLDER,
        title: node.title ?? "",
        children: convertBookmarkChildren(node.children),
      });
    } else if (node.type == BOOKMARK_TYPE_SEPARATOR) {
      items.push({ type: lazy.PlacesUtils.bookmarks.TYPE_SEPARATOR });
    }
  }
  return items;
}

function bookmarksResource(placesPath) {
  return {
    type: MigrationUtils.resourceTypes.BOOKMARKS,
    migrate(callback) {
      (async () => {
        const rows = await MigrationUtils.getRowsFromDBWithoutLocks(
          placesPath,
          "Firefox bookmarks",
          `SELECT b.id, b.parent, b.type, b.title, b.guid, p.url
           FROM moz_bookmarks b LEFT JOIN moz_places p ON b.fk = p.id
           ORDER BY b.parent, b.position`
        );
        const nodes = new Map();
        for (const row of rows) {
          nodes.set(row.getResultByName("id"), {
            parent: row.getResultByName("parent"),
            type: row.getResultByName("type"),
            title: row.getResultByName("title"),
            guid: row.getResultByName("guid"),
            url: row.getResultByName("url"),
            children: [],
          });
        }
        for (const node of nodes.values()) {
          nodes.get(node.parent)?.children.push(node);
        }
        const nodesByGuid = new Map(
          [...nodes.values()].map(node => [node.guid, node])
        );
        for (const [sourceGuid, targetGuidName] of BOOKMARK_ROOTS) {
          const root = nodesByGuid.get(sourceGuid);
          const bookmarks = root ? convertBookmarkChildren(root.children) : [];
          if (bookmarks.length) {
            await MigrationUtils.insertManyBookmarksWrapper(
              bookmarks,
              lazy.PlacesUtils.bookmarks[targetGuidName]
            );
          }
        }
      })().then(
        () => callback(true),
        error => {
          console.error(error);
          callback(false);
        }
      );
    },
  };
}

function historyResource(placesPath) {
  return {
    type: MigrationUtils.resourceTypes.HISTORY,
    migrate(callback) {
      (async () => {
        const oldestVisit =
          (Date.now() - MigrationUtils.HISTORY_MAX_AGE_IN_MILLISECONDS) * 1000;
        const rows = await MigrationUtils.getRowsFromDBWithoutLocks(
          placesPath,
          "Firefox history",
          `SELECT p.url, p.title, MAX(v.visit_date) AS last_visit, MAX(v.visit_type = ${TYPED_TRANSITION}) AS typed
           FROM moz_historyvisits v JOIN moz_places p ON v.place_id = p.id
           WHERE p.hidden = 0 AND v.visit_date > ${oldestVisit}
           GROUP BY p.id ORDER BY last_visit DESC LIMIT ${HISTORY_LIMIT}`
        );
        const pageInfos = [];
        for (const row of rows) {
          try {
            pageInfos.push({
              url: new URL(row.getResultByName("url")),
              title: row.getResultByName("title"),
              visits: [
                {
                  date: new Date(row.getResultByName("last_visit") / 1000),
                  transition: row.getResultByName("typed")
                    ? lazy.PlacesUtils.history.TRANSITIONS.TYPED
                    : lazy.PlacesUtils.history.TRANSITIONS.LINK,
                },
              ],
            });
          } catch (error) {
            console.error(error);
          }
        }
        if (pageInfos.length) {
          await MigrationUtils.insertVisitsWrapper(pageInfos);
        }
      })().then(
        () => callback(true),
        error => {
          console.error(error);
          callback(false);
        }
      );
    },
  };
}

function passwordsResource(profileDir, savedLogins) {
  return {
    type: MigrationUtils.resourceTypes.PASSWORDS,
    migrate(callback) {
      (async () => {
        const keyDatabase = await FirefoxKeyDatabase.open(profileDir);
        try {
          if (keyDatabase.needsPrimaryPassword) {
            throw new Error("The Firefox profile has a primary password");
          }
          const logins = [];
          for (const login of savedLogins) {
            try {
              logins.push({
                origin: login.hostname,
                formActionOrigin: login.formSubmitURL,
                httpRealm: login.httpRealm,
                username: keyDatabase.decrypt(login.encryptedUsername),
                password: keyDatabase.decrypt(login.encryptedPassword),
                usernameElement: login.usernameField ?? "",
                passwordElement: login.passwordField ?? "",
                timeCreated: login.timeCreated,
                timeLastUsed: login.timeLastUsed,
                timePasswordChanged: login.timePasswordChanged,
                timesUsed: login.timesUsed,
              });
            } catch (error) {
              console.error(error);
            }
          }
          if (logins.length) {
            await MigrationUtils.insertLoginsWrapper(logins);
          }
        } finally {
          await keyDatabase.close();
        }
      })().then(
        () => callback(true),
        error => {
          console.error(error);
          callback(false);
        }
      );
    },
  };
}

export class MozillaFirefoxProfileMigrator extends MigratorBase {
  static get key() {
    return "mozilla-firefox";
  }

  static get displayNameL10nID() {
    return "migration-wizard-migrator-display-name-mozilla-firefox";
  }

  static get brandImage() {
    return "chrome://browser/content/zen-images/migration/firefox.png";
  }

  async getSourceProfiles() {
    const profiles = [];
    for (const dataDir of firefoxDataDirs()) {
      try {
        profiles.push(...(await readProfilesIni(dataDir)));
      } catch (error) {
        console.error(error);
      }
    }
    return profiles;
  }

  async getLastUsedDate() {
    const dates = await Promise.all(
      (await this.getSourceProfiles()).map(profile =>
        IOUtils.stat(PathUtils.join(profile.id, "places.sqlite")).then(
          info => info.lastModified,
          () => 0
        )
      )
    );
    return new Date(Math.max(0, ...dates));
  }

  async getResources(profile) {
    const profileDir = profile?.id;
    if (!profileDir) {
      return [];
    }
    const placesPath = PathUtils.join(profileDir, "places.sqlite");
    const resources = [bookmarksResource(placesPath), historyResource(placesPath)];
    const loginsPath = PathUtils.join(profileDir, "logins.json");
    if (
      (await IOUtils.exists(loginsPath)) &&
      (await IOUtils.exists(PathUtils.join(profileDir, "key4.db")))
    ) {
      const { logins } = await IOUtils.readJSON(loginsPath);
      if (logins?.length) {
        resources.push(passwordsResource(profileDir, logins));
      }
    }
    return resources;
  }
}
