// Send messages to Slack channels. Depending on the message they will
// be sent to different webhooks:
// - Notifications are sent to the NOTIFY webhook, intended as informational
//   messages for the whole team.
// - Errors and Warnings are sent to the DEBUG webhook. These are messages
//   about the Github Apps operation, for example when processing an event fails

import {existsSync, writeFileSync} from 'fs';

export function slackMessageNotification(message: string) {
	const blue = '#2589CF';
	sendSlackMessage(message, blue, process.env['SLACK_WEBHOOK_NOTIFY']!);
}

export function slackMessageError(message: string, stack_trace?: string) {
	const red = '#9A2925';
	sendSlackMessage(message, red, process.env['SLACK_WEBHOOK_DEBUG']!, stack_trace);
}

export function slackMessageWarning(message: string, stack_trace?: string) {
	const yellow = '#DEB109';
	sendSlackMessage(message, yellow, process.env['SLACK_WEBHOOK_DEBUG']!, stack_trace);
}

type SlackBlock = {type: string; text: {type: string; text: string}};
type SlackMessageFormatted = {
	attachments: [{
		color: string;
		blocks: SlackBlock[];
	}];
};

// Wrapping for a text message to make slack happy. This adds a coloured bar on
// the left hand side of the message.
// If stacks traces are provided add them in a second collapsible block
function wrapMessageInBlock(message: string, color: string, stack_trace?: string): SlackMessageFormatted {
	let blocks: SlackBlock[];
	if (stack_trace) {
		blocks = [
			{type: 'section', text: {type: 'mrkdwn', text: message}},
			{type: 'section', text: {type: 'mrkdwn', text: '```' + stack_trace + '```'}},
		];
	} else {
		blocks = [{type: 'section', text: {type: 'mrkdwn', text: message}}];
	}

	return {attachments: [{color, blocks}]};
}

// Get the name for a file to save stack traces to. Use the current date and time.
// If the file already exists create a new one with a -2.txt, -3.txt format.
function getLogFileName(): string {
	const date = new Date();
	const traceFolder = './traces/';
	// YYYY-mm-dd_hh-mm-ss
	const dateTimeStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}_` +
		`${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
	const fileName = traceFolder + dateTimeStr + '.txt';

	if (! existsSync(fileName)) {
		return fileName;
	}

	// Otherwise add -N.txt suffix
	for (let i = 2; ; i++) {
		const numberedFileName = traceFolder + dateTimeStr + `-${i}.txt`;
		if (! existsSync(numberedFileName)) {
			return numberedFileName;
		}
	}
}

// Send a slack message to the specified webhook. Add a coloured bar on the side of the message.
function sendSlackMessage(message: string, color: string, slackWebhook: string, stack_trace?: string) {
	// Send the message to the slack webhook

	// Slack allows up to 3000 characters in a block.
	// If we're close to hitting this save to file
	if (stack_trace && stack_trace.length > 2950) {
		const fileName = getLogFileName();
		// FIXME - We never clean up these files.
		// It'll be a *long* time before that's an issue, but still.
		writeFileSync(fileName, stack_trace);
		stack_trace = 'Message exceeds 3000 characters. ' +
			`Truncating and saving full trace to ${fileName}\n\n` +
			stack_trace.slice(0, 2800);
		// 2800 to allow a buffer for our truncate message.
	}

	const slackMessage = wrapMessageInBlock(message, color, stack_trace);
	const slackMessageString = JSON.stringify(slackMessage);

	if (process.env['DRY_RUN'] === 'true') {
		console.log(`Dry run: Sending slack message:\n${slackMessageString}\n`);
	} else {
		const slackMessage = wrapMessageInBlock(message, color, stack_trace);
		const slackMessageString = JSON.stringify(slackMessage);
		void fetch(slackWebhook, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: slackMessageString,
		});
	}
}
