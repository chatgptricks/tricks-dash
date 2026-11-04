# Connect a ChatGPT dot to SentientDash

This guide helps a dot complete an authorized user's connection in its host.
The user signs in with their own authorized Sentient Google account and
personally reviews and approves the requested access. Reading this guide does
not install a plugin, grant workspace access, or authorize a connection.

## Open the existing plugin

[Open SentientDash in ChatGPT](https://chatgpt.com/plugins/Plugin_502d0e5e00e8819197bfa51ca6c7d6f4).

The current release contains workflow skills only. Adding its OAuth MCP
connection is blocked by the publishing workspace's policy, which does not
permit plugins with MCPs. The OAuth plugin update is pending; opening the
existing plugin page alone does not establish an OAuth connection.

Use this existing plugin when it is available to the user's ChatGPT account and
workspace. Availability depends on the host's permissions and workspace policy;
this link does not promise access for other users or workspaces. Do not create
a different plugin, broaden sharing, or change workspace permissions to connect.
Use a working OAuth connection for this same user when the host already provides
one; do not create a duplicate connection unnecessarily.

## Connection details for an authorized host

These details describe the server's OAuth support for a host and plugin
configuration permitted by the user's workspace. They are documentation,
not a workaround for a blocked plugin capability or unavailable plugin.

- MCP endpoint and OAuth resource: `https://cortex-api-db2e.onrender.com/mcp`
- Transport: Streamable HTTP over HTTPS.
- Protected-resource discovery: `https://cortex-api-db2e.onrender.com/.well-known/oauth-protected-resource/mcp`
- Authorization-server discovery: `https://cortex-api-db2e.onrender.com/.well-known/oauth-authorization-server`
- Client registration: public Dynamic Client Registration (DCR), token endpoint
  authentication method `none`, authorization code with PKCE `S256`.
- Base scope: `sentient:read`. Request `sentient:write` as well for requested
  product actions. The owner's current SentientDash roles still apply; write
  scope does not create an administrator role.

Let the host discover the OAuth endpoints, register its exact supported ChatGPT
callback, and manage state, PKCE, tokens, and refresh. No manually supplied
client secret or agent connection code is needed for this OAuth flow. Do not
construct an authorization URL or share a consent transaction URL as an install
link. Never inspect credentials stored by another connection or account.

## Complete the connection when the host permits it

1. Open the plugin in the user's host and use its secure OAuth connection flow.
   Inspect the actual host UI rather than guessing menu or field names.
2. The user signs in on SentientDash with their own authorized Google account,
   reviews the requested access, and chooses **Authorize connection** or
   **Cancel**. The dot must not approve consent or switch identities for them.
3. The browser returns to the host's registered callback. The host completes the
   exchange and stores credentials securely. Never request, copy, paste, log,
   or put tokens, authorization codes, or agent codes into chat or documents.
4. Call `product_guide` and `product_me` through the connected MCP using empty
   arguments. Confirm `auth_method` is `oauth`, and report the actual owner,
   access mode, and relevant permissions from successful responses. Do not
   mutate production to test the connection.

A readable guide, an installed plugin, or an open sign-in page is not proof of
a working connection. Report success only after those authenticated checks.

## If the host cannot finish

- If the plugin is unavailable to this account/workspace, or host policy blocks
  plugins with MCP/OAuth connections, stop at that blocker and report exactly
  what is unavailable. Do not bypass policy, broaden the audience, or promise
  that another user's dot can install it.
- If the host cannot perform DCR/PKCE or asks for a secret for this public-client
  flow, report that mismatch. Do not substitute someone else's credentials or
  quietly change to the separate agent-code flow.
- If a consent request expires, restart the host's connection flow. Do not
  reuse or share the old transaction.
- A `401` lets the host try token refresh; use secure reconnection if refresh
  fails. A `403` is a permission restriction, not permission to change identity.
  A `503` is a server availability failure, not evidence that consent was lost.

The user can manage or revoke their OAuth grants at
[Agent connections](https://sentientdash.app/agents.html). Revocation and
connection-code management remain separate operations.
