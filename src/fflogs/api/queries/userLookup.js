/** Lookup the public identity needed to present a pasted personal source. */
export const USER_BY_ID_QUERY = `
query UserById($userId: Int!) {
  userData {
    user(id: $userId) {
      id
      name
    }
  }
}
`;

/**
 * Guild memberships require the browser's `view-user-profile` authorization.
 * It is deliberately separate: FFLogs can return public identity while
 * rejecting this protected field for a particular profile.
 */
export const USER_GUILDS_BY_ID_QUERY = `
query UserGuildsById($userId: Int!) {
  userData {
    user(id: $userId) {
      guilds {
        id
        name
        type
      }
    }
  }
}
`;
