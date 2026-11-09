"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog (the page's print styles hide the navigation). */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
