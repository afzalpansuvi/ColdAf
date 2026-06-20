# How to Set Up Your SMTP Account in ColdAF Email Tool

**Last Update:** July 2026

**Post ID:** 101

Setting up your SMTP account is the first and most important step to start sending cold outreach emails through ColdAF. A properly configured SMTP connection ensures your messages land in inboxes instead of spam folders, and it gives you full control over your sender reputation. Whether you're using a custom SMTP server, SendGrid, or Mailgun, this guide walks you through the **smtp setup cold email** process so you can start **configure smtp for cold outreach** with confidence. A **cold email smtp account** that's correctly set up protects your domain reputation and helps you scale outreach safely.

## You can set up your SMTP account in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar, and in the panel that opens, click **Add Account**.

2. In the **Add Account** modal, in the provider dropdown at the top, click on **SMTP (Nodemailer)**, **SendGrid**, or **Mailgun** depending on which service you're using.

3. In the account form that appears, fill in your credentials. For SMTP, enter the **Host**, **Port** (use 587 with STARTTLS), **Username**, and **Password**. For SendGrid or Mailgun, paste your **API Key** into the field provided.

4. In the **Advanced Settings** section at the bottom of the form, set a **Daily Send Limit** to protect your sender reputation. ColdAF health checks will monitor this account and alert you if the limit is reached or if the connection drops.

5. Click **Test Connection** to verify that ColdAF can reach your mail server. You'll see a success or failure message within a few seconds.

6. Once the test passes, click **Save Account**. Your new account appears in the **SMTP Accounts** list with its current status.

That's it! Now you can use this account to send emails from any campaign in ColdAF.

## Notes

- **SendGrid** and **Mailgun** both use API keys rather than traditional SMTP credentials. You can find your API key in your provider dashboard.
- For custom SMTP servers, port 587 with STARTTLS is the recommended standard. Avoid using port 25 for cold email outreach.
- The **Daily Send Limit** is a hard cap. ColdAF will queue any emails beyond that limit for the next day, which helps protect your domain reputation.
- If your account shows **Degraded** or **Disconnected** in the status column, check the health check details and verify your credentials haven't changed.
- You can set up multiple SMTP accounts and rotate them across campaigns. See [How to Manage Multiple Brands in ColdAF] for details.

## Related Articles

- How to Warm Up Your Email Address in ColdAF
- How to Connect Gmail to ColdAF Using OAuth
- How to Monitor Email Deliverability in ColdAF
- How to Add Custom Tracking Domains in ColdAF
