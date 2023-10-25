// Handling for when external users submit a PR to wiredtiger.
// - On PR creation we send a welcome message asking them to sign the contributors agreement
// - Add a PR check that reminds reviewers to check that the contributors agreement has been signed
// - Send a slack message to the team that an external PR has been submitted. Encourage faster responses.

import {type PullRequestEvent, type PullRequestOpenedEvent} from '@octokit/webhooks-types';
import {type App, type Octokit} from 'octokit';
import {slackMessageNotification, slackMessageWarning} from './notifySlack.ts';
import {reportWebhookError} from './webhookLogging.ts';

const externalContributorCheckName = 'External user. Please check contributors agreement';
const contributorsListUrl = 'https://contributors.corp.mongodb.com/';

// Set up actions to perform on each webhook
export function registerExternalContributorCheckHooks(app: App) {
	app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
		try {
			// PR creation
			const prSubmitter = payload.pull_request.user.login;
			const org = payload.organization?.login;
			if (! org) {
				slackMessageWarning('Warning! Couldn\'t extract organization from payload',
					JSON.stringify(payload, null, 2));
				return;
			}

			if (! await userIsOrgMember(octokit, prSubmitter, org)) {
				await externalContributorWelcomeMessage(octokit, payload, prSubmitter);
				await createContributorsAgreementReminder(octokit, payload);
				await notifySlackOfNewPr(payload, prSubmitter);
			}
		} catch (error) {
			reportWebhookError(error, payload, 'externalContributorChecks pull_request.opened');
		}
	});

	app.webhooks.on('pull_request.synchronize', async ({octokit, payload}) => {
		try {
			const prSubmitter = payload.pull_request.user.login;
			const org = payload.organization?.login ?? 'Can\'t find org!';
			if (! await userIsOrgMember(octokit, prSubmitter, org)) {
				// Checks are tied to the latest commit on the PR, so we need to rerun
				// each time new commits are added.
				await createContributorsAgreementReminder(octokit, payload);
			}
		} catch (error) {
			reportWebhookError(error, payload, 'externalContributorChecks pull_request.synchronize');
		}
	});
}

async function userIsOrgMember(octokit: Octokit, user: string, org: string): Promise<boolean> {
	// This returns status 204 if the user is part of the organisation, 404 if they're not,
	// or 304 if the Github app isn't part of the organisation.
	// However if the Github app doesn't have read permissions for Organisation::Members it
	// won't see private members and will falsely report users as not in the org
	const inWtOrgStatus = await octokit.rest.orgs.checkMembershipForUser({
		org,
		username: user,
	}).then(result => result.status).catch(result => result.status as number);
	const inWtOrg = inWtOrgStatus === 204;

	if (inWtOrgStatus !== 204 && inWtOrgStatus !== 404) {
		slackMessageWarning(
			`Unexpected return status '${inWtOrgStatus}' from checkMembershipForUser()!\n` +
			`Value should be 204 or 404. user = '${user}', org = '${org}'`,
		);
	}

	return inWtOrg;
}

// If the PR submitter isn't a member of the WiredTiger org post a welcome message
async function externalContributorWelcomeMessage(octokit: Octokit, payload: PullRequestOpenedEvent, prSubmitter: string) {
	const externalContributorWelcomeMessage =
        `Hi @${prSubmitter}, thank you for your submission!
        Please make sure to sign our [Contributor Agreement](https://www.mongodb.com/legal/contributor-agreement) \
        and provide us with editor permissions on your branch. 
        Instructions on how do that can be found [here](https://docs.github.com/en/free-pro-team@latest/github/\
        collaborating-with-issues-and-pull-requests/allowing-changes-to-a-pull-request-branch-created-from-a-fork).`;

	if (process.env['DRY_RUN'] === 'true') {
		console.log(`Dry run: posting comment\n${externalContributorWelcomeMessage}`);
	} else {
		await octokit.rest.issues.createComment({
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			issue_number: payload.pull_request.number,
			body: externalContributorWelcomeMessage,
		});
	}
}

// Create a check that the external contributors agreement is signed.
// This is only created for external users, for the obvious reasons
async function createContributorsAgreementReminder(octokit: Octokit, payload: PullRequestEvent) {
	console.log('Creating new contributors agreement check');
	if (process.env['DRY_RUN'] === 'true') {
		console.log('Dry run: Adding \'please check contributors agreement\' reminder');
	} else {
		void octokit.rest.checks.create({
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			name: externalContributorCheckName,
			output: {
				title: '',
				summary: `Make sure that an external contributor has signed the contributors agreement.
                This check only appears for external constributors.
                The contributors list can be [found here](${contributorsListUrl})`,
			},
			// FIXME - Right now we just post a reminder with neutral, but if we can parse the
			//         contributors agreement this can become a pass/fail check
			conclusion: 'neutral',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			head_sha: payload.pull_request.head.sha,
		});
	}
}

// Send a message to slack about the new external PR asking for reviewers
async function notifySlackOfNewPr(payload: PullRequestOpenedEvent, prSubmitter: string) {
	const prUrl = payload.pull_request.url;
	const prTitle = payload.pull_request.title;
	const prNumber = payload.pull_request.number;

	// The slack message formatted using Slack attachment formatting.
	// You can try it out here: https://app.slack.com/block-kit-builder/
	// (make sure to use the attachment preview and change the js string to a plain string)
	const slackMsgContent =
        `External PR opened by \`${prSubmitter}\`!\n` +
        `<${prUrl}|*#${prNumber} ${prTitle}*>\n` +
        'Please assign a reviewer or triage for a future sprint.\n' +
        'If the PR will be reviewed at a later date please inform the submitter of this decision.';

	slackMessageNotification(slackMsgContent);
}
