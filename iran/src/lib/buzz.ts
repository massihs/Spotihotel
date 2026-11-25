/**
 * Vibrates the phone for an event that arrives on its own (an order, a dish ready, a move): browsers
 * refuse (and log an error) until the person has touched the page once, so it waits for that.
 */
export function buzz(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  if (activation && !activation.hasBeenActive) return;
  navigator.vibrate(pattern);
}
