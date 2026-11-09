export function smsCampaignTestModeEnabled() {
	return process.env.SMS_CAMPAIGN_TEST_MODE?.trim().toLowerCase() === 'true'
}

export function campaignAllowsMissingMarketingConsent(campaign) {
	return (
		smsCampaignTestModeEnabled() &&
		campaign?.filters?.smsCampaignTestMode === true
	)
}
