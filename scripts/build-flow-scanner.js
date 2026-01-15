#!/usr/bin/env node

const {execSync} = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function createTempDir() {
  "use strict";
  const tempDir = path.join(os.tmpdir(), `flow-scanner-build-${Date.now()}`);
  fs.mkdirSync(tempDir, {recursive: true});
  return tempDir;
}

function cleanupTempDir(tempDir) {
  "use strict";
  try {
    fs.rmSync(tempDir, {recursive: true, force: true});
  } catch (error) {
    console.log(`Warning: Could not clean up temporary directory: ${error.message}`);
  }
}

function copyDirSync(src, dest) {
  "use strict";
  fs.mkdirSync(dest, {recursive: true});
  const entries = fs.readdirSync(src, {withFileTypes: true});
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getLatestTag(cwd) {
  "use strict";
  try {
    const tagsOutput = execSync('git tag -l "core-v*"', {cwd, encoding: "utf8"});
    return tagsOutput
      .trim()
      .split(/\r?\n/)
      .map(t => t.trim())
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a, undefined, {numeric: true, sensitivity: "base"}))[0];
  } catch {
    return null;
  }
}

function setupRemoteRepo(tempDir) {
  "use strict";
  const repoUrl = "https://github.com/Flow-Scanner/lightning-flow-scanner";
  const cloneDir = path.join(tempDir, ".full-clone");
  fs.mkdirSync(cloneDir, {recursive: true});

  execSync(`git clone --depth 1 ${repoUrl} "${cloneDir}"`, {stdio: "inherit"});
  execSync("git fetch --tags --force", {cwd: cloneDir, stdio: "inherit"});

  const targetVersion = process.argv[2];
  let tagToCheckout;

  if (targetVersion) {
    tagToCheckout = targetVersion.startsWith("core-v") ? targetVersion : `core-v${targetVersion}`;
    console.log(`Using specified version: ${tagToCheckout}`);
  } else {
    tagToCheckout = getLatestTag(cloneDir);
    if (tagToCheckout) {
      console.log(`Auto-detected latest version: ${tagToCheckout}`);
    }
  }

  if (!tagToCheckout) {
    console.error("No core-v* tags found. Aborting build.");
    process.exit(1);
  }

  try {
    execSync(`git checkout tags/${tagToCheckout}`, {cwd: cloneDir, stdio: "inherit"});
  } catch (e) {
    console.error(`Failed to checkout tag ${tagToCheckout}: ${e.message}`);
    process.exit(1);
  }

  const coreSource = path.join(cloneDir, "packages", "core");
  if (!fs.existsSync(coreSource)) {
    console.error("packages/core directory not found in repository");
    process.exit(1);
  }

  // Build using pnpm from monorepo root (Turborepo handles workspace deps)
  execSync("pnpm install", {stdio: "inherit", cwd: cloneDir});
  execSync("pnpm dist", {stdio: "inherit", cwd: cloneDir});

  // Copy the built core package to tempDir
  copyDirSync(coreSource, tempDir);
  fs.rmSync(cloneDir, {recursive: true, force: true});
}

function findUMDFile(distDir) {
  "use strict";
  const files = fs.readdirSync(distDir);
  const umdFile = files.find(file => file.endsWith(".umd.js") || file.endsWith(".umd.cjs"));
  if (!umdFile) {
    throw new Error("No UMD file found in dist directory");
  }
  return path.join(distDir, umdFile);
}

function main() {
  "use strict";
  console.log("Lightning Flow Scanner Core Build Script");

  const targetVersion = process.argv[2];
  if (targetVersion) {
    console.log(`Building specific version: ${targetVersion}`);
  } else {
    console.log("Building latest version (use 'node scripts/build-flow-scanner.js <version>' to specify a version)");
  }

  let tempDir;

  try {
    tempDir = createTempDir();
    setupRemoteRepo(tempDir);

    const packageJson = JSON.parse(fs.readFileSync(path.join(tempDir, "package.json"), "utf8"));
    const version = packageJson.version;
    console.log(`Version: ${version}`);

    const distDir = path.join(tempDir, "dist");
    if (!fs.existsSync(distDir)) {
      console.error("Dist directory not found. Build may have failed.");
      process.exit(1);
    }

    const umdFilePath = findUMDFile(distDir);
    const umdContent = fs.readFileSync(umdFilePath, "utf8");

    const outputPath = path.join(process.cwd(), "force-app", "main", "default", "staticresources", "LFS_Core.js");
    fs.writeFileSync(outputPath, umdContent, "utf8");

    const fileSizeInKB = (fs.statSync(outputPath).size / 1024).toFixed(2);
    console.log(`Static resource updated: ${outputPath} (${fileSizeInKB} KB)`);

  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exit(1);
  } finally {
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {main};
