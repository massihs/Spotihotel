import QRCode from "qrcode";

/** Public URL encoded in a table's QR code. Only the opaque token identifies the table. */
export function tableUrl(qrToken: string, appUrl = process.env.APP_URL ?? "http://localhost:3000") {
  return `${appUrl.replace(/\/$/, "")}/t/${qrToken}`;
}

// High error correction (H, ~30%) keeps codes readable when printed small, scratched or with a logo overlay.
const OPTIONS = { errorCorrectionLevel: "H" as const, margin: 1 };

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTIONS, type: "svg", color: { dark: "#1c1916", light: "#ffffff" } });
}

export function qrPng(url: string, width = 1024): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    ...OPTIONS,
    type: "png",
    width,
    color: { dark: "#1c1916", light: "#ffffff" },
  });
}
