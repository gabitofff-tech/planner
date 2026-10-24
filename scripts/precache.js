import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = (await readdir("dist/assets")).map((f) => `/assets/${f}`);
const assets = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  ...files,
];
const version = createHash("sha256")
  .update(JSON.stringify(assets))
  .digest("hex")
  .slice(0, 16);
let sw = await readFile("dist/sw.js", "utf8");
sw = sw.replace(/const CACHE\s*=\s*[^;]+;/, `const CACHE = 'tiho-${version}';`);
sw = sw.replace(
  /const PRECACHE\s*=\s*[^;]+;/,
  `const PRECACHE = ${JSON.stringify(assets)};`,
);
await writeFile("dist/sw.js", sw);
console.log(`Offline precache: ${assets.length} resources, ${version}`);
