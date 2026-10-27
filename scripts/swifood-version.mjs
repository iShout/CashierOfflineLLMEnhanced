import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packagePath = join(rootDir, "package.json");
const lockPath = join(rootDir, "package-lock.json");
const builderConfigPath = join(rootDir, "electron-builder.yml");
const tmpDir = join(tmpdir(), "swifood-cashier-offline-windows");
const testBuilderConfigPath = join(tmpDir, "electron-builder.test.yml");

const args = process.argv.slice(2);
const command = args[0];
const dryRun = args.includes("--dry-run");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function parseStableVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (!match) {
    throw new Error(`Only stable x.y.z versions can be patched, got "${version}".`);
  }

  return match.slice(1).map(Number);
}

function formatLocalTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

async function bumpPatchVersion() {
  const pkg = await readJson(packagePath);
  const [major, minor, patch] = parseStableVersion(pkg.version);
  const nextVersion = `${major}.${minor}.${patch + 1}`;

  pkg.version = nextVersion;

  if (existsSync(lockPath)) {
    const lock = await readJson(lockPath);
    lock.version = nextVersion;

    if (lock.packages?.[""]) {
      lock.packages[""].version = nextVersion;
    }

    if (!dryRun) {
      await writeJson(lockPath, lock);
    }
  }

  if (!dryRun) {
    await writeJson(packagePath, pkg);
  }

  console.log(`Swifood formal version: ${nextVersion}`);
}

function replaceArtifactNames(configText, packageName, testVersion) {
  return configText
    .replace(
      /artifactName:\s+\$\{name\}-\$\{version\}-setup\.\$\{ext\}/,
      `artifactName: ${packageName}-${testVersion}-setup.\${ext}`,
    )
    .replace(
      /artifactName:\s+\$\{name\}-\$\{version\}\.\$\{ext\}/g,
      `artifactName: ${packageName}-${testVersion}.\${ext}`,
    );
}

function appendBuildMetadata(configText, testVersion, timestamp) {
  let nextConfig = configText;

  // 测试包使用独立预发布版本，避免污染正式 package.json 版本号。
  if (/^extraMetadata:/m.test(nextConfig)) {
    nextConfig = nextConfig.replace(/^extraMetadata:\n(?: {2}.+\n)*/m, `extraMetadata:\n  version: ${testVersion}\n`);
  } else {
    nextConfig += `\nextraMetadata:\n  version: ${testVersion}\n`;
  }

  // buildVersion 记录构建时间，方便在安装包属性或发布记录里追踪。
  if (/^buildVersion:/m.test(nextConfig)) {
    nextConfig = nextConfig.replace(/^buildVersion:.+$/m, `buildVersion: ${timestamp}`);
  } else {
    nextConfig += `buildVersion: ${timestamp}\n`;
  }

  return nextConfig;
}

function runCommand(label, executable, commandArgs) {
  console.log(`\n> ${label}`);

  if (dryRun) {
    console.log([executable, ...commandArgs].join(" "));
    return;
  }

  const result = spawnSync(executable, commandArgs, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

async function buildWinTestPackage() {
  const pkg = await readJson(packagePath);
  const timestamp = formatLocalTimestamp();
  const testVersion = `${pkg.version}-test.${timestamp}`;
  const baseConfig = await readFile(builderConfigPath, "utf8");
  const testConfig = appendBuildMetadata(
    replaceArtifactNames(baseConfig, pkg.name, testVersion),
    testVersion,
    timestamp,
  );

  await mkdir(tmpDir, { recursive: true });

  if (!dryRun) {
    await writeFile(testBuilderConfigPath, testConfig);
  }

  console.log(`Swifood test version: ${testVersion}`);
  console.log(`Test builder config: ${testBuilderConfigPath}`);

  // 测试环境沿用 .env.test，再用临时 builder 配置输出带时间戳的安装包。
  runCommand("build renderer/main for test", "npx", ["electron-vite", "build", "--mode", "test"]);
  runCommand("package Windows test installer", "npx", ["electron-builder", "--win", "--config", testBuilderConfigPath]);
}

try {
  switch (command) {
    case "patch":
      await bumpPatchVersion();
      break;
    case "build-win-test":
      await buildWinTestPackage();
      break;
    default:
      console.log("Usage:");
      console.log("  node scripts/swifood-version.mjs patch [--dry-run]");
      console.log("  node scripts/swifood-version.mjs build-win-test [--dry-run]");
      process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
