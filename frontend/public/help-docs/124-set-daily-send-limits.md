# How to Set Daily Send Limits for Your Accounts

**Last Update:** July 2026

**Post ID:** 124

Sending too many emails too fast is the fastest way to burn a domain reputation. Whether you are warming up a new account or scaling an established one, daily send limits cold email caps protect your deliverability and keep you out of spam folders. ColdAF enforces these limits as hard ceilings, so you never have to worry about accidentally blasting past a safe threshold.

If you are managing multiple clients or inboxes, setting a precise smtp send limit coldaf configuration for each account is essential. A well-planned email volume cap cold outreach strategy lets you scale gradually while maintaining strong open rates and sender trust. This article shows you how to set limits that match your account age and goals.

## You can set daily send limits in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the panel that opens, locate the account you want to configure.
2. In the **SMTP Accounts** list, click on the account name or the **Edit** button in the **Actions** column at the right side of the row.
3. In the account edit form, scroll down to the **Daily Send Limit** field in the middle of the page.
4. Enter a number that reflects your account's current reputation. For example, enter 20 to 50 for a brand-new account, 100 to 200 for a warmed account, or 500 or more for an established account with strong history.
5. If you are using this account across multiple brands, check the **Per-Brand Limit** field and enter a separate cap if you want each brand to have its own sub-limit.
6. Review the limit carefully. Remember that ColdAF treats this as a hard cap, not a suggestion.
7. Click **Save** at the top-right of the form.

That's it! Now ColdAF will automatically stop sending from this account once the daily limit is reached and queue remaining emails for the next day.

## Notes

- ColdAF enforces the daily send limit as a hard cap. Once the account hits the limit, all additional emails scheduled for that day are queued and will resume at the next reset window.
- Recommended starting limits: 20 to 50 per day for new accounts with no sending history, 100 to 200 per day for accounts that have completed a warm-up phase, and 500 or more for mature accounts with consistent positive engagement.
- To send higher volume, spread load across multiple accounts rather than cranking one account to an extreme number. This looks more natural to inbox providers.
- Limits reset at midnight in the account's configured timezone. If you manage international accounts, keep timezone differences in mind when scheduling campaigns.
- You can override limits temporarily for urgent campaigns, but we do not recommend doing this unless you understand the reputation risk.

## Related Articles

- How to Add an SMTP Account in ColdAF
- How to Warm Up an Email Account in ColdAF
- How to Monitor SMTP Health in ColdAF
