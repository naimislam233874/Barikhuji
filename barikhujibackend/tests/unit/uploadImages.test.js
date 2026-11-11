"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { detectImageType, validateImageFiles, MAX_IMAGE_BYTES } = require("../../utils/uploadImages");

const makeJpg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const makePng = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const makeWebp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.from("VP8 ")]);

describe("uploadImages validation (unit)", () => {
  test("detectImageType recognizes JPEG, PNG and WebP magic bytes only", () => {
    assert.equal(detectImageType(makeJpg()), "jpg");
    assert.equal(detectImageType(makePng()), "png");
    assert.equal(detectImageType(makeWebp()), "webp");
    assert.equal(detectImageType(Buffer.from("<html><script>alert(1)</script></html>")), null);
    assert.equal(detectImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
    assert.equal(detectImageType(Buffer.from("short")), null);
  });

  test("validateImageFiles accepts up to 10 valid files and rejects 11", () => {
    const ten = Array.from({ length: 10 }, () => ({ mimetype: "image/jpeg", size: 12, buffer: makeJpg() }));
    assert.equal(validateImageFiles(ten).ok, true);
    assert.equal(validateImageFiles(ten).files.length, 10);

    const eleven = [...ten, { mimetype: "image/png", size: 12, buffer: makePng() }];
    const r = validateImageFiles(eleven);
    assert.equal(r.ok, false);
    assert.match(r.message, /10/);
  });

  test("validateImageFiles rejects spoofed MIME types, unsupported types and oversized files", () => {
    const spoofed = validateImageFiles([{ mimetype: "image/jpeg", size: 40, buffer: Buffer.from("<html>evil payload</html>") }]);
    assert.equal(spoofed.ok, false);
    assert.match(spoofed.message, /valid JPG, PNG or WebP/i);

    const svg = validateImageFiles([{ mimetype: "image/svg+xml", size: 20, buffer: makePng() }]);
    assert.equal(svg.ok, false);

    const big = validateImageFiles([{ mimetype: "image/png", size: MAX_IMAGE_BYTES + 1, buffer: makePng() }]);
    assert.equal(big.ok, false);
    assert.match(big.message, /5 MB/);
  });
});
