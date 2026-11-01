import fs from "node:fs";
import path from "node:path";

/** Small JSON files in the app's data folder, written atomically (temp file + rename). */
export function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (name) => path.join(dir, `${name}.json`);
  const read = (name, fallback) => {
    try {
      return JSON.parse(fs.readFileSync(file(name), "utf8"));
    } catch {
      return fallback;
    }
  };
  const write = (name, value) => {
    const tmp = `${file(name)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file(name));
  };
  return { dir, read, write };
}
