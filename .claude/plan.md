# n8n-nodes-advanced-webhook-response — Design Plan

## Problem

n8n's built-in "Respond to Webhook" node applies a CSP `sandbox` header to all webhook HTML responses that:
- Blocks device APIs (microphone, camera, gyroscope)
- Blocks localStorage/sessionStorage/cookies (no `allow-same-origin`)
- Cannot be overridden via custom response headers (protected header)
- Can only be disabled server-wide via `N8N_INSECURE_DISABLE_WEBHOOK_IFRAME_SANDBOX=true`

## Solution

A custom n8n community node that offers:
1. **Iframe Wrapped mode** — wraps HTML in `<iframe srcdoc="..." sandbox="..." allow="...">` for per-node sandbox/device permission control without server config changes
2. **Direct mode** — serves HTML as-is (for users who set the env var)
3. All original Respond to Webhook response types (JSON, JWT, Text, Binary, Redirect, etc.)
4. Enhanced features: HTML code editor, Content-Type auto-detection, streaming, CORS/security/cookie header helpers

## Architecture

- Package: `n8n-nodes-advanced-webhook-response`
- Node: `Advanced Respond to Webhook`
- Single node implementing `INodeType` with imperative `execute()` method
- Utility modules for iframe wrapping, header building, HTML detection

## Key Design Decisions

1. **Iframe wrapping bypasses CSP** — The outer page (wrapper) is subject to n8n's CSP, but the inner iframe has its own sandbox/allow attributes we control directly
2. **Header priority**: auto-detected → helper-generated → user custom (user always wins)
3. **Streaming** supported for text, html, and json response types
4. **Separate webhook domain** — user serves webhooks on different domain from editor, reducing allow-same-origin risk
