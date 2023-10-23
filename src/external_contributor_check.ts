// Handling for when external users submit a PR to wiredtiger.
// - On PR creation we send a welcome message asking them to sign the contributors agreement
// - Add a PR check that reminds reviewers to check that the contributors agreement has been signed
// - Send a slack message to the team that an external PR has been submitted. Encourage faster responses.

import { PullRequestEvent, PullRequestOpenedEvent } from "@octokit/webhooks-types";
import { App, Octokit } from "octokit";

const externalContributorCheckName = 'External user. Please check contributors agreement';
const contributorsListUrl = 'https://contributors.corp.mongodb.com/';

// Set up actions to perform on each webhook
export function registerExternalContributorCheckHooks(app: App) {
    app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
        // PR creation
        const prSubmitter = payload.pull_request.user.login;
        // FIXME - Add a logging webhook for server issues
        const org = payload.organization?.login ?? "Can't find org!";
        if (! await userIsOrgMember(octokit, prSubmitter, org)) {
            await externalContributorWelcomeMessage(octokit, payload, prSubmitter);
            await createContributorsAgreementReminder(octokit, payload);
            await notifySlackOfNewPr(payload, prSubmitter);
        }
    });

    app.webhooks.on('pull_request.synchronize', async ({octokit, payload}) => {
        const prSubmitter = payload.pull_request.user.login;
        const org = payload.organization?.login ?? "Can't find org!";
        if (! await userIsOrgMember(octokit, prSubmitter, org)) {
            // Checks are tied to the latest commit on the PR, so we need to rerun
            // each time new commits are added.
            await createContributorsAgreementReminder(octokit, payload);
        }
    });
}

async function userIsOrgMember(octokit: Octokit, user: string, org: string): Promise<Boolean> {
    // This returns status 204 if the user is part of the organisation, 404 if they're not,
    // or 304 if the Github app isn't part of the organisation.
    // However if the Github app doesn't have read permissions for Organisation::Members it
    // won't see private members and will falsely report users as not in the org
    const inWtOrgStatus = await octokit.rest.orgs.checkMembershipForUser({
        org: org,
        username: user,
    }).then((result) => result.status).catch((result) => result.status);
    const inWtOrg = inWtOrgStatus == 204;

    // FIXME - Add error logging
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

    if (process.env["DRY_RUN"] === 'true') {
        console.log(`Dry run: posting comment\n${externalContributorWelcomeMessage}`);
    } else {
        await octokit.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            body: externalContributorWelcomeMessage,
        });
    }
}

// Create a check that the external contributors agreement is signed.
// This is only created for external users, for the obvious reasons
async function createContributorsAgreementReminder(octokit: Octokit, payload: PullRequestEvent) {
    console.log('Creating new contributors agreement check');
    if (process.env["DRY_RUN"] === 'true') {
        console.log('Dry run: Adding \'please check contributors agreement\' reminder');
    } else {
        octokit.rest.checks.create({
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
        `Please assign a reviewer or triage for a future sprint.\n` +
        `If the PR will be reviewed at a later date please inform the submitter of this decision.`;

    // Wrapping for the message to make slack happy. This adds a blue bar on
    // the left hand side of the message
    const slackMessage =
        {'attachments': [{'color': '#2589CF', 'blocks':
            [{'type': 'section', 'text': {'type': 'mrkdwn', 'text': slackMsgContent}}],
        }]};
    const slackMessageString = JSON.stringify(slackMessage);

    // Send the message to the slack webhook
    if (process.env["DRY_RUN"] === 'true') {
        console.log(`Dry run: Sending slack message about new external PR:\n${slackMessageString}`);
    } else {
        console.log('Notifying slack of new external PR');
        fetch(process.env["SLACK_WEBHOOK"] as string, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: slackMessageString,
        });
    }
}
