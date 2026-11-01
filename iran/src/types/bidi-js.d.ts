/** Minimal typings for bidi-js (Unicode Bidirectional Algorithm), used by the Persian PDF writer. */
declare module "bidi-js" {
  type Bidi = {
    getEmbeddingLevels(
      text: string,
      direction?: "ltr" | "rtl" | "auto",
    ): {
      levels: Uint8Array;
      paragraphs: { start: number; end: number; level: number }[];
    };
    getMirroredCharacter(char: string): string | null;
  };
  export default function bidiFactory(): Bidi;
}
