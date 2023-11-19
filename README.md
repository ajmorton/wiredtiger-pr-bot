:exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation:  
Repo archived. Work has been migrated to the wiredtiger org  
:exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation::exclamation:

# wiredtiger-pr-bot

Quality checks for WiredTiger PRs.
- When external users (those not in the wiredtiger organisation) open a PR post a welcome message with instructions on signing the collaborators agreement, and add a check that reminds reviewers to verify the agreement has been signed
- Validate that the PR title begins with a WT ticket required by our automation tasks
- When a PR is opened automatically assign developers (as assignees, not reviewers) based on the Jira ticket's listed components and the contents of the SME_GROUPS_FILE whose path is provided in the .env file`

<!-- FIXME - make sure that the sme_groups.json file is added to the repo if/when we migrate the tool to wiredtiger -->

## Requirements

- Node.js 19.8.1 or higher
- A GitHub App with:
  - Subscriptions to the following events:
    - Pull Request
    - Check Run
    - Check Suite
  - The following permissions:
    - Repo::Checks: Read & write
    - Repo::Contents: Read only
    - Repo::Metadata: Read only 
    - Repo::Pull requests: Read & write
    - Organisation::Members: Read only

## Env file

Environment variables are currently stored in a local `.env` file that sits at the root dir of this repo.
The file should contain the following fields:
```bash
# Disable any Github API calls that would modify the PR. Read-only calls are still allowed
# Only the value `true` will enable dry runs.
DRY_RUN=true

# The Slack webhook (https://api.slack.com/messaging/webhooks) we send informational events to. 
# This posts to a team channel for normal notifications, for example when a new external PR is opened.
SLACK_WEBHOOK_NOTIFY="https://hooks.slack.com/services/XXXXXX"

# The Slack webhook (https://api.slack.com/messaging/webhooks) we send errors and warnings to. 
# These are errors and warnings about the Github app itself and used to diagnosie issues in the app.
SLACK_WEBHOOK_DEBUG="https://hooks.slack.com/services/XXXXXX"

# Path to the sme_groups.json file.
# This file is a json file that maps from component names (as a string) to a list of developers 
# to assign to PRs that modify that component (as a list of strings). SME (Subject Matter Expert) 
# groups are developers who have experience, or would like to build experience, in a WiredTiger component. 
# These developers will be assigned to the PR when it is created if the PR has a WT ticket in the title 
# based on the components field of the WT tickets Jira page.  
# Note that assigned does not mean the developer must review the PR, just that they are aware of changes 
# taking place in the component. 
# An example file format can be found in example/example_sme_groups.json
SME_GROUPS_PATH="path/to/sme_groups.json"

# The following settings are located on the Github App page where you have created the app. This will be located in `Settings/Developer Settings`.

# Found under `About`
APP_ID="123"

# Found under `Webhook secret`
WEBHOOK_SECRET="secretstring"

# .pem file created in the `Private keys` section. Download this file and provide its absolute file path
PRIVATE_KEY_PATH="path/to/file.pem"
```

## Setup

1. Clone this repository.
2. Create a `.env` as described in `Env file` and set values
3. Install dependencies with `npm install`.
4. Start the server with `npm run server`.
    - When running on a remote machine I prefer to run in `screen` and save logs. This allows you to disconnect from the machine and keep the server running. To do so
    ```bash
    screen -t wiredtiger-pr-bot                  # Start up a new screen
    npm run server 2>&1 | tee pr-bot-traces.log  # Pipe both stdout and sterr to a log file. Traces are also printed to console by `tee`
    # ctrl-A, ctrl-D detaches the screen and you can close the remote connection

    # When coming back to the machine
    screen -list                       # Displays all active screens. Find your wiredtiger-pr-bot screen (e.g. 616001.wiredtiger-pr-bot)
    screen -x 616001.wiredtiger-pr-bot # Open the screen and continue where you left off
    ```
5. Ensure your server is reachable from the internet.
    - For debugging and development [smee](https://smee.io/) is very useful as it provides a webpage interface that both displays webhook events and captures them for easy replay. This should **not** be used in production. 
    To setup smee go to https://smee.io/ and create a new channel. Register this new channels URL's as your `Webhook URL` in the Github App settings, and then run `smee -u <smee_url> -t http://localhost:8784/api/webhook` locally. This will forward webhook events to the server listening on localhost.
    - Otherwise for production use just make sure the machine you're running on has the relevant port exposed to the internet. For AWS workstations the 9080 port is exposed. On https://spruce.mongodb.com/spawn/host get your machine's `DNS Name`, and then append your port number and `/api/webhook` to the string, adding it to `Webhook URL` in the Github App's configuration. For example `my-host.compute.amazonaws.com` will become `my-host.compute.amazonaws.com:9080/api/webhook`
6. Ensure your GitHub App includes at least one repository on its installations.

## Usage

When running the server will [receive webhooks](https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request) on any repository that app has been granted access to.
It will perform checks and post comments as defined in `app.js`

## Security considerations
<!-- FIXME - Do this properly -->
To keep things simple, this example reads the `GITHUB_APP_PRIVATE_KEY` from the
environment. A more secure and recommended approach is to use a secrets management system
like [Vault](https://www.vaultproject.io/use-cases/key-management), or one offered
by major cloud providers:
[Azure Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/secrets/quick-create-node?tabs=windows),
[AWS Secrets Manager](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-secrets-manager/),
[Google Secret Manager](https://cloud.google.com/nodejs/docs/reference/secret-manager/latest),
etc.


## Common errors

**I don't see any incoming webhooks!**  
Confirm in the Github App settings (`Permissions and events::Subscribe to events`) that the subscriptions listed in the [Requirements](#requirements) section above are enabled. 

**I'm seeing `[@octokit/webhooks] onUnhandledRequest() is deprecated and will be removed in a future release of @octokit/webhooks` in the logs**  
These can be ignored. These are messages from random machines on the internet and not Github Webhook events.
