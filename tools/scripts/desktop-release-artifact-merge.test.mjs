import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

import {
  mergeMacosReleaseArtifacts,
  resolveUpdaterFileName
} from "../../apps/desktop/scripts/merge-macos-release-artifacts.mjs";

const desktopRequire = createRequire(
  new URL("../../apps/desktop/package.json", import.meta.url)
);
const { findFile } = desktopRequire("electron-updater/out/providers/Provider");

async function createArchitectureArtifacts(root, version, architecture) {
  const artifactDir = path.join(
    root,
    `tutti-desktop-release-assets-macos-${architecture}`
  );
  await mkdir(artifactDir, { recursive: true });
  const stem = `Tutti-${version}-mac-${architecture}`;
  await Promise.all([
    writeFile(path.join(artifactDir, `${stem}.dmg`), `dmg-${architecture}`),
    writeFile(path.join(artifactDir, `${stem}.zip`), `zip-${architecture}`),
    writeFile(
      path.join(artifactDir, `${stem}.zip.blockmap`),
      `blockmap-${architecture}`
    )
  ]);
}

function withProcessArchitecture(architecture, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "arch");
  Object.defineProperty(process, "arch", {
    configurable: true,
    enumerable: true,
    value: architecture
  });
  try {
    return callback();
  } finally {
    Object.defineProperty(process, "arch", descriptor);
  }
}

function selectMacUpdaterZip(files, architecture) {
  return withProcessArchitecture(architecture, () => {
    let resolvedFiles = files.map((info) => ({
      info,
      url: new URL(info.url, "https://updates.example.test/")
    }));
    const isArm64 = (file) =>
      file.url.pathname.includes("arm64") || file.info.url.includes("arm64");
    if (architecture === "arm64" && resolvedFiles.some(isArm64)) {
      resolvedFiles = resolvedFiles.filter(isArm64);
    } else {
      resolvedFiles = resolvedFiles.filter((file) => !isArm64(file));
    }
    return findFile(resolvedFiles, "zip", ["pkg", "dmg"]);
  });
}

test("macOS matrix artifacts merge into one architecture-aware updater manifest", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "tutti-macos-release-merge-")
  );
  const inputDirectory = path.join(tempRoot, "input");
  const outputDirectory = path.join(tempRoot, "output");
  const version = "1.2.3-rc.4";

  try {
    await Promise.all(
      ["x64", "arm64", "universal"].map((architecture) =>
        createArchitectureArtifacts(inputDirectory, version, architecture)
      )
    );

    const result = await mergeMacosReleaseArtifacts({
      inputDirectory,
      outputDirectory,
      releaseChannel: "rc",
      releaseDate: "2026-07-16T00:00:00.000Z",
      releaseVersion: version
    });
    const metadata = YAML.parse(
      await readFile(path.join(outputDirectory, "rc-mac.yml"), "utf8")
    );
    const outputNames = await readdir(outputDirectory);

    assert.equal(result.updaterFileName, "rc-mac.yml");
    assert.equal(outputNames.length, 10);
    assert.deepEqual(
      metadata.files.map((file) => file.url),
      [
        `Tutti-${version}-mac-x64.zip`,
        `Tutti-${version}-mac-arm64.zip`,
        `Tutti-${version}-mac-universal.zip`
      ]
    );
    assert.equal(metadata.path, `Tutti-${version}-mac-x64.zip`);
    assert.equal(metadata.sha512, metadata.files[0].sha512);
    assert.equal(metadata.releaseDate, "2026-07-16T00:00:00.000Z");
    for (const file of metadata.files) {
      assert.equal(typeof file.sha512, "string");
      assert.ok(file.sha512.length > 40);
      assert.equal(typeof file.size, "number");
    }

    assert.match(
      selectMacUpdaterZip(metadata.files, "x64").url.pathname,
      /-mac-x64\.zip$/
    );
    assert.match(
      selectMacUpdaterZip(metadata.files, "arm64").url.pathname,
      /-mac-arm64\.zip$/
    );
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});

test("electron-updater accepts universal ZIP metadata on both macOS architectures", () => {
  const universalFiles = [
    {
      sha512: "universal-sha512",
      size: 123,
      url: "Tutti-1.2.3-mac-universal.zip"
    }
  ];

  assert.match(
    selectMacUpdaterZip(universalFiles, "x64").url.pathname,
    /-mac-universal\.zip$/
  );
  assert.match(
    selectMacUpdaterZip(universalFiles, "arm64").url.pathname,
    /-mac-universal\.zip$/
  );
});

test("macOS updater channel names stay compatible with electron-updater", () => {
  assert.equal(resolveUpdaterFileName("stable"), "latest-mac.yml");
  assert.equal(resolveUpdaterFileName("rc"), "rc-mac.yml");
  assert.equal(resolveUpdaterFileName("beta"), "beta-mac.yml");
  assert.throws(
    () => resolveUpdaterFileName("nightly"),
    /Unsupported desktop release channel/
  );
});
