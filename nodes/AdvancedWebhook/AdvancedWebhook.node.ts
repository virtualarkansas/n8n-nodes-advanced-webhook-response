import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class AdvancedWebhook implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Advanced Webhook',
		name: 'advancedWebhook',
		icon: 'file:icons/webhook-trigger.svg',
		group: ['trigger'],
		version: 1,
		description:
			'Webhook trigger that works with the Advanced Respond to Webhook node for full control over HTML responses, iframe sandboxing, and device permissions',
		defaults: {
			name: 'Advanced Webhook',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		webhooks: [
			{
				name: 'default',
				httpMethod: '={{$parameter["httpMethod"]}}',
				responseMode: '={{$parameter["responseMode"]}}',
				path: '={{$parameter["path"]}}',
				isFullPath: true,
			},
		],
		properties: [
			// --- HTTP Method ---
			{
				displayName: 'HTTP Method',
				name: 'httpMethod',
				type: 'options',
				options: [
					{ name: 'DELETE', value: 'DELETE' },
					{ name: 'GET', value: 'GET' },
					{ name: 'HEAD', value: 'HEAD' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
				],
				default: 'GET',
				description: 'The HTTP method to listen for',
			},

			// --- Path ---
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				placeholder: 'e.g. my-webhook',
				required: true,
				description: 'The webhook URL path. The full URL will be shown after saving.',
			},

			// --- Response Mode ---
			{
				displayName: 'Respond',
				name: 'responseMode',
				type: 'options',
				options: [
					{
						name: 'Immediately',
						value: 'onReceived',
						description: 'Respond with a 200 status immediately when the request is received',
					},
					{
						name: 'Using "Advanced Respond to Webhook" Node',
						value: 'responseNode',
						description:
							'Use the Advanced Respond to Webhook node to craft a custom response',
					},
				],
				default: 'responseNode',
				description: 'How to respond to the incoming webhook request',
			},

			// --- Immediate Response Code ---
			{
				displayName: 'Response Code',
				name: 'responseCode',
				type: 'number',
				displayOptions: {
					show: {
						responseMode: ['onReceived'],
					},
				},
				typeOptions: {
					minValue: 100,
					maxValue: 599,
				},
				default: 200,
				description: 'The HTTP response code to return immediately',
			},

			// --- Immediate Response Data ---
			{
				displayName: 'Response Data',
				name: 'responseData',
				type: 'options',
				displayOptions: {
					show: {
						responseMode: ['onReceived'],
					},
				},
				options: [
					{
						name: 'First Entry JSON',
						value: 'firstEntryJson',
						description: 'Respond with the first JSON entry from the input',
					},
					{
						name: 'No Data',
						value: 'noData',
						description: 'Respond with an empty body',
					},
					{
						name: 'Text',
						value: 'text',
						description: 'Respond with a custom text message',
					},
				],
				default: 'noData',
				description: 'What data to include in the immediate response',
			},

			// --- Immediate Response Text ---
			{
				displayName: 'Response Text',
				name: 'responseText',
				type: 'string',
				displayOptions: {
					show: {
						responseMode: ['onReceived'],
						responseData: ['text'],
					},
				},
				default: '',
				placeholder: 'e.g. OK',
				description: 'The text body to return in the immediate response',
			},

			// --- Options ---
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Include Binary Data',
						name: 'binaryData',
						type: 'boolean',
						default: false,
						description: 'Whether to include binary data from file uploads',
					},
					{
						displayName: 'Raw Body',
						name: 'rawBody',
						type: 'boolean',
						default: false,
						description:
							'Whether to include the raw request body as a string in the output',
					},
				],
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const responseMode = this.getNodeParameter('responseMode', 'onReceived') as string;
		const options = this.getNodeParameter('options', {}) as IDataObject;

		// Build output data from the request
		const outputData: IDataObject = {
			headers: req.headers as unknown as IDataObject,
			params: req.params as unknown as IDataObject,
			query: req.query as unknown as IDataObject,
			body: req.body as unknown as IDataObject,
			method: req.method,
			url: req.url,
		};

		// Include raw body if requested
		if (options.rawBody && req.rawBody) {
			outputData.rawBody = (req.rawBody as Buffer).toString('utf-8');
		}

		// Handle binary data if requested
		if (options.binaryData && req.files) {
			// Binary file handling would go here
			// For now, include file metadata in the output
			outputData.files = req.files as unknown as IDataObject;
		}

		// Handle immediate response mode
		if (responseMode === 'onReceived') {
			const responseCode = this.getNodeParameter('responseCode', 200) as number;
			const responseData = this.getNodeParameter('responseData', 'noData') as string;

			let responseBody: string | IDataObject | undefined;

			if (responseData === 'text') {
				responseBody = this.getNodeParameter('responseText', '') as string;
			} else if (responseData === 'firstEntryJson') {
				responseBody = outputData;
			}

			const resp = this.getResponseObject();
			resp.status(responseCode);
			if (responseBody !== undefined) {
				resp.json(responseBody);
			} else {
				resp.end();
			}

			return {
				workflowData: [[{ json: outputData }]],
			};
		}

		// For responseNode mode, return data and let the response node handle it
		// NO hard-coded check for n8n-nodes-base.respondToWebhook here!
		return {
			workflowData: [[{ json: outputData }]],
		};
	}
}
