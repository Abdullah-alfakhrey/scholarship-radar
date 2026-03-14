const fs = require("fs/promises");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  await copyFile("index.html");
  await copyFile("styles.css");
  await copyFile("script.js");
  await copyFile(".nojekyll");
  await copyDirectory("data");

  console.log(`Built static site in ${DIST_DIR}`);
}

async function copyFile(relativePath) {
  const sourcePath = path.join(ROOT_DIR, relativePath);
  const destinationPath = path.join(DIST_DIR, relativePath);

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function copyDirectory(relativePath) {
  const sourcePath = path.join(ROOT_DIR, relativePath);
  const destinationPath = path.join(DIST_DIR, relativePath);
  await copyDirectoryRecursive(sourcePath, destinationPath);
}

async function copyDirectoryRecursive(sourcePath, destinationPath) {
  await fs.mkdir(destinationPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const destinationEntryPath = path.join(destinationPath, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourceEntryPath, destinationEntryPath);
    } else {
      await fs.copyFile(sourceEntryPath, destinationEntryPath);
    }
  }
}
