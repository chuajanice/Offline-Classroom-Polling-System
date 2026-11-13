// Test helper: recovers the text drawn in a PDF produced by pdf-lib.
// pdf-lib compresses content streams and writes text as hex strings before "Tj".
import { inflateSync } from "node:zlib";

export function extractPdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const runs: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = buf.indexOf("stream", cursor, "latin1");
    if (start < 0) break;
    // Skip "endstream" (its "stream" is preceded by "end").
    if (start >= 3 && buf.subarray(start - 3, start).toString("latin1") === "end") {
      cursor = start + 6;
      continue;
    }
    let bodyStart = start + 6;
    if (buf[bodyStart] === 0x0d) bodyStart++;
    if (buf[bodyStart] === 0x0a) bodyStart++;
    const end = buf.indexOf("endstream", bodyStart, "latin1");
    if (end < 0) break;

    const raw = buf.subarray(bodyStart, end);
    let content: Buffer;
    try {
      content = inflateSync(raw);
    } catch {
      content = raw;
    }
    for (const match of content.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      runs.push(Buffer.from(match[1], "hex").toString("latin1"));
    }
    cursor = end + "endstream".length;
  }
  return runs.join("\n");
}

export function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}
