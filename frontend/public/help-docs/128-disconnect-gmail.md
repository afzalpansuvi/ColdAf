# How to Disconnect a Gmail Account from ColdAF

**Last Update:** July 2026

**Post ID:** 128

There are many reasons you might want to disconnect Gmail from ColdAF — maybe you're switching Google Workspace domains, offboarding an account, or reorganizing your multi-brand setup. Learning how to safely unlink Google Workspace cold outreach accounts is important because it prevents accidental sends while preserving your full campaign history. In this guide, we'll show you how to remove a Gmail account from ColdAF without losing any data or analytics.

## You can disconnect a Gmail account in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the **Accounts** panel that opens, find the Gmail account you want to remove.
2. In the **SMTP Accounts** list, in the **Actions** column at the far right, click **Disconnect** or **Delete**.
3. In the confirmation dialog that appears, confirm the disconnect action.
4. The OAuth token is revoked in ColdAF and the account is removed from the active list.

That's it! Now the account is disconnected. All campaign history tied to that account remains intact for reporting and analytics.

## Notes

- Disconnecting stops all future sends from that account immediately.
- Campaign history is kept for analytics and compliance records even after disconnect.
- Reconnecting later uses the same account ID, so historical data stays linked.
- Disconnect before changing Google Workspace domains to avoid authentication conflicts.
- Active campaigns using this account will automatically pause to prevent failed sends.

## Related Articles

- How to Connect Gmail via OAuth in ColdAF
- How to Reconnect a Degraded SMTP Account
- How to Add an SMTP Account in ColdAF
