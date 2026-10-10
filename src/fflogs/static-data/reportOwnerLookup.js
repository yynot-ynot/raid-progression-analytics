import { REPORT_OWNER_QUERY } from "../api/queries/reportOwner.js";

/** Resolve a report code to the owner whose personal report list should be analyzed. */
export async function loadReportOwner({ reportCode, queryFflogs }) {
  const data = await queryFflogs({
    query: REPORT_OWNER_QUERY,
    variables: { code: reportCode },
  });
  const owner = data?.reportData?.report?.owner;
  return owner?.id != null ? { id: owner.id, name: owner.name || "" } : null;
}
