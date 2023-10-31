import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import {Octokit, App} from 'octokit';
import {createNodeMiddleware} from '@octokit/webhooks';

import {registerHooksLogging} from './src/webhookLogging.ts';
import {registerPrTitleCheckHooks} from './src/prTitleValidation.ts';
import {registerExternalContributorCheckHooks} from './src/externalContributorChecks.ts';
import {registerAssignDevelopersHooks} from './src/assignDevelopers.ts';
import {slackMessageError} from './src/notifySlack.ts';

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

// Launch a web server to listen for GitHub webhooks
// default to 9080 which is open on spawn hosts
const port = process.env['PORT'] ?? 9080;
const path = '/api/webhook';
const localWebhookUrl = `http://localhost:${port}${path}`;

// See https://github.com/octokit/webhooks.js/#createnodemiddleware for all options
const middleware = createNodeMiddleware(app.webhooks, {path});

http.createServer(middleware).listen(port, () => {
	console.log(`Server is listening for events at: ${localWebhookUrl}`);
	console.log('Press Ctrl + C to quit.');
});

// This prevents the server from crashing when an error slips past the webhook
// try-catch blocks. This will most likely happen when an octokit call returns a
// 400 error since Promises wrapping an error will slip past the catch blocks.
process.on('uncaughtException', err => {
	// The stack traces don't help us much here. To find out which octokit call caused
	// the error follow the link in data.documentation_error, get the title of the request,
	// and look it up on https://docs.github.com/en/rest.
	//
	// For example:
	// data.documentation_error:
	//     'https://docs.github.com/rest/orgs/members#check-organization-membership-for-a-user'
	// Request title:
	//     'Check organization membership for a user'
	// Function from https://docs.github.com/en/rest:
	//    octokit.rest.orgs.checkMembershipForUser({org, username});
	//
	// You can then look at the contents of response.url to determine the string value of each
	// argument provided to the function.
	slackMessageError('Uncaught exception when responding to webhook! Details:', JSON.stringify(err, null, 2));
});
