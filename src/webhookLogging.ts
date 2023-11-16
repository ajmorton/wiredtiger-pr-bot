// General logging when relevant hooks are received.

import {type App} from 'octokit';
import {type PullRequestEvent, type Schema} from '@octokit/webhooks-types';
import {slackMessageError} from './notifySlack';

export function registerHooksLogging(app: App) {
	app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
		logPullRequestEvent(payload);
	});

	app.webhooks.on('pull_request.edited', async ({octokit, payload}) => {
		logPullRequestEvent(payload);
	});

	app.webhooks.on('pull_request.synchronize', async ({octokit, payload}) => {
		logPullRequestEvent(payload);
	});
}

// Console log that a pull request even has occurred
function logPullRequestEvent(payload: PullRequestEvent) {
	const prNum = payload.pull_request.number;
	const prTitle = payload.pull_request.title;
	console.log(`Pull request ${payload.action} event for #${prNum}: ${prTitle}`);
}

// Helper function. When we catch an error in any of our hooks call this
// to provide a summary to the Slack debug channel.
export function reportWebhookError(error: any, payload: Schema, webhook: string) {
	const errMessage = `Unexpected error when handling \`${webhook}\` event!`;
	const errContext =
		'Stack trace: \n=================\n' + (error.stack as string) +
		'\n\nError:   \n=================\n' + JSON.stringify(error, null, 2) +
		'\n\nPayload: \n=================\n' + JSON.stringify(payload, null, 2);

	slackMessageError(errMessage, errContext);
}
