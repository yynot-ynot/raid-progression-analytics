#!/usr/bin/env node

/**
 * Capture live FFLogs responses for the configured raid-team scope.
 *
 * Required:
 *   FFLOGS_ACCESS_TOKEN=<user OAuth token>
 *
 * Optional:
 *   FFLOGS_CAPTURE_OUTPUT=/absolute/or/relative/path.json
 *   FFLOGS_REPORT_CODE=kzJ2jmRPdHv6rDGV
 *   FFLOGS_REPORT_LIMIT=1
 *   FFLOGS_CAPTURE_REPORT_DETAIL=1
 *
 * The default output path is outside the repo because live FFLogs payloads may
 * contain private report metadata. Move or copy captures into versioned fixtures
 * only after reviewing them.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { captureFflogsLiveData } from "../../src/fflogs/static-data/liveCapture.js";

const DEFAULT_OUTPUT_PATH = "/private/tmp/raid-progression-analytics/fflogs-live-capture.json";

export { captureFflogsLiveData };

/**
 * Persist a capture object as formatted JSON.
 *
 * @param {object} params
 * @returns {Promise<string>}
 */
export async function writeCapture({ capture, outputPath }) {
  const resolvedPath = resolve(outputPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(capture, null, 2)}\n`, "utf8");
  return resolvedPath;
}

/**
 * CLI entry point used by `npm run capture:fflogs`.
 *
 * @returns {Promise<void>}
 */
export async function main() {
  const accessToken = process.env.FFLOGS_ACCESS_TOKEN;
  const outputPath = process.env.FFLOGS_CAPTURE_OUTPUT || DEFAULT_OUTPUT_PATH;
  const reportCode = process.env.FFLOGS_REPORT_CODE || null;
  const reportLimit = Number(process.env.FFLOGS_REPORT_LIMIT || 1);
  const includeReportDetail = process.env.FFLOGS_CAPTURE_REPORT_DETAIL !== "0";

  const capture = await captureFflogsLiveData({
    accessToken,
    reportCode,
    reportLimit,
    includeReportDetail,
  });
  const savedPath = await writeCapture({ capture, outputPath });

  console.info(`Captured FFLogs live data to ${savedPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
