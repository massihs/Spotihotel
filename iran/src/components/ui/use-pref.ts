"use client";

import { useSyncExternalStore } from "react";

/** Per-device UI preferences (a station filter, a view mode…) kept in local storage. */
const PREF_EVENT = "sf-pref";

function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice lasts until reload */
  }
  window.dispatchEvent(new Event(PREF_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(PREF_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREF_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePref(key: string, fallback: string) {
  return useSyncExternalStore(
    subscribe,
    () => readPref(key, fallback),
    () => fallback,
  );
}
