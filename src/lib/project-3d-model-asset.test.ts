import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { getProject3dModel } from "@/lib/project-3d-model";

it("packages the supplied R06 portable model without changing source data or geometry", async () => {
  const model = getProject3dModel({ id: "cmteg9g33000for4oc06rko5a" });
  const compressed = await readFile(model!.assetPath);
  const source = gunzipSync(compressed);
  expect(source.byteLength).toBe(53467956);
  expect(createHash("sha256").update(source).digest("hex")).toBe("b13c1510573119e73aa9e14e8b319453df969b3bec1969b2a7bd2975012fd81f");
  expect(compressed.byteLength).toBeLessThan(source.byteLength * 0.6);
  expect(source.indexOf("window.R06_PORTABLE=true")).toBeGreaterThan(0);
});
