# Share-link navigation design

The page supports three ways to arrive at a source selection:

| Mode | Starting URL | First source decision |
| --- | --- | --- |
| Fresh | `/` | After authentication, load the signed-in user's normal default source. |
| New user choice | Any current app URL | An explicit source button click or successful Analyze action replaces the source. |
| Shared link | `/?source=...` | Load the shared source, never the recipient's default source. |

## Durable URL state

Only these query parameters are durable and shareable:

| Parameter | Value | Dependency |
| --- | --- | --- |
| `source` | Canonical FFLogs guild or personal-report-list URL | Required |
| `zone` | `zoneId:zoneName` | Requires `source` |
| `encounter` | Positive FFLogs encounter ID | Requires `source` and `zone` |

`code`, `state`, access tokens, and user identities are OAuth/session state, not share state. They must never be retained in a share URL.

## URL transition rules

| Committed action | Resulting URL state |
| --- | --- |
| Fresh user completes sign-in | Write the default source as `source`. |
| User selects a source button | Replace `source`; clear `zone` and `encounter`. |
| User successfully analyzes a pasted source | Replace `source` with the canonical source actually loaded; clear descendants. |
| User opens a zone | Set `zone`; clear `encounter`. |
| User selects a fight, including an auto-selected sole fight | Set `encounter`. |
| Shared source cannot provide the requested zone | Retain `source`; remove invalid `zone` and `encounter`. |
| Shared zone cannot provide the requested encounter | Retain `source` and `zone`; remove invalid `encounter`. |

For a report URL, the app resolves the report owner and writes that owner's canonical personal-report-list URL. This matches the history scope actually loaded.

## OAuth handoff

FFLogs replaces the browser query string with `code` and `state` during its callback. Before starting OAuth, the app saves the parsed share selection in `sessionStorage`. After it validates and exchanges the callback, it restores the saved selection with `history.replaceState`, then loads in the strict order `source -> zone -> encounter`. A saved share selection always suppresses the ordinary post-login default-source initialization.

## Test strategy

All navigation tests are offline. The production test command excludes `tests/live/*` and uses in-memory storage, mocked OAuth token responses, and injected `queryFflogs` fixtures.

| Behavior | Test coverage |
| --- | --- |
| Fresh, direct shared, and OAuth-return startup modes | `tests/unit/shareSelection.test.js` |
| Parameter parsing, normalization, and serialization | `tests/unit/shareSelection.test.js` |
| Source replacement clears descendants; zone replacement clears encounter | `tests/unit/shareSelection.test.js` |
| Shared selection survives an OAuth callback and corrupted session state is discarded | `tests/unit/shareSelection.test.js` |
| Mocked PKCE exchange and callback cleanup | `tests/unit/auth.test.js`, `tests/integration/fflogsFlow.test.js` |
| Source discovery, one-fight auto-selection, multi-fight choice, and Legacy-zone separation | `tests/integration/ultimateWorkflow.test.js` |
| Page wiring for source, zone, and selection behavior | `tests/unit/indexHtml.test.js` |

None of these tests needs a client secret, a user account, or a request to FFLogs.
