# Sprint 3: Main Node Implementation

## Goals
- Create the full AdvancedRespondToWebhook node
- Implement all response types
- Implement HTML delivery modes (Direct/Iframe Wrapped)
- Implement streaming support
- Implement all header helpers in Options collection

## Tasks
- [ ] Define INodeTypeDescription with all properties
- [ ] Implement respondWith options: JSON, JWT, Text, HTML, Binary, Redirect, First/All Incoming Items, No Data
- [ ] Implement htmlDeliveryMode (Direct / Iframe Wrapped)
- [ ] Implement iframe sandbox permissions (multiOptions, 13 sandbox values)
- [ ] Implement iframe feature permissions (multiOptions, 15 device/API values)
- [ ] Implement streaming toggle for text, html, json
- [ ] Implement Options collection: response code, response headers, put response in field
- [ ] Implement CORS header helpers with explanations
- [ ] Implement security header helpers with explanations
- [ ] Implement cookie helpers with explanations
- [ ] Implement execute() method with header layering logic
- [ ] Create node.json codex metadata
- [ ] Create SVG icon

## Definition of Done
- `npm run build` succeeds
- `npm run lint` passes (or has only minor warnings)
- Node is ready for local testing in n8n
