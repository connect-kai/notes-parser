const illegalRe = /[\/\?<>\\:\*\|"]/g;
const controlRe = /[\x00-\x1f\x80-\x9f]/g;
const reservedRe = /^\.+$/;
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const windowsTrailingRe = /[\. ]+$/;
const startsWithDotRe = /^\./; // Regular expression to match filenames starting with "."
const badLinkRe = /[\[\]#|^]/g; // Regular expression to match characters that interferes with links: [ ] # | ^

export function sanitizeFileName(name: string) {
  return name
    .replace(illegalRe, "")
    .replace(controlRe, "")
    .replace(reservedRe, "")
    .replace(windowsReservedRe, "")
    .replace(windowsTrailingRe, "")
    .replace(startsWithDotRe, "")
    .replace(badLinkRe, "");
}

export function genUid(length: number): string {
  const array: string[] = [];
  for (let i = 0; i < length; i++) {
    array.push(((Math.random() * 16) | 0).toString(16));
  }
  return array.join("");
}

export function parseHTML(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").documentElement;
}

export function uint8arrayToArrayBuffer(input: Uint8Array): ArrayBuffer {
  return input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength
  );
}

export function stringToUtf8(text: string): ArrayBuffer {
  return uint8arrayToArrayBuffer(new TextEncoder().encode(text));
}

export function truncateText(
  text: string,
  limit: number,
  ellipses: string = "..."
) {
  if (text.length < limit) {
    return text;
  }

  return text.substring(0, limit) + ellipses;
}
