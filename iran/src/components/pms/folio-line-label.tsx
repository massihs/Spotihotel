"use client";

import { useLineLabel } from "./folio-panel";

export function FolioLineLabel(props: { description: string; department: string; method: string | null }) {
  const label = useLineLabel();
  return <>{label(props)}</>;
}
