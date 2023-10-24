import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import {Octokit, App} from 'octokit';
import {createNodeMiddleware} from '@octokit/webhooks';

import {registerHooksLogging} from './src/print_webhooks.ts';
import {registerPrTitleCheckHooks} from './src/pr_title_check.ts';
import {registerExternalContributorCheckHooks} from './src/external_contributor_check.ts';
import {registerAssignDevelopersHooks} from './src/assign_developers.ts';

// Load environment variables from .env file
dotenv.config();

// Set configured values
const appId = process.env['APP_ID']!;
const privateKeyPath = process.env['PRIVATE_KEY_PATH']!;
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const secret = process.env['WEBHOOK_SECRET']!;
const enterpriseHostname = process.env['ENTERPRISE_HOSTNAME']!;

if (process.env['DRY_RUN']) {
	console.log('=====================');
	console.log(' Running in dry mode ');
	console.log('=====================');
}

// Create an authenticated Octokit client authenticated as a GitHub App
const app = new App({
	appId,
	privateKey,
	webhooks: {
		secret,
	},
	...(enterpriseHostname && {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		Octokit: Octokit.defaults({
			baseUrl: `https://${enterpriseHostname}/api/v3`,
		}),
	}),
});

// /////////////////////////////// //
// Register each of the PR checks  //
// /////////////////////////////// //
registerHooksLogging(app);
registerPrTitleCheckHooks(app);
registerExternalContributorCheckHooks(app);
registerAssignDevelopersHooks(app);

// Optional: Handle errors
app.webhooks.onError(error => {
	if (error.name === 'AggregateError') {
		// Log Secret verification errors
		console.log('Error processing request:');
		console.log(error.event);
		console.log('Response:');
		// FIXME - check what gets returned
		// console.log(error.errors[0].response);
		console.log(error.event.payload);
	} else {
		console.log(error);
	}
});

// Launch a web server to listen for GitHub webhooks
// FIXME - Pick a less common port number
const port = process.env['PORT'] ?? 3000;
const path = '/api/webhook';
const localWebhookUrl = `http://localhost:${port}${path}`;

// See https://github.com/octokit/webhooks.js/#createnodemiddleware for all options
const middleware = createNodeMiddleware(app.webhooks, {path});

http.createServer(middleware).listen(port, () => {
	console.log(`Server is listening for events at: ${localWebhookUrl}`);
	console.log('Press Ctrl + C to quit.');
});