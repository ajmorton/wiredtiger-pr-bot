// General logging when relevant hooks are received.

import {type App} from 'octokit';
import {type Schema} from '@octokit/webhooks-types';
import {slackMessageError} from './notifySlack';

export function registerHooksLogging(app: App) {
	app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
		console.log(`Pull request open event for #${payload.pull_request.number}`);
	});

	app.webhooks.on('pull_request.edited', async ({octokit, payload}) => {
		console.log(`Pull request edited event for #${payload.pull_request.number}`);
	});

	app.webhooks.on('pull_request.synchronize', async ({octokit, payload}) => {
		console.log(`Pull request sync event for #${payload.pull_request.number}`);
	});
}

// Helper function. When we catch an error in any of our hooks call this
// to provide a summary to the Slack debug channel.
export function reportWebhookError(error: unknown, payload: Schema) {
	slackMessageError(
		'Unexpected error when handling `pull_request.opened` event!\n' +
		'Error and payload:\n',
		'Error:  \n=================\n' + JSON.stringify(error, null, 2) + '\n\n\n' +
		'Payload:\n=================\n' + JSON.stringify(payload, null, 2));
}
