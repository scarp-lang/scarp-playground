import { readFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';

type BrowserRssMeasurement =
  | { available: true; processes: number; summedRssKiB: number }
  | { available: false; reason: string };

/**
 * Chromium browser-process RSS as observed from Linux procfs.
 * SUM of RSS can double-count shared physical pages. This is not a per-worker
 * memory limit and is only comparable as one host-specific diagnostic series.
 * CDP process enumeration can include other browser-context processes.
 */
export async function readChromiumProcessRss(browser: Browser): Promise<BrowserRssMeasurement> {
  if (process.platform !== 'linux') {
    return { available: false, reason: 'Linux /proc memory sampling only' };
  }

  let session: Awaited<ReturnType<Browser['newBrowserCDPSession']>> | undefined;
  try {
    session = await browser.newBrowserCDPSession();
    const info = await session.send('SystemInfo.getProcessInfo');
    let summedRssKiB = 0;
    let processes = 0;
    for (const item of info.processInfo) {
      const pid = item.id;
      if (!Number.isInteger(pid) || pid <= 0) continue;
      try {
        const status = readFileSync('/proc/' + pid + '/status', 'utf8');
        const match = status.match(/^VmRSS:\s*(\d+)\s+kB\s*$/m);
        if (!match) continue;
        const rss = Number(match[1]);
        if (!Number.isSafeInteger(rss) || rss < 0) continue;
        summedRssKiB += rss;
        processes += 1;
      } catch {
        // A short-lived Chromium process may exit before procfs is read.
      }
    }
    return processes > 0
      ? { available: true, processes, summedRssKiB }
      : { available: false, reason: 'No readable Chromium process RSS values' };
  } catch {
    return { available: false, reason: 'Chromium process enumeration unavailable' };
  } finally {
    await session?.detach().catch(() => {});
  }
}

/** CDP JSHeapUsedSize measures page JavaScript heap, NOT Worker or WASM heap. */
export async function readPageJsHeap(page: Page): Promise<number | null> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Performance.enable');
    const result = await session.send('Performance.getMetrics');
    const bytes = result.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value;
    return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0
      ? Math.round(bytes) : null;
  } finally {
    await session.detach().catch(() => {});
  }
}
