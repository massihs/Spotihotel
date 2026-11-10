import fs from "node:fs";
import path from "node:path";

/**
 * Small JSON files in the app's data folder, written atomically (temp file + rename).
 *
 * Sealed files hold the guests' personal data (the front desk copy): they are encrypted with the
 * operating system's key store (`seal`/`unseal`: Electron's safeStorage, i.e. DPAPI on Windows,
 * the Keychain on macOS). Without encryption they are kept in memory only, never in clear on disk.
 */
export function createStore(dir, { seal = null, unseal = null } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (name) => path.join(dir, `${name}.json`);
  const sealedFile = (name) => path.join(dir, `${name}.sealed`);
  const atomic = (target, data) => {
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  };
  const read = (name, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file(name), "utf8"));
    } catch {
      return fallback;
    }
  };
  const write = (name, value) => atomic(file(name), JSON.stringify(value));
  const remove = (name) => {
    for (const f of [file(name), sealedFile(name)]) fs.rmSync(f, { force: true });
  };
  /** True when written encrypted; false when it could not be (kept in memory by the caller). */
  const writeSealed = (name, value) => {
    let data = null;
    try {
      data = seal?.(JSON.stringify(value)) ?? null;
    } catch {
      data = null;
    }
    if (!data) {
      fs.rmSync(sealedFile(name), { force: true });
      return false;
    }
    atomic(sealedFile(name), data);
    return true;
  };
  const readSealed = (name, fallback) => {
    try {
      if (!unseal) return fallback;
      return JSON.parse(unseal(fs.readFileSync(sealedFile(name))));
    } catch {
      return fallback;
    }
  };
  return { dir, read, write, remove, readSealed, writeSealed };
}
