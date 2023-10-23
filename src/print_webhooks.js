// General logging when relevant hooks are received.

export function registerHooksLogging(app) {
    app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
        console.log(`Pull request open event for #${payload.pull_request.number}`);
    });

    app.webhooks.on('pull_request.edited', async ({octokit, payload}) => {
        console.log(`Pull request edited event for #${payload.pull_request.number}`);
    });

    app.webhooks.on('pull_request.synchronize', async ({octokit, payload}) => {
        console.log(`Pull request sync event for #${payload.pull_request.number}`);
    });

    app.webhooks.on('check_run.rerequested', async ({octokit, payload}) => {
        if (payload.check_run.app.id === appId) {
            console.log(`Check run re-request event for #${payload.pull_request.number}`);
        }
    });
}
