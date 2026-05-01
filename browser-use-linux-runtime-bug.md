# Browser Use Linux Runtime Bug

## Symptoms

- Browser Use policy checks for Google or other external targets can fail at `chatgpt.com/backend-api/aura/site_status` because the generated Linux `node_repl` runtime used raw Node `fetch`, which does not carry the desktop app's authenticated host session.
- Opening a local target such as `http://localhost:3000/` can reach Browser Use's permission flow, then crash with `nodeRepl.createElicitation is not supported by the generated Linux node_repl runtime.`

## Root Cause

The upstream desktop app expects the Browser Use JavaScript runtime to talk back to the MCP host for privileged desktop operations. The generated Linux fallback runtime only implemented inbound MCP tool requests (`tools/list`, `tools/call`, and `js_reset`). It did not support outbound JSON-RPC requests back to the host, so Browser Use could not ask the client to render permission prompts with `elicitation/create`.

The same limitation affected policy fetches. Site status checks need an authenticated desktop-host fetch bridge, not unauthenticated raw Node network access from the fallback runtime.

## Fixed Behavior

- `globalThis.nodeRepl.createElicitation(params)` now forwards `elicitation/create` to the MCP client when the client advertised elicitation support during `initialize`.
- Host JSON-RPC responses are resolved separately from normal inbound tool requests, so outbound runtime requests do not get mistaken for unknown tool calls.
- Pending outbound requests are rejected cleanly if the runtime shuts down before the host responds.
- Some desktop builds advertise elicitation support but reject the `elicitation/create` request. In that host-incompatible case, Browser Use localhost origins are accepted by the generated runtime so local development URLs such as `http://localhost:3000/` can still open.
- The localhost fallback is restricted to Browser Use permission requests whose `meta.origin` is a local HTTP(S) origin. Non-local origins still require the desktop host to complete the permission request.
- `globalThis.nodeRepl.fetch(...)` first asks the host for `nodeRepl/fetch` and rebuilds a standard `Response`.
- If the MCP host does not support `nodeRepl/fetch`, Browser Use policy checks fall back to the route-scoped in-app browser native pipe method `nodeReplFetch`.
- The Linux desktop main bundle wires `nodeReplFetch` to Electron's authenticated `net.fetch` path, reusing the signed-in app session and refreshing auth once on HTTP 401.
- The native-pipe fallback only supports Browser Use `chatgpt.com/backend-api/aura/site_status` GET/HEAD policy requests with `url_request_source=codex_browser_use` plus route session metadata. Other URLs and request bodies are rejected instead of bypassing policy.
- If neither host bridge exists, the runtime still throws a clear unsupported-host-fetch diagnostic instead of falling back to unauthenticated raw Node fetch.

## Expected Localhost Flow

For `http://localhost:3000/`, Browser Use should show a client permission prompt. If the user accepts, Browser Use should continue without crashing on `nodeRepl.createElicitation`.

## Expected External Flow

For `https://example.com` or `https://www.google.com/search?q=doraemon`, Browser Use should run the authenticated `site_status` policy check through the desktop host bridge, then continue to the normal Browser Use permission prompt/navigation flow. Policy-blocked URLs should still block based on the authenticated `site_status` response.
