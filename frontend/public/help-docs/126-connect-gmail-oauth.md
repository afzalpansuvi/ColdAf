# How to Connect Gmail via OAuth in ColdAF

**Last Update:** July 2026

**Post ID:** 126

Connecting your Gmail account to ColdAF is one of the first steps you'll take when setting up a cold outreach workflow. Whether you're running a solo agency or managing a multi-brand team, the ability to connect Gmail via OAuth in ColdAF means you can send emails directly through a trusted Google infrastructure without juggling complex SMTP credentials. This integration also supports Google Workspace, making it ideal for teams that rely on branded business domains. In this guide, we'll walk through the Gmail integration cold email setup so you can start sending in minutes.

## You can connect Gmail via OAuth in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the **Accounts** panel that opens, click **Add Account**.
2. In the **Add Account** dialog, in the account type selector at the top, select **Gmail OAuth**.
3. In the **Gmail OAuth** form, in the **Connect** section at the center, click on **Connect Gmail**.
4. A Google sign-in popup opens. Select the Google account you want to use for sending emails.
5. Grant the requested permissions so ColdAF can send emails on your behalf.
6. You are redirected back to ColdAF. The account now appears as **Connected** in your **SMTP Accounts** list.

That's it! Now you can send cold emails through your Gmail or Google Workspace account directly from ColdAF.

## Notes

- Works with personal Gmail and Google Workspace accounts alike.
- Auto-refreshes tokens every 30 minutes to keep the connection alive.
- If the status shows **Degraded**, it usually means the token expired — click **Reconnect** to restore it.
- You can disconnect anytime without losing campaign history or analytics.
- Google may show an "unverified app" warning for new apps; this is normal and safe to proceed past if you trust the ColdAF domain.

## Related Articles

- How to Reconnect a Degraded SMTP Account
- How to Disconnect a Gmail Account from ColdAF
- How to Add an SMTP Account in ColdAF
