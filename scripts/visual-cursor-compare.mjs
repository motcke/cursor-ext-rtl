import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const { default: pixelmatch } = await import('pixelmatch');

const baselineDir = path.resolve('visual', 'baseline');
const actualDir = path.resolve('visual', 'actual');
const diffDir = path.resolve('visual', 'diff');
const threshold = Number(process.env.VISUAL_THRESHOLD ?? 0.002);
const updateBaseline = process.argv.includes('--update-baseline');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPng(filePath) {
  const buffer = await fs.readFile(filePath);
  return PNG.sync.read(buffer);
}

async function listPngs(dir) {
  if (!(await exists(dir))) return [];

  const entries = await fs.readdir(dir);
  return entries.filter((entry) => entry.endsWith('.png')).sort();
}

async function approveActuals() {
  await fs.mkdir(baselineDir, { recursive: true });
  const actualPngs = await listPngs(actualDir);
  if (actualPngs.length === 0) {
    throw new Error('No actual screenshots found. Run npm run visual:capture first.');
  }

  for (const fileName of actualPngs) {
    await fs.copyFile(path.join(actualDir, fileName), path.join(baselineDir, fileName));
    console.log(`Approved baseline ${fileName}`);
  }
}

async function compareFile(fileName) {
  const baselinePath = path.join(baselineDir, fileName);
  const actualPath = path.join(actualDir, fileName);
  const diffPath = path.join(diffDir, fileName);

  if (!(await exists(actualPath))) {
    return {
      fileName,
      passed: false,
      reason: 'missing actual screenshot',
    };
  }

  const baseline = await readPng(baselinePath);
  const actual = await readPng(actualPath);

  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return {
      fileName,
      passed: false,
      reason: `size changed from ${baseline.width}x${baseline.height} to ${actual.width}x${actual.height}`,
    };
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const differentPixels = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.1 },
  );
  const ratio = differentPixels / (baseline.width * baseline.height);

  await fs.mkdir(diffDir, { recursive: true });
  await fs.writeFile(diffPath, PNG.sync.write(diff));

  return {
    fileName,
    passed: ratio <= threshold,
    differentPixels,
    ratio,
    diffPath,
  };
}

async function main() {
  if (updateBaseline) {
    await approveActuals();
    return;
  }

  const baselinePngs = await listPngs(baselineDir);
  if (baselinePngs.length === 0) {
    throw new Error(
      'No baseline screenshots found. Run npm run visual:capture, review visual/actual, then run npm run visual:approve.',
    );
  }

  const results = [];
  for (const fileName of baselinePngs) {
    results.push(await compareFile(fileName));
  }

  for (const result of results) {
    if (result.passed) {
      console.log(`PASS ${result.fileName}`);
    } else {
      console.log(`FAIL ${result.fileName}: ${result.reason ?? `${(result.ratio * 100).toFixed(3)}% changed`}`);
    }
  }

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
