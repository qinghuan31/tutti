import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join, relative } from "node:path";

export async function runValidationLanes({
  lanes,
  maxParallel,
  summaryLabel,
  tailLines,
  tmpDirectoryName,
  workspaceRoot
}) {
  if (lanes.length === 0) {
    console.log(`${summaryLabel} found no lanes to validate`);
    return { exitCode: 0, results: [] };
  }

  const tmpRoot = join(workspaceRoot, ".tmp", tmpDirectoryName);
  const runId = new Date().toISOString().replace(/[:.]/gu, "-");
  const runDirectory = join(tmpRoot, runId);
  mkdirSync(runDirectory, { recursive: true });

  const startedAt = Date.now();
  const results = await runLanes({
    lanes,
    maxParallel,
    runDirectory,
    workspaceRoot
  });
  const durationMs = Date.now() - startedAt;
  const failures = results.filter((result) => result.exitCode !== 0);
  const summary = {
    durationMs,
    laneCount: lanes.length,
    runDirectory,
    startedAt: new Date(startedAt).toISOString(),
    tailLines,
    results
  };

  writeFileSync(
    join(runDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  mkdirSync(tmpRoot, { recursive: true });
  writeFileSync(
    join(tmpRoot, "latest.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );

  if (failures.length === 0) {
    console.log(
      `${summaryLabel} passed ${lanes.length} lane(s) in ${formatDuration(durationMs)}`
    );
    return { exitCode: 0, results };
  }

  console.error(
    `${summaryLabel} failed ${failures.length}/${lanes.length} lane(s) in ${formatDuration(durationMs)}`
  );
  console.error(
    `failed lanes: ${failures.map((failure) => failure.label).join(", ")}`
  );

  for (const failure of failures) {
    const tail = tailFile(failure.logPath, tailLines);
    const header = tail.truncated
      ? `${failure.label} tail last ${tailLines} lines (full log: ${failure.logPathRelative})`
      : `${failure.label} full log`;
    console.error(`\n--- ${header} ---`);
    console.error(tail.text);
  }
  console.error(`\nfull logs: ${relative(workspaceRoot, runDirectory)}`);

  return { exitCode: 1, results };
}

async function runLanes({ lanes, maxParallel, runDirectory, workspaceRoot }) {
  const results = [];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(maxParallel, lanes.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < lanes.length) {
        const index = nextIndex++;
        results.push(
          await runLane({
            index,
            lane: lanes[index],
            runDirectory,
            workspaceRoot
          })
        );
      }
    })
  );

  return results.sort((left, right) => left.index - right.index);
}

function runLane({ index, lane, runDirectory, workspaceRoot }) {
  const logPath = join(runDirectory, `${sanitizeFileName(lane.key)}.log`);
  const logStream = createWriteStream(logPath, { flags: "w" });
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(lane.command[0], lane.command.slice(1), {
      cwd: lane.cwd ?? workspaceRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    logStream.write(`$ ${formatCommand(lane.command)}\n\n`);
    child.stdout.on("data", (chunk) => logStream.write(chunk));
    child.stderr.on("data", (chunk) => logStream.write(chunk));

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      logStream.write(`\n[runner] ${error.message}\n`);
      finish(1);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      finish(typeof code === "number" ? code : 1);
    });

    function finish(exitCode) {
      logStream.end(() => {
        resolve({
          durationMs: Date.now() - startedAt,
          exitCode,
          index,
          key: lane.key,
          label: lane.label,
          logPath,
          logPathRelative: relative(workspaceRoot, logPath)
        });
      });
    }
  });
}

export function readPositiveIntegerOption(name, defaultValue) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return defaultValue;
  }
  const parsed = Number.parseInt(process.argv[index + 1] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function formatCommand(command) {
  return command.map(shellQuote).join(" ");
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function sanitizeFileName(value) {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "-");
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function tailFile(path, lineCount) {
  if (!existsSync(path)) {
    return { text: "", truncated: false };
  }
  const content = readFileSync(path, "utf8");
  const lines =
    content.length === 0
      ? []
      : content.endsWith("\n")
        ? content.slice(0, -1).split("\n")
        : content.split("\n");
  return {
    text: lines.slice(-lineCount).join("\n"),
    truncated: lines.length > lineCount
  };
}
