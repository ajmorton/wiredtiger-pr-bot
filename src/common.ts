// Common functions used by multiple files.

import {type PullRequestEvent} from '@octokit/webhooks-types';

// PR titles must begin with a WT ticket. Provides a capture group to extract the ticket title.
export const prTitleRegex = /(?<wtTicket>WT-[0-9]+) .*/;
export const prTitleRegexString = 'WT-[0-9]+ .*';

// Verify a pull request is merging into the projects default branch.
export function verifyTargetIsDefaultBranch(payload: PullRequestEvent): boolean {
	const defaultBranch = payload.repository.default_branch;
	const targetBranchWithRepo = payload.pull_request.base.label;
	const targetBranch = targetBranchWithRepo.split(':')[1];

	if (targetBranch !== defaultBranch) {
		console.log(`verifyTargetIsDefaultBranch: PR target branch '${targetBranch}' is not default branch '${defaultBranch}'`);
		return false;
	}

	return true;
}

