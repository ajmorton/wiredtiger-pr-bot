
export function register_assign_developers_hooks(app) {

    // Only run this on ticket creation. 
    // The component list should already have been set and finalised by the time the pr is opened
    app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {

        const wt_ticket_regex = /(?<wt_ticket>WT-[0-9]+) .*/
        const match = payload.pull_request.title.match(wt_ticket_regex)
        if(!match) {
            console.log("No WT ticket in title! skipping auto-assignment")
            return
        }

        const ticket_components = await get_component_list(match.groups.wt_ticket)
        const assigned_sme_groups = await get_assigned_sme_groups(octokit, payload, ticket_components)

        const assignee_list = build_assignee_list(assigned_sme_groups)
        const assignee_message = build_assignee_message(assigned_sme_groups, assignee_list)

        if(assignee_list.length == 0) {
            console.log("No developers found to assign")
            return
        }

        console.log("Assigning members to PR")

        if(process.env.DRY_RUN === "true") {
            console.log(`Dry run: assignee list: ${assignee_list}`)
            console.log(`Dry run: PR message: \n"""\n${assignee_message}\n"""`)
        } else {
            // This call can only add org members and will silently skip non-members
            await octokit.rest.issues.addAssignees({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
                issue_number: payload.pull_request.number,
                assignees: assignee_list
            })

            await octokit.rest.issues.createComment({
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
                issue_number: payload.pull_request.number,
                body: assignee_message
            })
        }

    })
}

// Return the list of components for a WT Jira ticket as a list of strings
async function get_component_list(wt_ticket) {
    const wt_ticket_components = `https://jira.mongodb.org/rest/api/2/issue/${wt_ticket}?fields=components`

    const jira_ticket_text = await fetch(wt_ticket_components).then(res => res.text())
    const jira_ticket_json = JSON.parse(jira_ticket_text)
    return jira_ticket_json.fields.components.map(c => c.name)
}

// Load the sme_groups.json file and return a mapping from 
// component to users for each component in `ticket_components`.
// Format:
//     [{"component": str, "members": [str]}]
// Example:
//     [{"component": "Cache and eviction", "members": ["ajmorton", "user2"]}]
async function get_assigned_sme_groups(octokit, payload, ticket_components) {
    const sme_groups_download_url = await octokit.rest.repos.getContent({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        path: "tools/pull_requests/sme_groups.json",
    }).then(res => res.data.download_url);

    const sme_groups_text = await fetch(sme_groups_download_url).then(res => res.text())
    const sme_groups_json = JSON.parse(sme_groups_text)

    const assigned_sme_groups = ticket_components.map(component => {
        return  {"component": component, "members": sme_groups_json[component]}
    });

    return assigned_sme_groups
}

// Given a list of assigned sme groups, get the list of all developers mentioned 
// and return as a list of strings
function build_assignee_list(assigned_sme_groups){
    var assignee_list = []
    for(var i = 0; i < assigned_sme_groups.length; i++) {
        assignee_list = assignee_list.concat(assigned_sme_groups[i]["members"])
    }

    // Cast to a Set and then back to array to remove duplicate entries
    return [...new Set(assignee_list)];
}

// Build the PR comment the bot will post. Explains which developers have been assigned and why
function build_assignee_message(sme_groups, assignee_list) {
    var assignee_message = "Assigning the following users based on Jira ticket components:\n"

    for(var i = 0; i < sme_groups.length; i++) {
        assignee_message += `- \`${sme_groups[i].component}\`: ${sme_groups[i]["members"].join(', ')}\n`
    }
    assignee_message += "\n<sub>Assignees determined based on tools/pull_requests/sme_groups.json</sub>\n"

    // Github only supports up to 10 assignees. If our list exceeds this then github truncates it
    if(assignee_list.length > 10) {
        assignee_message += "<sub>Github limits PRs to at most 10. Assignee list has been truncated</sub>"    
    }

    return assignee_message
}

