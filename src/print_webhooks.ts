// General logging when relevant hooks are received.

import { App } from "octokit";

export function registerHooksLogging(app: App) {
    app.webhooks.on('pull_request.opened', async ({octokit, payload}) => {
        console.log(`Pull request open event for #${payload.pull_request.number}`);
    });

    app.webhooks.on('pull_request.edited', async ({octokit, payload}) => {
        console.log(`Pull request edited event for #${payload.pull_request.number}`);
    });

    app.webhooks.on('pull_request.synchronize', async ({octokit, payload}) => {
        console.log(`Pull request sync event for #${payload.pull_request.number}`);
    });
}
