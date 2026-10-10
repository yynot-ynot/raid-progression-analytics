import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_OWNER_QUERY } from "../../src/fflogs/api/queries/reportOwner.js";
import { loadReportOwner } from "../../src/fflogs/static-data/reportOwnerLookup.js";

test("loadReportOwner resolves a report to its owner", async () => {
  const owner = await loadReportOwner({
    reportCode: "MaJcdnYA3VkZxz6L",
    queryFflogs: async ({ query, variables }) => {
      assert.equal(query, REPORT_OWNER_QUERY);
      assert.deepEqual(variables, { code: "MaJcdnYA3VkZxz6L" });
      return { reportData: { report: { owner: { id: 102706, name: "enjio" } } } };
    },
  });

  assert.deepEqual(owner, { id: 102706, name: "enjio" });
});
