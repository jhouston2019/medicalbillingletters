import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const skip = new Set(["success.html", "app.html"]);

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

console.log("Copied HTML (except success/app) and styles.css to dist/");
