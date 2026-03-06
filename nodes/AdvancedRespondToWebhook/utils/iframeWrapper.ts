/**
 * Escapes HTML content for use in an iframe srcdoc attribute.
 * The srcdoc attribute requires & and " to be escaped as HTML entities.
 */
export function escapeForSrcdoc(html: string): string {
	return html
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;');
}

/**
 * Wraps user HTML content in a full-viewport iframe with configurable
 * sandbox and feature permissions.
 *
 * This allows per-node control over sandbox restrictions and device API
 * access (microphone, camera, gyroscope, etc.) without requiring
 * server-level environment variable changes.
 */
export function wrapInIframe(
	userHtml: string,
	sandboxPermissions: string[],
	featurePermissions: string[],
): string {
	const escapedHtml = escapeForSrcdoc(userHtml);

	const sandboxAttr = sandboxPermissions.length > 0
		? ` sandbox="${sandboxPermissions.join(' ')}"`
		: ' sandbox=""';

	const allowAttr = featurePermissions.length > 0
		? ` allow="${featurePermissions.join('; ')}"`
		: '';

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:100vw;height:100vh;overflow:hidden}
iframe{width:100%;height:100%;border:none}
</style>
</head>
<body>
<iframe srcdoc="${escapedHtml}"${sandboxAttr}${allowAttr}></iframe>
</body>
</html>`;
}
