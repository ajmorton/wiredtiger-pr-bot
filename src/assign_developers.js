
export function registerAssignDevelopersHooks(app) {
    // Only run this on ticket creation.
    // The component list should already have been set and finalised by the time the pr is opened
    app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
        const wtTicketRegex = /(?<wtTicket>WT-[0-9]+) .*/;
        const match = payload.pull_request.title.match(wtTicketRegex);
        if (!match) {
            console.log('No WT ticket in title! skipping auto-assignment');
            return;
        }

        const ticketComponents = await getComponentList(match.groups.wtTicket);
        const assignedSmeGroups = await getAssignedSmeGroups(octokit, payload, ticketComponents);

        const assigneeList = buildAssigneeList(assignedSmeGroups);
        const assigneeMessage = buildAssigneeMessage(assignedSmeGroups, assigneeList);

        if (assigneeList.length == 0) {
            console.log('No developers found to assign');
            return;
        }

        console.log('Assigning members to PR');

        if (process.env.DRY_RUN === 'true') {
            console.log(`Dry run: assignee list: ${assigneeList}`);
            console.log(`Dry run: PR message: \n"""\n${assigneeMessage}\n"""`);
        } else {
            // This call can only add org members and will silently skip non-members
            await octokit.rest.issues.addAssignees({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
                issue_number: payload.pull_request.number,
                assignees: assigneeList,
            });

            await octokit.rest.issues.createComment({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
                issue_number: payload.pull_request.number,
                body: assigneeMessage,
            });
        }
    });
}

// Return the list of components for a WT Jira ticket as a list of strings
async function getComponentList(wtTicket) {
    const wtTicketComponents = `https://jira.mongodb.org/rest/api/2/issue/${wtTicket}?fields=components`;

    const jiraTicketText = await fetch(wtTicketComponents).then((res) => res.text());
    const jiraTicketJson = JSON.parse(jiraTicketText);
    return jiraTicketJson.fields.components.map((c) => c.name);
}

// Load the sme_groups.json file and return a mapping from
// component to users for each component in `ticketComponents`.
// Format:
//     [{"component": str, "members": [str]}]
// Example:
//     [{"component": "Cache and eviction", "members": ["ajmorton", "user2"]}]
async function getAssignedSmeGroups(octokit, payload, ticketComponents) {
    const smeGroupsDownloadUrl = await octokit.rest.repos.getContent({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        path: 'tools/pull_requests/sme_groups.json',
    }).then((res) => res.data.download_url);

    const smeGroupsText = await fetch(smeGroupsDownloadUrl).then((res) => res.text());
    const smeGroupsJson = JSON.parse(smeGroupsText);

    const assignedSmeGroups = ticketComponents.map((component) => {
        return {'component': component, 'members': smeGroupsJson[component]};
    });

    return assignedSmeGroups;
}

// Given a list of assigned sme groups, get the list of all developers mentioned
// and return as a list of strings
function buildAssigneeList(assignedSmeGroups) {
    let assigneeList = [];
    for (let i = 0; i < assignedSmeGroups.length; i++) {
        assigneeList = assigneeList.concat(assignedSmeGroups[i]['members']);
    }

    // Cast to a Set and then back to array to remove duplicate entries
    return [...new Set(assigneeList)];
}

// Build the PR comment the bot will post. Explains which developers have been assigned and why
function buildAssigneeMessage(smeGroups, assigneeList) {
    let assigneeMessage = 'Assigning the following users based on Jira ticket components:\n';

    for (let i = 0; i < smeGroups.length; i++) {
        assigneeMessage += `- \`${smeGroups[i].component}\`: ${smeGroups[i]['members'].join(', ')}\n`;
    }
    assigneeMessage += '\n<sub>Assignees determined based on tools/pull_requests/sme_groups.json</sub>\n';

    // Github only supports up to 10 assignees. If our list exceeds this then github truncates it
    if (assigneeList.length > 10) {
        assigneeMessage += '<sub>Github limits PRs to at most 10. Assignee list has been truncated</sub>';
    }

    return assigneeMessage;
}

