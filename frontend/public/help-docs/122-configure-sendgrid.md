# How to Configure SendGrid in ColdAF

**Last Update:** July 2026

**Post ID:** 122

SendGrid is one of the most popular email delivery platforms for high-volume senders. If you want to run a scalable sendgrid cold email setup, ColdAF makes the integration straightforward. Instead of managing SMTP details, you simply plug in a SendGrid API key and start sending. This is ideal for teams that need detailed event tracking and do not want to maintain their own mail servers.

Getting the sendgrid api key coldaf integration right is critical because the key grants full access to your SendGrid account. A properly configured sendgrid integration cold outreach pipeline lets you leverage SendGrid's bounce tracking, spam reporting, and open analytics while ColdAF handles the campaign logic, sequencing, and lead management.

## You can configure SendGrid in just a few steps. Here's how to do it:

1. In a separate browser tab, log in to your SendGrid account and navigate to **Settings** > **API Keys** in the left sidebar.
2. On the **API Keys** page, click **Create API Key** at the top-right.
3. In the form that appears, enter "ColdAF" as the **API Key Name** so you can identify it later.
4. In the permissions section, select **Full Access**. This is required for sending, event tracking, and bounce handling.
5. Click **Create & View**, then copy the generated API key immediately. SendGrid will only show it once.
6. Switch back to ColdAF. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the panel that opens, click **Add Account**.
7. In the **Add Account** form, select **SendGrid** from the **Provider** dropdown.
8. Paste the copied API key into the **API Key** field. Enter your SendGrid domain in the **Domain** field.
9. In the **Daily Send Limit** field, enter a number that matches your SendGrid plan and reputation. For example, 500 for a warmed account.
10. Click **Test Connection** to verify the key works, then click **Save** at the top-right.

That's it! Now ColdAF can send emails through SendGrid and pull delivery events automatically.

## Notes

- Keep the API key secret. It has full sending access. Store it in a password manager and never paste it into chat or shared documents.
- You can create multiple SendGrid accounts in ColdAF if you manage different brands. Assign each to the correct brand in the **Brands** section.
- SendGrid tracks bounces, spam reports, and opens via their own API. ColdAF syncs these events into your **Analytics** and **Reports** pages automatically.
- If you rotate your SendGrid API key, remember to update it in ColdAF immediately. Old keys will cause campaigns to fail with authentication errors.

## Related Articles

- How to Add an SMTP Account in ColdAF
- How to Configure Mailgun in ColdAF
- How to Monitor SMTP Health in ColdAF
