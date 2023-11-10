// WiredTiger has SME groups who focus on certain areas of the codebase.
// Whenever a PR touching this functionality is opened add those members to the PR as assignees.
// Note this doesn't mean they need to review, only that they're aware of the changes
// SME groups members are tracked in the file pointed to by `SME_GROUPS_FILE` in the .env file.

import {type PullRequestOpenedEvent} from '@octokit/webhooks-types';
import {type App, type Octokit} from 'octokit';
import {reportWebhookError} from './webhookLogging';
import {slackMessageWarning} from './notifySlack';
import {existsSync, readFileSync} from 'fs';

export function registerAssignDevelopersHooks(app: App) {
	// Only run this on PR creation.
	// The component list on the Jira ticket should already have been set by the time the pr is opened.
	app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
		try {
			if (! verifyTargetIsDefaultBranch(payload)) {
				return;
			}

			const listAndMessage = await buildAssigneeListAndMessage(octokit, payload);
			if (listAndMessage !== undefined) {
				const [assigneeList, assigneeMessage] = listAndMessage;
				await assignDevelopers(octokit, payload, assigneeList, assigneeMessage);
			}
		} catch (error) {
			reportWebhookError(error, payload, 'assignDevelopers pull_request.opened');
		}
	});
}

// Create the list of developers to assign to the PR as well as the message explaining why.
// If this is not possible return undefined.
async function buildAssigneeListAndMessage(octokit: Octokit, payload: PullRequestOpenedEvent): Promise<[string[], string] | undefined> {
	const wtTicketRegex = /(?<wtTicket>WT-[0-9]+) .*/;
	const match = wtTicketRegex.exec(payload.pull_request.title);

	if (! match?.groups) {
		console.log('No WT ticket in title! skipping auto-assignment');
		return undefined;
	}

	const ticketComponents = await getComponentList(match.groups['wtTicket']!);
	const assignedSmeGroups = getAssignedSmeGroups(ticketComponents)!;

	const assigneeList = buildAssigneeList(assignedSmeGroups);
	const assigneeMessage = buildAssigneeMessage(assignedSmeGroups, assigneeList);

	if (assigneeList.length === 0) {
		console.log('No developers found to assign');
		return undefined;
	}

	return [assigneeList, assigneeMessage];
}

// Verify the pull request is merging into the projects default branch.
function verifyTargetIsDefaultBranch(payload: PullRequestOpenedEvent): boolean {
	const defaultBranch = payload.repository.default_branch;
	const targetBranchWithRepo = payload.pull_request.base.label;
	const targetBranch = targetBranchWithRepo.split(':')[1];

	if (targetBranch !== defaultBranch) {
		console.log(`assignDevelopers: PR target branch '${targetBranch}' is not default branch '${defaultBranch}'`);
		return false;
	}

	return true;
}

// Return the list of components for a WT Jira ticket as a list of strings
async function getComponentList(wtTicket: string): Promise<string[]> {
	const wtTicketComponents = `https://jira.mongodb.org/rest/api/2/issue/${wtTicket}?fields=components`;

	type ComponentItem = {self: string; id: string; name: string; description: string};
	type JsonComponentRequest = {expand: string; id: string;self: string;key: string; fields: {components: ComponentItem[]}};

	const jiraTicketText = await fetch(wtTicketComponents).then(async res => res.text());
	const jiraTicketJson = JSON.parse(jiraTicketText) as JsonComponentRequest;
	if (! jiraTicketJson.fields) {
		// Request failed to find the ticket or its component list.
		slackMessageWarning(
			`Couldn't find component list for ticket ${wtTicket}`,
			`Failed GET request: ${wtTicketComponents}`,
		);
		return [];
	}

	return jiraTicketJson.fields.components.map(c => c.name);
}

// Load the sme_groups.json file and return a mapping from
// component to users for each component in `ticketComponents`.
// Example:
//     [{"component": "Cache and eviction", "members": ["ajmorton", "user2"]}]
type SmeGroup = {component: string; members: string[]};
type SmeGroupsList = SmeGroup[];

function getAssignedSmeGroups(ticketComponents: string[]): SmeGroupsList | undefined {
	const smeGroupsFile = process.env['SME_GROUPS_FILE']!;
	if (existsSync(smeGroupsFile)) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const smeGroupsJson = JSON.parse(readFileSync(smeGroupsFile, 'utf8'));
		const assignedSmeGroups = ticketComponents.map(component =>
			({component, members: smeGroupsJson[component] as string[]}),
		);
		return assignedSmeGroups;
	}

	return undefined;
}

// Given a list of assigned sme groups, get the list of all developers mentioned
// and return as a list of strings
function buildAssigneeList(assignedSmeGroups: SmeGroupsList): string[] {
	let assigneeList: string[] = [];
	for (const smeGroup of assignedSmeGroups) {
		const members = smeGroup?.members ?? [];
		assigneeList = assigneeList.concat(members);
	}

	// Cast to a Set and then back to array to remove duplicate entries
	return [...new Set(assigneeList)];
}

// Build the PR comment the bot will post. Explains which developers have been assigned and why
function buildAssigneeMessage(smeGroups: SmeGroupsList, assigneeList: string[]) {
	let assigneeMessage = 'Assigning the following users based on Jira ticket components:\n';

	for (const smeGroup of smeGroups) {
		const componentName: string = smeGroup.component;
		const componentMembers: string = smeGroup.members.join(', ');
		assigneeMessage += `- \`${componentName}\`: ${componentMembers}\n`;
	}

	// Github only supports up to 10 assignees. If our list exceeds this then github truncates it
	if (assigneeList.length > 10) {
		assigneeMessage += '<sub>Github limits PRs to at most 10. Assignee list has been truncated</sub>';
	}

	return assigneeMessage;
}

// Update the PR and post a message on why developers were assigned.
async function assignDevelopers(octokit: Octokit, payload: PullRequestOpenedEvent, assigneeList: string[], assigneeMessage: string) {
	console.log('Assigning members to PR');

	if (process.env['DRY_RUN'] === 'true') {
		console.log(`Dry run: assignee list: [${assigneeList.join(', ')}]`);
		console.log(`Dry run: PR message: \n"""\n${assigneeMessage}\n"""`);
	} else {
		// This call can only add org members and will silently skip non-members
		await octokit.rest.issues.addAssignees({
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			issue_number: payload.pull_request.number,
			assignees: assigneeList,
		});

		await octokit.rest.issues.createComment({
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			issue_number: payload.pull_request.number,
			body: assigneeMessage,
		});
	}
}
