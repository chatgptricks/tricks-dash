# SentientDash for ChatGPT

This source package connects ChatGPT to the existing Cortex MCP through OAuth.
The separate `plugins/sentient-dash` package continues to use agent connection
codes. Existing clients keep their endpoint and authentication method.

## Connect / Conectar

**English**

1. Use this plugin's OAuth connection flow with
   `https://cortex-api-db2e.onrender.com/mcp` (Streamable HTTP).
2. Automatic registration uses a public DCR client. Sign in on SentientDash
   with your authorized Google account and review the requested access.
3. Select **Authorize connection** to return to ChatGPT, or **Cancel** to
   decline. The default request includes `sentient:read` and `sentient:write`;
   product roles still determine which actions are permitted. A client can
   request only `sentient:read` for reports.
4. Verify the connection with `product_guide` and `product_me`. The host manages
   OAuth tokens and refresh. Never paste a token or agent code into chat.
5. To revoke access, open [Agent connections](https://sentientdash.app/agents.html)
   and use **Revoke** → **Confirm revoke** under **OAuth connections**.

**Español**

1. Usa el flujo OAuth de este plugin con
   `https://cortex-api-db2e.onrender.com/mcp` (Streamable HTTP).
2. El registro automático usa un cliente público DCR. Inicia sesión en
   SentientDash con tu cuenta autorizada de Google y revisa el acceso solicitado.
3. Selecciona **Autorizar conexión** para regresar a ChatGPT o **Cancelar**
   para rechazarla. La solicitud predeterminada incluye `sentient:read` y
   `sentient:write`; tus roles del producto siguen determinando qué acciones
   puedes realizar. Un cliente puede solicitar solo `sentient:read` para informes.
4. Verifica la conexión con `product_guide` y `product_me`. El cliente administra
   los tokens OAuth y su renovación. Nunca pegues un token ni un código de
   agente en el chat.
5. Para revocar el acceso, abre [Conexiones de agentes](https://sentientdash.app/agents.html)
   y selecciona **Revocar** → **Confirmar revocación** en **Conexiones OAuth**.

## Automatic client registration / Registro automático del cliente

This release uses DCR public clients with token endpoint authentication `none`
and authorization code with PKCE S256. The host registers itself automatically;
no manually configured client ID or client secret is needed. The client must
register its exact callback URI. Supported ChatGPT callback routes are on
`https://chatgpt.com`: `/connector_platform_oauth_redirect` and
`/connector/oauth/{id}`. Other callback origins need a deliberate server
configuration change and corresponding consent-page support.

Esta versión usa clientes públicos DCR con autenticación del endpoint de token
`none` y código de autorización con PKCE S256. El cliente se registra
automáticamente; no necesitas configurar manualmente un ID ni un secreto.
Debe registrar exactamente su URI de callback. Las rutas admitidas para
ChatGPT están en `https://chatgpt.com`: `/connector_platform_oauth_redirect` y
`/connector/oauth/{id}`. Otros orígenes requieren un cambio explícito en la
configuración del servidor y en la página de consentimiento.

## Source and verification / Código y verificación

The package includes the endpoint, authentication declaration, workflows, and
icon. It includes no credentials. `client.mode` is `dcr`; CIMD is not declared
until the authorization server supports it. OAuth discovery supplies endpoint
URLs. Package `sentient-dash-chatgpt/` as a single directory in a ZIP outside
the source directory, excluding runtime dependencies and unrelated files.

El paquete contiene el endpoint, la declaración de autenticación, los flujos
y el icono. No contiene credenciales. `client.mode` es `dcr`; CIMD no se declara
hasta que el servidor de autorización lo admita. El descubrimiento OAuth
proporciona las URLs. Empaqueta `sentient-dash-chatgpt/` como una sola carpeta
en un ZIP fuera del directorio fuente, sin dependencias ni archivos ajenos.

Local tests verify consent and grant management against fixtures. Deployment,
installation, and a real ChatGPT authorization round trip are separate checks;
source/package creation alone does not verify them.

Las pruebas locales verifican el consentimiento y la administración de permisos
con datos simulados. El despliegue, la instalación y la autorización real en
ChatGPT requieren comprobaciones adicionales; crear el paquete no las confirma.

Authentication format: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins).
