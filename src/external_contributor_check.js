const external_contributor_check_name = "External user. Please check contributors agreement"
const contributors_list_url = "https://contributors.corp.mongodb.com/"

// Set up actions to perform on each webhook
export function register_external_contributor_check_hooks(app) {

    app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
        // PR creation
        const pr_submitter = payload.pull_request.user.login
        const head_sha = payload.pull_request.head.sha
        await external_contributor_welcome_message(octokit, payload, pr_submitter)
        await create_contributors_agreement_reminder(octokit, payload, head_sha, pr_submitter)
    })

    app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
        // Checks are tied to the latest commit on the PR, so we need to rerun 
        // each time new commits are added.    
        const pr_submitter = payload.pull_request.user.login
        const head_sha = payload.pull_request.head.sha
        await create_contributors_agreement_reminder(octokit, payload, head_sha, pr_submitter)
    })
  
}

async function user_is_org_member(octokit, user, org) {
    // This returns status 204 if the user is part of the organisation, 404 if they're not, 
    // or 304 if the Github app isn't part of the organisation.
    // However if the Github app doesn't have read permissions for Organisation::Members it 
    // won't see private members and will falsely report users as not in the org
    const in_wt_org_status = await octokit.rest.orgs.checkMembershipForUser({
        org: org,
        username: user,
    }).then(result => result.status).catch(result => result.status);
    const in_wt_org = in_wt_org_status == 204

    return in_wt_org
}

// If the PR submitter isn't a member of the WiredTiger org post a welcome message
async function external_contributor_welcome_message(octokit, payload, pr_submitter) {
    const org = payload.organization.login
    if(! await user_is_org_member(octokit, pr_submitter, org)) {
        const external_contributor_welcome_message = 
            `Hi @${pr_submitter}, thank you for your submission!
            Please make sure to sign our [Contributor Agreement](https://www.mongodb.com/legal/contributor-agreement) \
            and provide us with editor permissions on your branch. 
            Instructions on how do that can be found [here](https://docs.github.com/en/free-pro-team@latest/github/collaborating-with-issues-and-pull-requests/allowing-changes-to-a-pull-request-branch-created-from-a-fork).` 

        await octokit.rest.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: payload.pull_request.number,
            body: external_contributor_welcome_message
        })
    } else {
        console.log("Not external contrib")
    }
}
  
// Create a check that the external contributors agreement is signed.
// This is only created for external users, for the obvious reasons
async function create_contributors_agreement_reminder(octokit, payload, head_sha, pr_submitter){
    const org = payload.organization.login
    if(! await user_is_org_member(octokit, pr_submitter, org)) {
        console.log("Creating new contributors agreement check")
        octokit.rest.checks.create({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            name: external_contributor_check_name,
            output: {
                title: "",
                summary: `Make sure that an external contributor has signed the contributors agreement.
                This check only appears for external constributors.
                The contributors list can be [found here](${contributors_list_url})`,
            },
            conclusion: "neutral",
            head_sha: head_sha,
        })    
    }
}