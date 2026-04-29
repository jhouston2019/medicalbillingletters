import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
/** Vite builds these entry HTML files with hashed /assets/* refs; do not overwrite with dev paths (/src/...). */
const skip = new Set([
  "index.html",
  "success.html",
  "app.html",
  "pricing.html",
  "cancel.html",
  "payment.html",
  "dashboard.html",
  "login.html",
  "signup.html",
  "examples.html",
  "preview.html",
  "result.html",
]);

if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
}

for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".html"))) {
  if (skip.has(f)) continue;
  fs.copyFileSync(path.join(root, f), path.join(dist, f));
}

const styles = path.join(root, "styles.css");
if (fs.existsSync(styles)) {
  fs.copyFileSync(styles, path.join(dist, "styles.css"));
}

console.log("Copied HTML (except Vite entry pages) and styles.css to dist/");
