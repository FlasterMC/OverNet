import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

const MIN_RESUME_SECONDS = 10;
const END_MARGIN_SECONDS = 30;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

let positionsStore = null;

function removeExpiredPositions(data) {
  const oldestKept = Date.now() - RETENTION_MS;
  for (const [videoId, position] of Object.entries(data)) {
    if (!(position?.savedAt > oldestKept)) {
      delete data[videoId];
    }
  }
  return data;
}

async function loadPositions() {
  positionsStore ??= new JSONFile({
    path: PathUtils.join(PathUtils.profileDir, "zen-video-resume.json"),
    dataPostProcessor: removeExpiredPositions,
  });
  await positionsStore.load();
  return positionsStore;
}

export class ZenVideoResumeParent extends JSWindowActorParent {
  async receiveMessage({ name, data }) {
    if (typeof data?.videoId !== "string" || !VIDEO_ID_PATTERN.test(data.videoId)) {
      return 0;
    }
    const store = await loadPositions();
    if (name === "ZenVideoResume:Get") {
      return store.data[data.videoId]?.time ?? 0;
    }
    const { time, duration } = data;
    if (
      name !== "ZenVideoResume:Save" ||
      this.browsingContext.usePrivateBrowsing ||
      !Number.isFinite(time) ||
      !Number.isFinite(duration)
    ) {
      return 0;
    }
    if (time < MIN_RESUME_SECONDS || duration - time < END_MARGIN_SECONDS) {
      delete store.data[data.videoId];
    } else {
      store.data[data.videoId] = { time, savedAt: Date.now() };
    }
    store.saveSoon();
    return 0;
  }
}
