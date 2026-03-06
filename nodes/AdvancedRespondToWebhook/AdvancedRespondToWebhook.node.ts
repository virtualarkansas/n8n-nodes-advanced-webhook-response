import { Readable } from 'stream';
import type {
	IDataObject,
	IExecuteFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import {
	jsonParse,
	NodeConnectionTypes,
	NodeOperationError,
	WEBHOOK_NODE_TYPE,
	FORM_TRIGGER_NODE_TYPE,
	WAIT_NODE_TYPE,
	CHAT_TRIGGER_NODE_TYPE,
} from 'n8n-workflow';
import * as jwt from 'jsonwebtoken';

import { wrapInIframe } from './utils/iframeWrapper';
import { buildCorsHeaders, buildSecurityHeaders, buildCookieHeaders } from './utils/headerBuilders';
import { looksLikeHtml } from './utils/htmlDetection';

const ALLOWED_WEBHOOK_NODE_TYPES = [
	WEBHOOK_NODE_TYPE,
	FORM_TRIGGER_NODE_TYPE,
	WAIT_NODE_TYPE,
	CHAT_TRIGGER_NODE_TYPE,
];

export class AdvancedRespondToWebhook implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Advanced Respond to Webhook',
		name: 'advancedRespondToWebhook',
		icon: 'file:icons/webhook-response.svg',
		group: ['transform'],
		version: 1,
		description: 'Advanced webhook response with iframe wrapping, sandbox/device permissions, CORS, security headers, and cookie helpers',
		defaults: {
			name: 'Advanced Respond to Webhook',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'jwtAuth',
				required: true,
				displayOptions: {
					show: {
						respondWith: ['jwt'],
					},
				},
			},
		],
		properties: [
			// --- Notice ---
			{
				displayName:
					'Verify that the "Webhook" node\'s "Respond" parameter is set to "Using \'Respond to Webhook\' Node". <a href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/" target="_blank">More details</a>',
				name: 'generalNotice',
				type: 'notice',
				default: '',
			},

			// --- Respond With ---
			{
				displayName: 'Respond With',
				name: 'respondWith',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'All Incoming Items',
						value: 'allIncomingItems',
						description: 'Respond with all input JSON items',
					},
					{
						name: 'Binary File',
						value: 'binary',
						description: 'Respond with incoming file binary data',
					},
					{
						name: 'First Incoming Item',
						value: 'firstIncomingItem',
						description: 'Respond with the first input JSON item',
					},
					{
						name: 'HTML',
						value: 'html',
						description: 'Respond with HTML content (auto-sets Content-Type to text/html)',
					},
					{
						name: 'JSON',
						value: 'json',
						description: 'Respond with a custom JSON body',
					},
					{
						name: 'JWT Token',
						value: 'jwt',
						description: 'Respond with a JWT token',
					},
					{
						name: 'No Data',
						value: 'noData',
						description: 'Respond with an empty body',
					},
					{
						name: 'Redirect',
						value: 'redirect',
						description: 'Respond with a redirect to a given URL',
					},
					{
						name: 'Text',
						value: 'text',
						description: 'Respond with a simple text message body',
					},
				],
				default: 'firstIncomingItem',
				description: 'The data that should be returned',
			},

			// --- Expression notice ---
			{
				displayName:
					'When using expressions, note that this node will only run for the first item in the input data',
				name: 'webhookNotice',
				type: 'notice',
				displayOptions: {
					show: {
						respondWith: ['json', 'text', 'html', 'jwt'],
					},
				},
				default: '',
			},

			// --- Redirect URL ---
			{
				displayName: 'Redirect URL',
				name: 'redirectURL',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						respondWith: ['redirect'],
					},
				},
				default: '',
				placeholder: 'e.g. https://www.example.com',
				description: 'The URL to redirect to',
				validateType: 'url',
			},

			// --- JSON Response Body ---
			{
				displayName: 'Response Body',
				name: 'responseBody',
				type: 'json',
				displayOptions: {
					show: {
						respondWith: ['json'],
					},
				},
				default: '{\n  "myField": "value"\n}',
				typeOptions: {
					rows: 4,
				},
				description: 'The HTTP response JSON data',
			},

			// --- JWT Payload ---
			{
				displayName: 'Payload',
				name: 'payload',
				type: 'json',
				displayOptions: {
					show: {
						respondWith: ['jwt'],
					},
				},
				default: '{\n  "myField": "value"\n}',
				typeOptions: {
					rows: 4,
				},
				validateType: 'object',
				description: 'The payload to include in the JWT token',
			},

			// --- Text Response Body ---
			{
				displayName: 'Response Body',
				name: 'responseBody',
				type: 'string',
				displayOptions: {
					show: {
						respondWith: ['text'],
					},
				},
				typeOptions: {
					rows: 2,
				},
				default: '',
				placeholder: 'e.g. Workflow completed',
				description: 'The HTTP response text data',
			},

			// --- HTML Content (code editor) ---
			{
				displayName: 'HTML Content',
				name: 'htmlBody',
				type: 'string',
				displayOptions: {
					show: {
						respondWith: ['html'],
					},
				},
				typeOptions: {
					editor: 'htmlEditor',
					rows: 10,
				},
				default:
					'<!DOCTYPE html>\n<html>\n<head>\n  <title>Response</title>\n</head>\n<body>\n  <h1>Hello from n8n!</h1>\n</body>\n</html>',
				description: 'The HTML content to return. Content-Type will be automatically set to text/html.',
			},

			// --- Binary response data source ---
			{
				displayName: 'Response Data Source',
				name: 'responseDataSource',
				type: 'options',
				displayOptions: {
					show: {
						respondWith: ['binary'],
					},
				},
				options: [
					{
						name: 'Choose Automatically From Input',
						value: 'automatically',
						description:
							'Use if input data will contain a single piece of binary data',
					},
					{
						name: 'Specify Myself',
						value: 'set',
						description:
							'Enter the name of the input field the binary data will be in',
					},
				],
				default: 'automatically',
			},

			// --- Binary input field name ---
			{
				displayName: 'Input Field Name',
				name: 'inputFieldName',
				type: 'string',
				required: true,
				default: 'data',
				displayOptions: {
					show: {
						respondWith: ['binary'],
						responseDataSource: ['set'],
					},
				},
				description: 'The name of the node input field with the binary data',
			},

			// --- Content-Type notice for Text ---
			{
				displayName:
					'To serve HTML with full control, use the "HTML" response type instead. If using "Text", add a "Content-Type" header manually or enable iframe wrapping below.',
				name: 'contentTypeNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						respondWith: ['text'],
					},
				},
			},

			// --- HTML Delivery Mode ---
			{
				displayName: 'HTML Delivery Mode',
				name: 'htmlDeliveryMode',
				type: 'options',
				displayOptions: {
					show: {
						respondWith: ['html', 'text'],
					},
				},
				options: [
					{
						name: 'Direct',
						value: 'direct',
						description:
							'Send HTML as-is (subject to n8n server CSP unless N8N_INSECURE_DISABLE_WEBHOOK_IFRAME_SANDBOX=true)',
					},
					{
						name: 'Iframe Wrapped',
						value: 'iframeWrapped',
						description:
							'Wrap HTML in a configurable iframe with per-node sandbox and permission controls',
					},
				],
				default: 'direct',
				description:
					'How to deliver HTML content. "Iframe Wrapped" gives per-node control over sandbox permissions and device API access without server config changes.',
			},

			// --- Iframe notice ---
			{
				displayName:
					'Iframe Wrapped mode wraps your HTML inside an iframe with configurable sandbox and feature permissions. This bypasses n8n\'s server-level CSP sandbox restriction, giving you per-node control over device APIs (camera, microphone, etc.) without setting N8N_INSECURE_DISABLE_WEBHOOK_IFRAME_SANDBOX.',
				name: 'iframeNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						respondWith: ['html', 'text'],
						htmlDeliveryMode: ['iframeWrapped'],
					},
				},
			},

			// --- Iframe Sandbox Permissions ---
			{
				displayName: 'Iframe Sandbox Permissions',
				name: 'iframeSandboxPermissions',
				type: 'multiOptions',
				displayOptions: {
					show: {
						respondWith: ['html', 'text'],
						htmlDeliveryMode: ['iframeWrapped'],
					},
				},
				options: [
					{ name: 'allow-downloads', value: 'allow-downloads' },
					{ name: 'allow-forms', value: 'allow-forms' },
					{ name: 'allow-modals', value: 'allow-modals' },
					{ name: 'allow-orientation-lock', value: 'allow-orientation-lock' },
					{ name: 'allow-pointer-lock', value: 'allow-pointer-lock' },
					{ name: 'allow-popups', value: 'allow-popups' },
					{
						name: 'allow-popups-to-escape-sandbox',
						value: 'allow-popups-to-escape-sandbox',
					},
					{ name: 'allow-presentation', value: 'allow-presentation' },
					{ name: 'allow-same-origin', value: 'allow-same-origin' },
					{ name: 'allow-scripts', value: 'allow-scripts' },
					{ name: 'allow-top-navigation', value: 'allow-top-navigation' },
					{
						name: 'allow-top-navigation-by-user-activation',
						value: 'allow-top-navigation-by-user-activation',
					},
					{
						name: 'allow-top-navigation-to-custom-protocols',
						value: 'allow-top-navigation-to-custom-protocols',
					},
				],
				default: ['allow-scripts', 'allow-forms'],
				description:
					'Sandbox attribute values for the iframe. Controls what the embedded content is allowed to do.',
			},

			// --- Iframe Feature Permissions ---
			{
				displayName: 'Iframe Feature Permissions',
				name: 'iframeFeaturePermissions',
				type: 'multiOptions',
				displayOptions: {
					show: {
						respondWith: ['html', 'text'],
						htmlDeliveryMode: ['iframeWrapped'],
					},
				},
				options: [
					{ name: 'Accelerometer', value: 'accelerometer' },
					{ name: 'Autoplay', value: 'autoplay' },
					{ name: 'Camera', value: 'camera' },
					{ name: 'Clipboard Read', value: 'clipboard-read' },
					{ name: 'Clipboard Write', value: 'clipboard-write' },
					{ name: 'Display Capture', value: 'display-capture' },
					{ name: 'Encrypted Media', value: 'encrypted-media' },
					{ name: 'Fullscreen', value: 'fullscreen' },
					{ name: 'Geolocation', value: 'geolocation' },
					{ name: 'Gyroscope', value: 'gyroscope' },
					{ name: 'Magnetometer', value: 'magnetometer' },
					{ name: 'Microphone', value: 'microphone' },
					{ name: 'Payment', value: 'payment' },
					{ name: 'Picture-in-Picture', value: 'picture-in-picture' },
					{ name: 'Web Share', value: 'web-share' },
				],
				default: [],
				description:
					'Feature permissions (allow attribute) for the iframe. Enables access to device APIs like camera and microphone within the sandboxed content.',
			},

			// --- Enable Streaming ---
			{
				displayName: 'Enable Streaming',
				name: 'enableStreaming',
				type: 'boolean',
				displayOptions: {
					show: {
						respondWith: ['text', 'html', 'json'],
					},
				},
				default: false,
				description: 'Whether to stream the response body instead of sending it all at once',
			},

			// --- Options Collection ---
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					// Response Code
					{
						displayName: 'Response Code',
						name: 'responseCode',
						type: 'number',
						typeOptions: {
							minValue: 100,
							maxValue: 599,
						},
						default: 200,
						description: 'The HTTP response code to return. Defaults to 200.',
					},

					// Response Headers
					{
						displayName: 'Response Headers',
						name: 'responseHeaders',
						placeholder: 'Add Response Header',
						description:
							'Add custom headers to the webhook response. These override any auto-generated headers.',
						type: 'fixedCollection',
						typeOptions: {
							multipleValues: true,
						},
						default: {},
						options: [
							{
								name: 'entries',
								displayName: 'Entries',
								values: [
									{
										displayName: 'Name',
										name: 'name',
										type: 'string',
										default: '',
										description: 'Name of the header',
									},
									{
										displayName: 'Value',
										name: 'value',
										type: 'string',
										default: '',
										description: 'Value of the header',
									},
								],
							},
						],
					},

					// Put Response in Field
					{
						displayName: 'Put Response in Field',
						name: 'responseKey',
						type: 'string',
						displayOptions: {
							show: {
								'/respondWith': ['allIncomingItems', 'firstIncomingItem'],
							},
						},
						default: '',
						description: 'The name of the response field to put all items in',
						placeholder: 'e.g. data',
					},

					// --- CORS Helpers ---
					{
						displayName: 'CORS: Access-Control-Allow-Origin',
						name: 'corsAllowOrigin',
						type: 'string',
						default: '',
						placeholder: 'e.g. * or https://example.com',
						description:
							'Which domains can access this webhook response via JavaScript. Use * for any domain. Leave empty to not set.',
					},
					{
						displayName: 'CORS: Access-Control-Allow-Methods',
						name: 'corsAllowMethods',
						type: 'string',
						default: '',
						placeholder: 'e.g. GET, POST, PUT, DELETE',
						description:
							'Which HTTP methods are allowed for cross-origin requests. Leave empty to not set.',
					},
					{
						displayName: 'CORS: Access-Control-Allow-Headers',
						name: 'corsAllowHeaders',
						type: 'string',
						default: '',
						placeholder: 'e.g. Content-Type, Authorization',
						description:
							'Which custom headers the browser is allowed to send in cross-origin requests. Leave empty to not set.',
					},
					{
						displayName: 'CORS: Access-Control-Allow-Credentials',
						name: 'corsAllowCredentials',
						type: 'boolean',
						default: false,
						description:
							'Whether the browser should include cookies/auth with cross-origin requests. Only takes effect when Allow-Origin is set.',
					},
					{
						displayName: 'CORS: Access-Control-Max-Age',
						name: 'corsMaxAge',
						type: 'number',
						default: 0,
						placeholder: 'e.g. 3600',
						description:
							'How long (in seconds) browsers can cache the CORS preflight response. 0 means do not set.',
						typeOptions: {
							minValue: 0,
						},
					},

					// --- Security Headers ---
					{
						displayName: 'Security: X-Content-Type-Options',
						name: 'securityNoSniff',
						type: 'boolean',
						default: false,
						description:
							'Whether to set X-Content-Type-Options: nosniff. Prevents browsers from guessing the content type. Recommended for security.',
					},
					{
						displayName: 'Security: X-Frame-Options',
						name: 'securityXFrameOptions',
						type: 'options',
						options: [
							{
								name: 'Not Set',
								value: '',
								description: 'Do not add this header',
							},
							{
								name: 'DENY',
								value: 'DENY',
								description: 'Blocks all iframe embedding',
							},
							{
								name: 'SAMEORIGIN',
								value: 'SAMEORIGIN',
								description: 'Allows embedding only from same domain',
							},
						],
						default: '',
						description:
							'Controls whether this page can be embedded in iframes on other sites. DENY blocks all, SAMEORIGIN allows same domain only.',
					},
					{
						displayName: 'Security: Strict-Transport-Security',
						name: 'securityHSTS',
						type: 'string',
						default: '',
						placeholder: 'e.g. max-age=31536000; includeSubDomains',
						description:
							'Tells browsers to only access this URL over HTTPS. Set max-age in seconds. Leave empty to not set.',
					},

					// --- Cookie Helpers ---
					{
						displayName: 'Set-Cookie',
						name: 'cookies',
						placeholder: 'Add Cookie',
						description: 'Cookies to set in the response via Set-Cookie headers',
						type: 'fixedCollection',
						typeOptions: {
							multipleValues: true,
						},
						default: {},
						options: [
							{
								name: 'entries',
								displayName: 'Cookie',
								values: [
									{
										displayName: 'Name',
										name: 'name',
										type: 'string',
										default: '',
										description: 'Cookie name',
									},
									{
										displayName: 'Value',
										name: 'value',
										type: 'string',
										default: '',
										description: 'Cookie value',
									},
									{
										displayName: 'Path',
										name: 'path',
										type: 'string',
										default: '/',
										description: 'Cookie path scope',
									},
									{
										displayName: 'Domain',
										name: 'domain',
										type: 'string',
										default: '',
										description:
											'Cookie domain scope. Leave empty for current domain.',
									},
									{
										displayName: 'Max-Age (Seconds)',
										name: 'maxAge',
										type: 'number',
										default: 0,
										description:
											'Cookie lifetime in seconds. 0 means session cookie (expires when browser closes).',
										typeOptions: {
											minValue: 0,
										},
									},
									{
										displayName: 'HttpOnly',
										name: 'httpOnly',
										type: 'boolean',
										default: false,
										description:
											'Whether to prevent JavaScript from reading this cookie. Recommended for session cookies.',
									},
									{
										displayName: 'Secure',
										name: 'secure',
										type: 'boolean',
										default: false,
										description:
											'Whether the cookie should only be sent over HTTPS connections',
									},
									{
										displayName: 'SameSite',
										name: 'sameSite',
										type: 'options',
										options: [
											{
												name: 'Not Set',
												value: '',
												description: 'Use browser default',
											},
											{
												name: 'Strict',
												value: 'Strict',
												description:
													'Cookie only sent for same-site requests',
											},
											{
												name: 'Lax',
												value: 'Lax',
												description:
													'Cookie sent for same-site and top-level cross-site navigation',
											},
											{
												name: 'None',
												value: 'None',
												description:
													'Cookie always sent (requires Secure flag)',
											},
										],
										default: '',
										description:
											'Controls when cookies are sent with cross-site requests. Strict = same site only, Lax = allows top-level navigation, None = always sent.',
									},
								],
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// Validate that an upstream webhook node exists
		const connectedNodes = this.getParentNodes(this.getNode().name);
		const hasWebhookNode = connectedNodes.some(({ type }) =>
			ALLOWED_WEBHOOK_NODE_TYPES.includes(type),
		);
		if (!hasWebhookNode) {
			throw new NodeOperationError(
				this.getNode(),
				new Error('No Webhook, Form Trigger, Chat Trigger, or Wait node found in the workflow'),
				{
					description:
						'Insert a Webhook node and set "Respond" to "Using \'Respond to Webhook\' Node"',
				},
			);
		}

		const respondWith = this.getNodeParameter('respondWith', 0) as string;
		const options = this.getNodeParameter('options', 0, {}) as IDataObject;

		try {
			// --- Build headers (layered) ---
			const headers: IDataObject = {};

			// Layer 1: Auto-detected Content-Type
			if (respondWith === 'html') {
				headers['content-type'] = 'text/html; charset=utf-8';
			}

			// Layer 2: Helper-generated headers
			const corsHeaders = buildCorsHeaders(options);
			Object.assign(headers, corsHeaders);

			const securityHeaders = buildSecurityHeaders(options);
			Object.assign(headers, securityHeaders);

			// Layer 2b: Cookie headers
			const cookieData = options.cookies as IDataObject | undefined;
			if (cookieData?.entries) {
				const cookieEntries = cookieData.entries as IDataObject[];
				if (cookieEntries.length > 0) {
					const cookieStrings = buildCookieHeaders(cookieEntries);
					if (cookieStrings.length === 1) {
						headers['set-cookie'] = cookieStrings[0];
					} else if (cookieStrings.length > 1) {
						headers['set-cookie'] = cookieStrings as unknown as IDataObject;
					}
				}
			}

			// Layer 3: User custom response headers (override everything)
			const customHeaders = options.responseHeaders as IDataObject | undefined;
			if (customHeaders?.entries) {
				for (const entry of customHeaders.entries as IDataObject[]) {
					if (entry.name && entry.value !== undefined) {
						headers[String(entry.name).toLowerCase()] = String(entry.value);
					}
				}
			}

			// --- Status code ---
			let statusCode = (options.responseCode as number) || 200;

			// --- Build response body ---
			let responseBody: string | IDataObject | IDataObject[] | Buffer | Readable | undefined;

			if (respondWith === 'html') {
				let htmlContent = this.getNodeParameter('htmlBody', 0) as string;
				const deliveryMode = this.getNodeParameter('htmlDeliveryMode', 0, 'direct') as string;

				if (deliveryMode === 'iframeWrapped') {
					const sandboxPerms = this.getNodeParameter(
						'iframeSandboxPermissions',
						0,
						[],
					) as string[];
					const featurePerms = this.getNodeParameter(
						'iframeFeaturePermissions',
						0,
						[],
					) as string[];
					htmlContent = wrapInIframe(htmlContent, sandboxPerms, featurePerms);
				}

				responseBody = htmlContent;

			} else if (respondWith === 'text') {
				let textContent = this.getNodeParameter('responseBody', 0) as string;
				const deliveryMode = this.getNodeParameter('htmlDeliveryMode', 0, 'direct') as string;

				if (deliveryMode === 'iframeWrapped') {
					headers['content-type'] = 'text/html; charset=utf-8';
					const sandboxPerms = this.getNodeParameter(
						'iframeSandboxPermissions',
						0,
						[],
					) as string[];
					const featurePerms = this.getNodeParameter(
						'iframeFeaturePermissions',
						0,
						[],
					) as string[];
					textContent = wrapInIframe(textContent, sandboxPerms, featurePerms);
				} else if (looksLikeHtml(textContent) && !headers['content-type']) {
					headers['content-type'] = 'text/html; charset=utf-8';
				}

				responseBody = textContent;

			} else if (respondWith === 'json') {
				const responseBodyParam = this.getNodeParameter('responseBody', 0) as string;
				if (responseBodyParam) {
					if (typeof responseBodyParam === 'object') {
						responseBody = responseBodyParam as IDataObject;
					} else {
						try {
							responseBody = jsonParse(responseBodyParam);
						} catch (error) {
							throw new NodeOperationError(this.getNode(), error as Error, {
								message: "Invalid JSON in 'Response Body' field",
							});
						}
					}
				}

			} else if (respondWith === 'jwt') {
				const credentials = (await this.getCredentials('jwtAuth')) as {
					keyType: string;
					secret: string;
					algorithm: string;
					privateKey: string;
				};
				const secretOrKey =
					credentials.keyType === 'passphrase'
						? credentials.secret
						: credentials.privateKey;
				const payloadParam = this.getNodeParameter('payload', 0, '{}') as string;
				let payload: object;
				try {
					payload = jsonParse(payloadParam);
				} catch (error) {
					throw new NodeOperationError(this.getNode(), error as Error, {
						message: "Invalid JSON in 'Payload' field",
					});
				}
				const token = jwt.sign(payload, secretOrKey, {
					algorithm: credentials.algorithm as jwt.Algorithm,
				});
				responseBody = { token };

			} else if (respondWith === 'allIncomingItems') {
				const respondItems = items.map((item) => item.json);
				if (options.responseKey) {
					const wrapper: IDataObject = {};
					wrapper[String(options.responseKey)] = respondItems as unknown as IDataObject;
					responseBody = wrapper;
				} else {
					responseBody = respondItems;
				}

			} else if (respondWith === 'firstIncomingItem') {
				if (options.responseKey) {
					const wrapper: IDataObject = {};
					wrapper[String(options.responseKey)] = items[0].json;
					responseBody = wrapper;
				} else {
					responseBody = items[0].json;
				}

			} else if (respondWith === 'binary') {
				const item = items[0];
				if (!item.binary) {
					throw new NodeOperationError(
						this.getNode(),
						'No binary data exists on the first item!',
					);
				}

				const responseDataSource = this.getNodeParameter(
					'responseDataSource',
					0,
				) as string;
				let binaryPropertyName: string;

				if (responseDataSource === 'set') {
					binaryPropertyName = this.getNodeParameter('inputFieldName', 0) as string;
				} else {
					const binaryKeys = Object.keys(item.binary);
					if (binaryKeys.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'No binary data exists on the first item!',
						);
					}
					binaryPropertyName = binaryKeys[0];
				}

				const binaryData = this.helpers.assertBinaryData(0, binaryPropertyName);

				if (binaryData.mimeType) {
					headers['content-type'] = binaryData.mimeType;
				}

				if (binaryData.id) {
					const stream = await this.helpers.getBinaryStream(binaryData.id);
					const response: IN8nHttpFullResponse = {
						body: stream,
						headers,
						statusCode,
					};
					this.sendResponse(response);
					return [items];
				}

				responseBody = Buffer.from(binaryData.data, 'base64');

			} else if (respondWith === 'redirect') {
				headers.location = this.getNodeParameter('redirectURL', 0) as string;
				statusCode = (options.responseCode as number) ?? 307;
				responseBody = undefined;

			} else if (respondWith === 'noData') {
				responseBody = undefined;
			}

			// --- Handle streaming ---
			const enableStreaming = this.getNodeParameter('enableStreaming', 0, false) as boolean;
			if (enableStreaming && typeof responseBody === 'string') {
				const stream = Readable.from(Buffer.from(responseBody, 'utf-8'));
				const response: IN8nHttpFullResponse = {
					body: stream,
					headers,
					statusCode,
				};
				this.sendResponse(response);
				return [items];
			}

			// --- Send response ---
			const response: IN8nHttpFullResponse = {
				body: responseBody as IN8nHttpFullResponse['body'],
				headers,
				statusCode,
			};
			this.sendResponse(response);

		} catch (error) {
			if (this.continueOnFail()) {
				return [
					[
						{
							json: {
								error: (error as Error).message,
							},
						},
					],
				];
			}
			throw error;
		}

		return [items];
	}
}
