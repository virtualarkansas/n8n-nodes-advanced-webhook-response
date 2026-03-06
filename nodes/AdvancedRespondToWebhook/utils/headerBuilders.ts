import type { IDataObject } from 'n8n-workflow';

/**
 * Builds CORS headers from the Options collection values.
 */
export function buildCorsHeaders(options: IDataObject): Record<string, string> {
	const headers: Record<string, string> = {};

	if (options.corsAllowOrigin) {
		headers['access-control-allow-origin'] = String(options.corsAllowOrigin);
	}
	if (options.corsAllowMethods) {
		headers['access-control-allow-methods'] = String(options.corsAllowMethods);
	}
	if (options.corsAllowHeaders) {
		headers['access-control-allow-headers'] = String(options.corsAllowHeaders);
	}
	if (options.corsAllowCredentials) {
		headers['access-control-allow-credentials'] = 'true';
	}
	if (options.corsMaxAge && Number(options.corsMaxAge) > 0) {
		headers['access-control-max-age'] = String(options.corsMaxAge);
	}

	return headers;
}

/**
 * Builds security headers from the Options collection values.
 */
export function buildSecurityHeaders(options: IDataObject): Record<string, string> {
	const headers: Record<string, string> = {};

	if (options.securityNoSniff) {
		headers['x-content-type-options'] = 'nosniff';
	}
	if (options.securityXFrameOptions) {
		headers['x-frame-options'] = String(options.securityXFrameOptions);
	}
	if (options.securityHSTS) {
		headers['strict-transport-security'] = String(options.securityHSTS);
	}

	return headers;
}

/**
 * Builds Set-Cookie header value(s) from the cookie collection.
 * Returns an array of Set-Cookie strings (one per cookie).
 */
export function buildCookieHeaders(cookies: IDataObject[]): string[] {
	return cookies.map((cookie) => {
		let str = `${String(cookie.name)}=${String(cookie.value)}`;

		if (cookie.path) {
			str += `; Path=${String(cookie.path)}`;
		}
		if (cookie.domain) {
			str += `; Domain=${String(cookie.domain)}`;
		}
		if (cookie.maxAge && Number(cookie.maxAge) > 0) {
			str += `; Max-Age=${String(cookie.maxAge)}`;
		}
		if (cookie.httpOnly) {
			str += '; HttpOnly';
		}
		if (cookie.secure) {
			str += '; Secure';
		}
		if (cookie.sameSite) {
			str += `; SameSite=${String(cookie.sameSite)}`;
		}

		return str;
	});
}
