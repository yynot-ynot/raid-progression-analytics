/** Resolve a report URL to its FFLogs owner without loading any fight data. */
export const REPORT_OWNER_QUERY = `
query ReportOwner($code: String!) {
  reportData {
    report(code: $code, allowUnlisted: true) {
      owner {
        id
        name
      }
    }
  }
}
`;
