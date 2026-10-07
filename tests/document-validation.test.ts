import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  objectKey,
  readUpload,
  sanitizeFilename,
  uploadMetadata,
  validateFile,
} from "@/modules/documents/validation";
const pdf = readFileSync("tests/fixtures/document.pdf");
it("sanitizes paths, Unicode and unsafe filename characters", () => {
  expect(sanitizeFilename("../../my file.pdf", "pdf")).toBe("my-file.pdf");
  expect(sanitizeFilename("C:\u005cprivate\u005ccontract.pdf", "pdf")).toBe(
    "contract.pdf",
  );
  expect(sanitizeFilename("合同.pdf", "pdf")).toBe("document.pdf");
  expect(sanitizeFilename('evil"<>.pdf', "pdf")).toBe("evil.pdf");
});
it("uses random collision-resistant keys without raw filenames", () => {
  const a = objectKey("user", "job", "document", "pdf");
  expect(a).toMatch(
    /^users\/user\/employments\/job\/documents\/document\/[a-f0-9-]+\.pdf$/,
  );
  expect(objectKey("user", "job", "document", "pdf")).not.toBe(a);
  expect(() => objectKey("../other", "job", "doc", "pdf")).toThrow();
});
it("validates signatures, MIME, extension, nonempty size and checksum", () => {
  expect(
    validateFile(pdf, "record.pdf", "application/pdf", pdf.length),
  ).toMatchObject({
    mimeType: "application/pdf",
    fileSize: pdf.length,
    checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(() => validateFile(pdf, "record.pdf", "image/png", 10000)).toThrow(
    "does not match",
  );
  expect(() =>
    validateFile(pdf, "record.exe", "application/pdf", 10000),
  ).toThrow("extension");
  expect(() =>
    validateFile(
      Buffer.from("MZ executable"),
      "record.pdf",
      "application/pdf",
      10000,
    ),
  ).toThrow("valid PDF");
  expect(() =>
    validateFile(pdf, "record.pdf", "application/pdf", pdf.length - 1),
  ).toThrow("limit");
  expect(() =>
    validateFile(Buffer.alloc(0), "record.pdf", "application/pdf", 10000),
  ).toThrow("non-empty");
  expect(() =>
    validateFile(pdf, "bad\nname.pdf", "application/pdf", 10000),
  ).toThrow("control");
  expect(() =>
    validateFile(pdf.subarray(0, -10), "record.pdf", "application/pdf", 10000),
  ).toThrow();
});
it("accepts PNG and JPEG signatures and does not require browser MIME", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  );
  expect(validateFile(png, "image.png", "", 10000).mimeType).toBe("image/png");
  expect(
    validateFile(
      Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]),
      "image.jpeg",
      "image/jpeg",
      10000,
    ).mimeType,
  ).toBe("image/jpeg");
});
it("defaults unknown categorization to other but rejects invalid category input", () => {
  expect(uploadMetadata.parse({ employmentId: "job" }).documentType).toBe(
    "other",
  );
  expect(
    uploadMetadata.safeParse({ employmentId: "job", documentType: "invented" })
      .success,
  ).toBe(false);
});
it("bounds actual bytes even when content-length is missing or false", async () => {
  await expect(
    readUpload(
      new Request("http://local", { method: "POST", body: pdf }),
      pdf.length - 1,
    ),
  ).rejects.toThrow("limit");
  await expect(
    readUpload(
      new Request("http://local", {
        method: "POST",
        headers: { "content-length": "1" },
        body: pdf,
      }),
      pdf.length - 1,
    ),
  ).rejects.toThrow("limit");
});
