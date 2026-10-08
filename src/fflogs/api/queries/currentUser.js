/** GraphQL query used to verify the token and identify the authorized user. */
export const CURRENT_USER_QUERY = `
query CurrentFflogsUser {
  userData {
    currentUser {
      id
      name
      guilds {
        id
        name
        type
      }
    }
  }
}
`;
