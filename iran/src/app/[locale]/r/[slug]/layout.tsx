import type { ReactNode } from "react";

export default function PublicPlaceLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
