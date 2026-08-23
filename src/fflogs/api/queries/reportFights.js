/** Query one report's fight summaries, player actors, and encounter phase metadata. */
export const REPORT_FIGHTS_QUERY = `
query ReportFights(
  $code: String!
  $allowUnlisted: Boolean
  $encounterId: Int
  $difficulty: Int
  $killType: KillType
) {
  reportData {
    report(code: $code, allowUnlisted: $allowUnlisted) {
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
      guild {
        id
        name
      }
      guildTag {
        id
        name
      }
      owner {
        id
        name
      }
      fights(
        encounterID: $encounterId
        difficulty: $difficulty
        killType: $killType
        translate: true
      ) {
        id
        name
        encounterID
        originalEncounterID
        difficulty
        kill
        startTime
        endTime
        combatTime
        bossPercentage
        fightPercentage
        lastPhase
        lastPhaseAsAbsoluteIndex
        lastPhaseIsIntermission
        phaseTransitions {
          id
          startTime
        }
        friendlyPlayers
        standardComposition
      }
      masterData(translate: true) {
        actors(type: "Player") {
          id
          name
          server
          type
          subType
        }
      }
      phases {
        encounterID
        separatesWipes
        phases {
          id
          name
          isIntermission
        }
      }
    }
  }
}
`;
