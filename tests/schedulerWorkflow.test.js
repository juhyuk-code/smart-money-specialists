import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WORKFLOW_PATH = ".github/workflows/smart-money-analytics-refresh.yml";

test("GitHub scheduler workflow is manual-only fallback after Vercel Cron takes over", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /JOB_SECRET:\s*\$\{\{ secrets\.JOB_SECRET \}\}/);
  assert.match(workflow, /x-job-secret: \$\{JOB_SECRET\}/);
  assert.match(workflow, /https:\/\/smart-money-specialists\.vercel\.app\/api\/smart-money\/live\/refresh\?mode=cohort-exposure&cohortLimit=250&marketLimit=100&positionPageLimit=3/);
  assert.match(workflow, /curl --fail-with-body/);
});

test("Vercel cron refreshes production cohort exposure every 30 minutes with Pro workload", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

  assert.equal(config.functions?.["api/**/*.js"]?.maxDuration, 300);
  assert.deepEqual(config.crons, [
    {
      path: "/api/smart-money/live/refresh?mode=cohort-exposure&cohortLimit=250&marketLimit=100&positionPageLimit=3",
      schedule: "*/30 * * * *",
    },
  ]);
});
