/**
 * Checks whether a string appears to contain HTML content.
 * Used for auto-detecting Content-Type when the response type is "Text".
 */
export function looksLikeHtml(content: string): boolean {
	const trimmed = content.trim().toLowerCase();
	return (
		trimmed.startsWith('<!doctype') ||
		trimmed.startsWith('<html') ||
		trimmed.startsWith('<head') ||
		trimmed.startsWith('<body') ||
		/<[a-z][a-z0-9]*[\s>]/i.test(trimmed.slice(0, 500))
	);
}
