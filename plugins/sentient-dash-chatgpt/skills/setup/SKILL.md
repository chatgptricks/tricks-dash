---
name: setup
description: Connect ChatGPT to SentientDash through OAuth, verify the connection owner and permissions, or reconnect after expiry or revocation.
---

# Set up SentientDash for ChatGPT

Use a working connection when available. First call `product_guide` and
`product_me` with empty argument objects. If both succeed, report the actual
access mode and relevant permissions and continue the user's task.

If disconnected, use the host's OAuth connection flow for this plugin. The
endpoint is `https://cortex-api-db2e.onrender.com/mcp`, using Streamable HTTP.
The package requests automatic public-client registration through DCR;
discovery supplies the authorization and token endpoints. It includes no
secret, account credential, or token.

The user signs in with their own authorized Sentient Google account on
SentientDash and reviews the requested access before selecting **Authorize
connection**. Explain the displayed scope: read-only access supports research
and reports; read/write access also permits requested product actions under
the owner's current roles. Full access does not create an administrator role.
The user can cancel without granting access. Do not approve consent or change
the user's identity on their behalf.

The host registers a public client automatically through DCR, with token
endpoint authentication `none` and authorization code with PKCE S256. No
manually configured client ID or client secret is needed. If the host requires
a secret for that public-client flow, explain the mismatch instead of supplying
an agent code. Do not invent the host's form labels; inspect its actual UI
when available.

After returning to the host, call `product_guide` and `product_me` again.
Report verification only after successful responses. Never mutate production
to test a connection. The server retains existing `sad_agent_` connection
codes for compatible clients through the separate legacy plugin; this OAuth
package does not ask the user to copy or paste one.

## Troubleshooting

- **401:** Let the host refresh its OAuth token. If refresh fails, use its
  reconnect flow. Do not request tokens in chat or inspect stored credentials.
- **403:** Check the actual roles and access mode from `product_me`; do not
  switch identities or bypass restrictions.
- **Expired consent request:** Start a new connection from ChatGPT.
- **Write scope required:** Protected action tools can be listed for an OAuth
  read-only connection so the host can offer a scope upgrade. If a call returns
  `insufficient_scope`, use the host's reconnect/upgrade flow for requested
  actions. The owner's current role must also permit the operation.
- **Revocation:** When requested, open [Agent connections](https://sentientdash.app/agents.html),
  find the connection under **OAuth connections**, select **Revoke**, then
  **Confirm revoke**. Revoking OAuth does not revoke separate agent codes.

After setup, use [the SentientDash workflow skill](../sentient-dash/SKILL.md).
