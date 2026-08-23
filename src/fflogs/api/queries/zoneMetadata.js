/** Query static metadata for a FFLogs zone. */
export const ZONE_METADATA_QUERY = `
query ZoneMetadata($zoneId: Int!) {
  worldData {
    zone(id: $zoneId) {
      id
      name
      frozen
      encounters {
        id
        name
      }
      difficulties {
        id
        name
      }
      partitions {
        id
        name
      }
    }
  }
}
`;

/** Query static metadata for a single encounter. */
export const ENCOUNTER_METADATA_QUERY = `
query EncounterMetadata($encounterId: Int!) {
  worldData {
    encounter(id: $encounterId) {
      id
      name
      zone {
        id
        name
      }
    }
  }
}
`;
