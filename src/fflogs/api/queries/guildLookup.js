/** Shared FFLogs guild fields needed for static/team discovery. */
const GUILD_FIELDS = `
id
name
type
description
server {
  id
  name
  slug
  region {
    id
    name
    compactName
  }
}
tags {
  id
  name
}
parentGuild {
  id
  name
}
statics {
  id
  name
  type
}
`;

/** Lookup a concrete FFLogs guild/static by numeric ID. */
export const GUILD_BY_ID_QUERY = `
query GuildById($guildId: Int!) {
  guildData {
    guild(id: $guildId) {
      ${GUILD_FIELDS}
    }
  }
}
`;

/** Lookup a FFLogs guild/static by its name plus server slug and region. */
export const GUILD_BY_NAME_QUERY = `
query GuildByName($guildName: String!, $serverSlug: String!, $serverRegion: String!) {
  guildData {
    guild(name: $guildName, serverSlug: $serverSlug, serverRegion: $serverRegion) {
      ${GUILD_FIELDS}
    }
  }
}
`;

/** Discover guilds on a server when only server identity is known. */
export const GUILDS_BY_SERVER_QUERY = `
query GuildsByServer($serverSlug: String!, $serverRegion: String!, $page: Int, $limit: Int) {
  guildData {
    guilds(serverSlug: $serverSlug, serverRegion: $serverRegion, page: $page, limit: $limit) {
      data {
        id
        name
        type
      }
      total
      current_page
      last_page
      has_more_pages
    }
  }
}
`;
