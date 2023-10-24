// Send messages to Slack channels. Depending on the message they will
// be sent to different webhooks:
// - Notifications are sent to the NOTIFY webhook, intended as informational
//   messages for the whole team.
// - Errors and Warnings are sent to the DEBUG webhook. These are messages
//   about the Github Apps operation, for example when processing an event fails

export function slackMessageNotification(message: string) {
	const blue = '#2589CF';
	sendSlackMessage(message, blue, process.env['SLACK_WEBHOOK_NOTIFY']!);
}

export function slackMessageError(message: string) {
	const red = '#9A2925';
	sendSlackMessage(message, red, process.env['SLACK_WEBHOOK_DEBUG']!);
}

export function slackMessageWarning(message: string) {
	const yellow = '#DEB109';
	sendSlackMessage(message, yellow, process.env['SLACK_WEBHOOK_DEBUG']!);
}

type SlackBlock = {type: 'section'; text: {type: 'mrkdwn'; text: string}};
type SlackMessageFormatted = {
	attachments: [{
		color: string;
		blocks: SlackBlock[];
	}];
};

// Wrapping for a text message to make slack happy. This adds a coloured bar on
// the left hand side of the message
function wrapMessageInBlock(message: string, color: string): SlackMessageFormatted {
	return {
		attachments: [{
			color,
			blocks: [{type: 'section', text: {type: 'mrkdwn', text: message}}],
		}],
	};
}

// Send a slack message to the specified webhook. Add a coloured bar on the side of the message.
function sendSlackMessage(message: string, color: string, slackWebhook: string) {
	// Send the message to the slack webhook
	if (process.env['DRY_RUN'] === 'true') {
		console.log(`Dry run: Sending slack message:\n${message}`);
	} else {
		const slackMessage = wrapMessageInBlock(message, color);
		const slackMessageString = JSON.stringify(slackMessage);
		void fetch(slackWebhook, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: slackMessageString,
		});
	}
}
