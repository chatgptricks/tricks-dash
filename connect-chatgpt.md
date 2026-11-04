# Connect a ChatGPT dot to SentientDash

Create a personal OAuth connection to SentientDash in ChatGPT's plugin manager.
The user signs in with their own authorized Sentient Google account and
personally reviews and approves the requested access. Reuse a working connection
for this same user when available; do not create duplicates unnecessarily.

A separate **SentientDash for Oopart** connection was verified through successful
`product_guide` and `product_me` calls using `auth_method: oauth` with
`sentient:read` and `sentient:write`. This demonstrates a working personal OAuth
route. It does not establish permissions for another recipient or provide a
public installation link to that connection.

## Add your own connection in ChatGPT

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins). Select **+**, then
   **Add custom MCP server**, when this action is available in the user's host.
   Inspect the actual UI; its labels may change.
2. Enter a name such as **SentientDash** and a description such as
   **SentientDash research, queues, and analytics**. Use these connection values:
   - Connection URL: `https://cortex-api-db2e.onrender.com/mcp`
   - Transport: Streamable HTTP over HTTPS.
   - Authentication: OAuth with public Dynamic Client Registration (DCR).
   - Client registration/token endpoint authentication: `none`; the host
     registers its client automatically and uses authorization code with
     PKCE `S256`. No manually supplied client ID or secret is needed.
   - Scope: `sentient:read`; add `sentient:write` for requested product actions.
3. Review the host's risk warning with the user. Obtain their explicit
   confirmation for this persistent connection before selecting
   **Create as a plugin**. Do not dismiss warnings or create the connection
   without that confirmation. Do not change workspace permissions.
4. The user signs in on SentientDash with their own authorized Google account,
   checks the displayed identity and requested permissions, and chooses
   **Authorize connection** or **Cancel**. The dot must not approve consent,
   switch identities, or authorize another person's account on their behalf.
5. Let the host receive its registered callback and complete the exchange.
   The host manages state, PKCE, tokens, and refresh in secure storage.
   Never request, copy, paste, log, or put tokens, authorization codes, or agent
   codes into chat or documents. Never extract another connection's credentials.

These steps follow the [official ChatGPT connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).
An actual denial of the user's custom MCP action is a blocker; do not use these
instructions to bypass it. A separate publishing error for the optional workflow
plugin below is not evidence that this custom connection action is denied.

## OAuth discovery and permissions

- MCP endpoint and OAuth resource: `https://cortex-api-db2e.onrender.com/mcp`
- Protected-resource discovery: `https://cortex-api-db2e.onrender.com/.well-known/oauth-protected-resource/mcp`
- Authorization-server discovery: `https://cortex-api-db2e.onrender.com/.well-known/oauth-authorization-server`
- Public DCR client, token endpoint authentication `none`, PKCE `S256`.
- Base scope: `sentient:read`. Optional action scope: `sentient:write`.

Let the host discover endpoints and register its exact supported ChatGPT
callback. The server uses public DCR and does not declare CIMD. If the host
requires CIMD or a client secret instead, stop at that authentication mismatch;
do not invent a secret, client metadata, or unsupported configuration.
The owner's current SentientDash roles apply to every call. Write scope does
not create an administrator role; action tools also require `confirm: true`.

## Verify the connection

Call `product_guide` and `product_me` through the connected MCP using empty
arguments. Confirm `auth_method` is `oauth`, verify the actual owner, and report
the returned access mode, scopes, and relevant permissions. A separate
agent-code connection is not proof that this OAuth connection is working.
Do not mutate production to test a connection. An open guide, an installed
plugin, or a visible sign-in page is not proof of authenticated access.

## Optional workflow skills plugin

[Optional SentientDash workflow skills](https://chatgpt.com/plugins/Plugin_502d0e5e00e8819197bfa51ca6c7d6f4).

This existing plugin currently contains workflow skills only. Updating it to
include an MCP connection returned `403` from the publishing workspace's policy:
**You do not have permission to use plugins with MCPs. Contact your workspace
admin for access**. That error applies to this publishing update, not to every
custom MCP connection. It does not invalidate the separately verified OAuth
connection above. Do not retry the denied publishing update or broaden this
plugin's audience. Access to its skills depends on the recipient's permissions;
it is optional and does not connect their SentientDash account.

## If setup cannot finish

- If the user's actual host denies custom MCP creation or blocks OAuth, stop
  there and report that exact denial. Do not bypass policy, change permissions,
  share someone else's connection, or quietly substitute an agent-code flow.
- If the optional workflow skills are unavailable, report that separately;
  their absence does not determine whether the host permits a personal MCP.
- If a consent request expires, restart the host's flow. Do not reuse or share
  a consent transaction URL or manually construct an authorization URL.
- A `401` lets the host try refresh; use secure reconnection if refresh fails.
  A `403` is a permission restriction, not permission to change identity.
  A `503` is a server availability failure, not evidence that consent was lost.

Manage or revoke personal OAuth grants at
[Agent connections](https://sentientdash.app/agents.html). OAuth grants and
legacy connection codes remain separate operations. Reading this documentation
does not install a connection, grant workspace access, or approve consent.
