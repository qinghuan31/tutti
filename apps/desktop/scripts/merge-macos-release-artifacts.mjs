#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const macArchitectures = ["x64", "arm64", "universal"];
const copiedArtifactSuffixes = [".blockmap", ".dmg", ".zip"];

function requireValue(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function resolveUpdaterFileName(channel) {
  switch (channel) {
    case "stable":
      return "latest-mac.yml";
    case "rc":
      return "rc-mac.yml";
    case "beta":
      return "beta-mac.yml";
    default:
      throw new Error(`Unsupported desktop release channel: ${channel}`);
  }
}

function resolveMacArchitecture(fileName) {
  const match = /-mac-(x64|arm64|universal)\.zip$/i.exec(fileName);
  return match?.[1]?.toLowerCase() ?? null;
}

function shouldCopyArtifact(fileName) {
  return copiedArtifactSuffixes.some((suffix) => fileName.endsWith(suffix));
}

function validateArchitectureArtifacts(artifactNames, releaseVersion) {
  for (const architecture of macArchitectures) {
    for (const suffix of [".dmg", ".zip", ".zip.blockmap"]) {
      const expectedSuffix = `-${releaseVersion}-mac-${architecture}${suffix}`;
      const matches = artifactNames.filter((fileName) =>
        fileName.endsWith(expectedSuffix)
      );
      if (matches.length !== 1) {
        throw new Error(
          `Expected one macOS ${architecture}${suffix} artifact, found ${matches.length}`
        );
      }
    }
  }
}

async function listFilesRecursively(root) {
  const files = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function sha512(filePath) {
  const hash = createHash("sha512");
  const bytes = createReadStream(filePath);
  for await (const chunk of bytes) {
    hash.update(chunk);
  }
  return hash.digest("base64");
}

function serializeUpdaterMetadata(metadata) {
  const lines = [`version: ${JSON.stringify(metadata.version)}`, "files:"];
  for (const file of metadata.files) {
    lines.push(
      `  - url: ${JSON.stringify(file.url)}`,
      `    sha512: ${JSON.stringify(file.sha512)}`,
      `    size: ${file.size}`
    );
  }
  lines.push(
    `path: ${JSON.stringify(metadata.path)}`,
    `sha512: ${JSON.stringify(metadata.sha512)}`,
    `releaseDate: ${JSON.stringify(metadata.releaseDate)}`,
    ""
  );
  return lines.join("\n");
}

async function buildMacUpdaterMetadata({
  releaseDate = new Date().toISOString(),
  releaseVersion,
  zipPaths
}) {
  const version = requireValue(releaseVersion, "releaseVersion");
  const zipByArchitecture = new Map();

  for (const zipPath of zipPaths) {
    const fileName = path.basename(zipPath);
    const architecture = resolveMacArchitecture(fileName);
    if (!architecture) {
      throw new Error(`Cannot resolve macOS architecture from ${fileName}`);
    }
    if (!fileName.includes(`-${version}-mac-${architecture}.zip`)) {
      throw new Error(
        `${fileName} does not match desktop release version ${version}`
      );
    }
    if (zipByArchitecture.has(architecture)) {
      throw new Error(`Duplicate macOS ${architecture} updater ZIP`);
    }
    zipByArchitecture.set(architecture, zipPath);
  }

  for (const architecture of macArchitectures) {
    if (!zipByArchitecture.has(architecture)) {
      throw new Error(`Missing macOS ${architecture} updater ZIP`);
    }
  }

  const files = [];
  for (const architecture of macArchitectures) {
    const zipPath = zipByArchitecture.get(architecture);
    const fileStat = await stat(zipPath);
    files.push({
      url: path.basename(zipPath),
      sha512: await sha512(zipPath),
      size: fileStat.size
    });
  }

  const defaultFile = files[0];
  return {
    version,
    files,
    path: defaultFile.url,
    sha512: defaultFile.sha512,
    releaseDate: new Date(releaseDate).toISOString()
  };
}

async function mergeMacosReleaseArtifacts({
  inputDirectory,
  outputDirectory,
  releaseChannel,
  releaseDate,
  releaseVersion
}) {
  const inputRoot = path.resolve(
    requireValue(inputDirectory, "inputDirectory")
  );
  const outputRoot = path.resolve(
    requireValue(outputDirectory, "outputDirectory")
  );
  if (inputRoot === outputRoot || outputRoot === path.parse(outputRoot).root) {
    throw new Error("outputDirectory must be a dedicated non-root directory");
  }

  const sourceFiles = (await listFilesRecursively(inputRoot)).filter(
    (filePath) => shouldCopyArtifact(path.basename(filePath))
  );
  if (sourceFiles.length === 0) {
    throw new Error(`No macOS release artifacts found under ${inputRoot}`);
  }

  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });

  const copiedNames = new Set();
  const zipPaths = [];
  for (const sourcePath of sourceFiles.sort()) {
    const fileName = path.basename(sourcePath);
    if (copiedNames.has(fileName)) {
      throw new Error(`Duplicate macOS release artifact: ${fileName}`);
    }
    copiedNames.add(fileName);
    const destinationPath = path.join(outputRoot, fileName);
    await copyFile(sourcePath, destinationPath);
    if (fileName.endsWith(".zip")) {
      zipPaths.push(destinationPath);
    }
  }

  validateArchitectureArtifacts(
    [...copiedNames],
    requireValue(releaseVersion, "releaseVersion")
  );

  const metadata = await buildMacUpdaterMetadata({
    releaseDate,
    releaseVersion,
    zipPaths
  });
  const updaterFileName = resolveUpdaterFileName(
    requireValue(releaseChannel, "releaseChannel")
  );
  await writeFile(
    path.join(outputRoot, updaterFileName),
    serializeUpdaterMetadata(metadata),
    "utf8"
  );

  return {
    artifactNames: [...copiedNames].sort(),
    metadata,
    updaterFileName
  };
}

async function main() {
  const [inputDirectory, outputDirectory] = process.argv.slice(2);
  const result = await mergeMacosReleaseArtifacts({
    inputDirectory,
    outputDirectory,
    releaseChannel: process.env.RELEASE_CHANNEL,
    releaseDate: process.env.RELEASE_DATE,
    releaseVersion: process.env.RELEASE_VERSION
  });
  console.log(
    `[macos-release-merge] merged ${result.artifactNames.length} artifacts and wrote ${result.updaterFileName}`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export {
  buildMacUpdaterMetadata,
  macArchitectures,
  mergeMacosReleaseArtifacts,
  resolveUpdaterFileName,
  serializeUpdaterMetadata
};
