// Are we on a touch device? Drives the mobile vs desktop view split.
// Uses touch capability (reliable on phones) rather than a hover/pointer media
// query, which some phones mis-report. Touch laptops will read as mobile too;
// a manual override could be added later if that ever matters.
function detect(): boolean {
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) {
    return true;
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(pointer: coarse)").matches;
  }
  return false;
}

export const IS_MOBILE = detect();
