import assert from "node:assert/strict";
import test from "node:test";
import { loadUserById } from "../../src/fflogs/static-data/userLookup.js";

test("loadUserById maps public identity and a permitted Static membership", async () => {
  const user = await loadUserById({
    userId: 42,
    queryFflogs: async ({ query, variables }) => {
      assert.equal(variables.userId, 42);
      if (query.includes("UserGuildsById")) {
        return {
          userData: {
            user: { guilds: [{ id: 7, name: "Pasted Static", type: "1" }] },
          },
        };
      }
      return {
        userData: {
          user: {
            id: 42,
            name: "Pasted User",
          },
        },
      };
    },
  });

  assert.deepEqual(user, {
    id: 42,
    name: "Pasted User",
    guilds: [{ id: 7, name: "Pasted Static", type: "1" }],
  });
});

test("loadUserById retains personal identity when FFLogs denies guild membership", async () => {
  const user = await loadUserById({
    userId: 42,
    queryFflogs: async ({ query }) => {
      if (query.includes("UserGuildsById")) throw new Error("guild access denied");
      return { userData: { user: { id: 42, name: "Pasted User" } } };
    },
  });

  assert.deepEqual(user, { id: 42, name: "Pasted User", guilds: [] });
});
