import "server-only";

/** Latest release of the desktop app (built by .github/workflows/desktop.yml). */
const RELEASES = "https://github.com/massihs/Spotifood/releases/latest/download";

/**
 * Where the installers are downloaded from. DESKTOP_WINDOWS_URL / DESKTOP_MAC_URL override the
 * GitHub release (a mirror inside Iran, for instance); "off" hides the buttons.
 */
export function desktopDownloads() {
  const url = (v: string | undefined, fallback: string) =>
    v === "off" ? null : v && /^https:\/\//.test(v) ? v : fallback;
  return {
    windows: url(process.env.DESKTOP_WINDOWS_URL, `${RELEASES}/Spotifood-Setup.exe`),
    mac: url(process.env.DESKTOP_MAC_URL, `${RELEASES}/Spotifood-mac.dmg`),
  };
}
