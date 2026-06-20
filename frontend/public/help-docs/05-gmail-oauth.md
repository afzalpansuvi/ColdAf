# How to Connect Gmail to ColdAF Using OAuth

**Last Update:** July 2026

**Post ID:** 105

Many users prefer to send cold outreach from their existing Gmail or Google Workspace accounts. ColdAF supports a secure OAuth connection that lets you link your Gmail without sharing passwords or dealing with SMTP credentials manually. This is the safest and most reliable way to **connect gmail cold email tool** setups, especially for teams already using Google Workspace. In this guide, you'll learn how to complete the **gmail oauth cold outreach** authorization flow and ensure your **gmail smtp setup** stays connected without manual intervention.

## You can connect Gmail to ColdAF in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar, and in the page that opens, click **Add Account** at the top right.

2. In the **Add Account** modal, in the provider dropdown at the top, select **Gmail OAuth** as the provider.

3. Click **Connect Gmail**. A new browser tab will open to Google's OAuth authorization page. If you're already signed into Google, you'll see your accounts listed. If not, sign in first.

4. Select the Gmail or Google Workspace account you want to connect, then review the permissions ColdAF is requesting. These permissions allow ColdAF to send emails on your behalf and read replies for tracking purposes. Click **Allow** to proceed.

5. After granting permissions, you'll be redirected back to ColdAF automatically. The page will show a success message, and your Gmail account will appear in the **SMTP Accounts** list with a status of **Connected**.

That's it! Now you can use your Gmail account to send and receive emails from any campaign in ColdAF.

## Notes

- ColdAF **auto-refreshes OAuth tokens** every 30 minutes via a background cron job. This means you never have to manually reconnect your account, even though Google tokens expire regularly.
- If a token refresh fails — for example, if you changed your Google password or revoked the app's access — the account status will change to **Degraded**. In that case, click **Reconnect** next to the account name and repeat the authorization flow.
- This works with both **personal Gmail accounts** and **Google Workspace accounts**. If you're managing a team, each team member can connect their own Gmail account individually.
- You can **disconnect** your Gmail account at any time from the **SMTP Accounts** page by clicking **Disconnect**. This removes the OAuth link but does not delete any campaign history, analytics, or reply data associated with the account.
- OAuth is more secure than SMTP because you never share your password with ColdAF. If your ColdAF account is ever compromised, your Google credentials remain protected.
- If you see a "This app isn't verified" warning from Google, it means ColdAF is still in Google's review process. You can still proceed by clicking **Advanced** and then **Go to coldfaf.ataflexsolutions.com (unsafe)**.

## Related Articles

- How to Set Up Your SMTP Account in ColdAF Email Tool
- How to Monitor Email Deliverability in ColdAF
- How to Warm Up Your Email Address in ColdAF
