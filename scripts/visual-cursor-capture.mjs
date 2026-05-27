import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const cdpUrl = process.env.CURSOR_CDP_URL ?? 'http://localhost:9222';
const outputDir = path.resolve('visual', 'actual');
const targetTitle = process.env.CURSOR_TARGET_TITLE ?? 'Cursor';

function parseClip(value) {
  if (!value) return null;

  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error('VISUAL_CLIP must be "x,y,width,height"');
  }

  const [x, y, width, height] = parts;
  return { x, y, width, height };
}

async function getWorkbenchPage(context) {
  const pages = context.pages();
  const candidates = await Promise.all(
    pages.map(async (page) => ({
      page,
      url: page.url(),
      title: await page.title().catch(() => ''),
    })),
  );

  const titleMatch =
    targetTitle && targetTitle !== 'Cursor'
      ? candidates.find((candidate) => candidate.title.includes(targetTitle))?.page
      : undefined;
  const page =
    titleMatch ??
    candidates.find((candidate) => candidate.url.includes('workbench.html'))?.page ??
    candidates.find((candidate) => candidate.title.includes(targetTitle))?.page ??
    candidates.find((candidate) => candidate.url.includes('vscode-file://'))?.page;

  if (!page) {
    const targetList = candidates
      .map((candidate) => `- ${candidate.title || '(untitled)'} ${candidate.url}`)
      .join('\n');
    throw new Error(`Could not find Cursor workbench target.\nAvailable targets:\n${targetList}`);
  }

  return page;
}

async function getViewport(page) {
  return page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }));
}

async function getInspection(page) {
  return page.evaluate(() => {
    const rtlText = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    const selectorGroups = {
      injectedStyles: 'style',
      markdown: '.markdown-root, .markdown-section',
      composer: '.composer-human-message, .aislash-editor-input, .aislash-editor-input-readonly',
      code: 'code, pre, .markdown-code-outer-container, .cursor-code-block-content',
      tables: '.markdown-table-container, table.markdown-table',
      plan: '.plan-editor, .tiptap.ProseMirror',
    };

    const selectors = Object.fromEntries(
      Object.entries(selectorGroups).map(([name, selector]) => [
        name,
        document.querySelectorAll(selector).length,
      ]),
    );

    const injected = Array.from(document.querySelectorAll('style')).some((style) =>
      style.textContent?.includes('RTL Auto-Detection Active') ||
      style.textContent?.includes('.markdown-table-container'),
    );

    const samples = Array.from(document.querySelectorAll('p, li, h1, h2, h3, blockquote, textarea'))
      .filter((element) => rtlText.test(element.textContent || ''))
      .slice(0, 10)
      .map((element) => {
        const styles = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || '').trim().slice(0, 120),
          dir: element.getAttribute('dir'),
          computedDirection: styles.direction,
          textAlign: styles.textAlign,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });

    return {
      title: document.title,
      url: location.href,
      injected,
      selectors,
      rtlSamples: samples,
    };
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  console.warn(
    'Privacy notice: visual capture writes Cursor screenshots and short visible RTL text samples to visual/actual.',
  );

  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error(`Connected to ${cdpUrl}, but no browser contexts were found.`);
  }

  const page = await getWorkbenchPage(context);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(Number(process.env.VISUAL_WAIT_MS ?? 1000));

  const viewport = await getViewport(page);
  const fullPath = path.join(outputDir, 'cursor-full.png');
  await page.screenshot({ path: fullPath, scale: 'css' });

  const customClip = parseClip(process.env.VISUAL_CLIP);
  const rightPaneClip =
    customClip ?? {
      x: Math.round(viewport.width * 0.55),
      y: 0,
      width: Math.round(viewport.width * 0.45),
      height: viewport.height,
    };
  const rightPanePath = path.join(outputDir, 'cursor-right-pane.png');
  await page.screenshot({ path: rightPanePath, clip: rightPaneClip, scale: 'css' });

  const inspection = {
    capturedAt: new Date().toISOString(),
    cdpUrl,
    viewport,
    rightPaneClip,
    ...(await getInspection(page)),
  };
  const inspectionPath = path.join(outputDir, 'cursor-inspection.json');
  await fs.writeFile(inspectionPath, `${JSON.stringify(inspection, null, 2)}\n`);

  console.log(`Captured ${fullPath}`);
  console.log(`Captured ${rightPanePath}`);
  console.log(`Wrote ${inspectionPath}`);
  console.log(`RTL script detected: ${inspection.injected ? 'yes' : 'no'}`);
  console.log(`RTL text samples found: ${inspection.rtlSamples.length}`);
}

main()
  .then(() => {
    // Keep Cursor open; exit this helper after the CDP capture is complete.
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
