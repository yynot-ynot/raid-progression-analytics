/** Query paginated reports for a guild, report tag, user, zone, and time window. */
export const RAID_TEAM_REPORTS_QUERY = `
query RaidTeamReports(
  $guildId: Int
  $guildTagId: Int
  $guildName: String
  $guildServerSlug: String
  $guildServerRegion: String
  $userId: Int
  $zoneId: Int
  $gameZoneId: Int
  $startTime: Float
  $endTime: Float
  $page: Int
  $limit: Int
) {
  reportData {
    reports(
      guildID: $guildId
      guildTagID: $guildTagId
      guildName: $guildName
      guildServerSlug: $guildServerSlug
      guildServerRegion: $guildServerRegion
      userID: $userId
      zoneID: $zoneId
      gameZoneID: $gameZoneId
      startTime: $startTime
      endTime: $endTime
      page: $page
      limit: $limit
    ) {
      data {
        code
        title
        startTime
        endTime
        visibility
        revision
        segments
        exportedSegments
        archiveStatus {
          isArchived
          isAccessible
          archiveDate
        }
        region {
          id
          name
          compactName
        }
        zone {
          id
          name
        }
        owner {
          id
          name
        }
        guild {
          id
          name
        }
        guildTag {
          id
          name
        }
      }
      total
      per_page
      current_page
      last_page
      has_more_pages
    }
  }
}
`;
