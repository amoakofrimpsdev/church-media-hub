import { describe, expect, it } from "vitest";
import { crc32, uniqueNames, zipParts } from "@/lib/zip";

const bytes = (text: string) => new TextEncoder().encode(text);

function join(parts: Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

/** Reads a zip back through its central directory, as an unzip tool does. */
function readZip(zip: Uint8Array): { name: string; data: string; crc: number }[] {
  const view = new DataView(zip.buffer);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLength));
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    const data = zip.slice(dataStart, dataStart + size);
    files.push({ name, data: new TextDecoder().decode(data), crc: view.getUint32(at + 16, true) });
    at += 46 + nameLength;
  }
  return files;
}

describe("zip files", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes files an unzip tool can read back", () => {
    const zip = join(
      zipParts([
        { name: "baptism.jpg", data: bytes("first photo") },
        { name: "Ọrọ́ 2.jpg", data: bytes("second") },
      ]),
    );
    expect(readZip(zip)).toEqual([
      { name: "baptism.jpg", data: "first photo", crc: crc32(bytes("first photo")) },
      { name: "Ọrọ́ 2.jpg", data: "second", crc: crc32(bytes("second")) },
    ]);
  });

  it("writes an empty zip", () => {
    expect(readZip(join(zipParts([])))).toEqual([]);
  });
});

describe("names inside a zip", () => {
  it("keeps names unique without losing the extension", () => {
    expect(uniqueNames(["IMG_1.jpg", "IMG_1.jpg", "img_1.JPG", "IMG_1 (2).jpg"])).toEqual([
      "IMG_1.jpg",
      "IMG_1 (2).jpg",
      "img_1 (3).JPG",
      "IMG_1 (2) (2).jpg",
    ]);
  });

  it("does not let a name make folders", () => {
    expect(uniqueNames(["../a/b.jpg", ""])).toEqual([".._a_b.jpg", "file"]);
  });
});
