const external_contributor_check_name = "External user. Please check contributors agreement"
const contributors_list_url = "https://contributors.corp.mongodb.com/"

// Set up actions to perform on each webhook
export function register_external_contributor_check_hooks(app) {

    app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
        // PR creation
        const pr_submitter = payload.pull_request.user.login
        await external_contributor_welcome_message(octokit, payload, pr_submitter)
        await create_contributors_agreement_reminder(octokit, payload, payload.pull_request.head.sha)
    })
  
    app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
        // Checks are tied to the latest commit on the PR, so we need to rerun 
        // each time new commits are added.    
        const head_sha = payload.pull_request.head.sha
        await create_contributors_agreement_reminder(octokit, payload, head_sha)
    })
  
}

async function user_is_wt_member(octokit, user) {
    // FIXME - use the proper WT membership check.
    //         This requires that the app is registered with the WT organisation.
    //         Also need to handle pagination so all 100+ members are returned
    // const in_wt_org = await octokit.rest.orgs.checkMembershipForUser({
    //   org: "wiredtiger",
    //   username: user,
    // });
  
    // FIXME - This call can only see public members when the app is not authenticated 
    // as a member of the wiredtiger org. Need to recheck this logic if the app gets registered
    const wt_members = await octokit.rest.orgs.listMembers({ org: "wiredtiger"})
      .then((results) => results.data.map((user) => user.login))

    return wt_members.includes(user)
}

// If the PR submitter isn't a member of the WiredTiger org post a welcome message
async function external_contributor_welcome_message(octokit, payload, pr_submitter) {
    if(! await user_is_wt_member(octokit, pr_submitter)) {
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
async function create_contributors_agreement_reminder(octokit, payload, head_sha){

    if(! await user_is_wt_member(octokit, payload)) {
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