import test from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { encrypt, route, musicRequest } from "./web-api.mjs";
test("API routes are allowlisted, searches and login inputs are validated", () => {
  assert.throws(() => route("https://example.com"), /不支持/);
  assert.throws(() => route("search", { keywords: " " }), /搜索/);
  assert.throws(() => route("captchaSend", { phone: "123" }), /手机号/);
  assert.throws(() => route("phoneLogin", { phone: "123" }), /手机号/);
  assert.equal(route("recommend", { limit: 10000 })[1].limit, 100);
  assert.equal(route("songUrl", { id: 42, br: 128000 })[1].br, 128000);
  assert.equal(route("search", { keywords: "许嵩", offset: 50 })[1].offset, 50);
  assert.equal(
    route("songDetail", {
      ids: Array.from({ length: 200 }, (_, i) => i + 1).join(","),
    })[1].c.split("},{").length,
    100,
  );
});
test("WEAPI wire format uses padded RSA and block-aligned AES ciphertext", () => {
  const result = encrypt({ limit: 7, csrf_token: "" });
  assert.match(result.encSecKey, /^[a-f0-9]{256}$/);
  assert.equal(Buffer.from(result.params, "base64").length % 16, 0);
});
test("canceling a login makes an old QR poll fail before any network request", async () => {
  assert.deepEqual(await musicRequest("cancelLogin", {}), { code: 200 });
  await assert.rejects(
    musicRequest("qrCheck", { key: "synthetic-canceled-key" }),
    /取消/,
  );
});
