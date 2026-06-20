# How to Add an SMTP Account in ColdAF

**Last Update:** July 2026

**Post ID:** 120

Before you can send a single cold email, you need a delivery engine. ColdAF supports multiple providers, so you can add smtp account cold email setups whether you run your own server, use SendGrid, or prefer Mailgun. Connecting your email infrastructure directly into the platform gives you full control over deliverability, daily volume, and sender reputation. It also means you are not locked into a single vendor.

A proper coldaf smtp configuration is the backbone of any serious outreach program. When you connect email server cold outreach infrastructure directly, ColdAF can run health checks, enforce send limits, and track bounces in real time. This article covers every provider type and walks you through the fields you need to fill.

## You can add an SMTP account in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the panel that opens, click **Add Account** at the top-right.
2. In the **Add Account** form, click the **Provider** dropdown and select your provider type: **SMTP** for custom servers, **SendGrid** for SendGrid API, or **Mailgun** for Mailgun API.
3. If you selected **SMTP**, enter the **Host** (e.g., smtp.gmail.com), **Port** (usually 587), **Username**, and **Password** in the fields that appear.
4. If you selected **SendGrid**, paste your **API Key** into the API key field. If you selected **Mailgun**, paste your **Private API Key** and enter your **Mailgun Domain**.
5. In the **Daily Send Limit** field, enter the maximum number of emails this account should send per day. For example, enter 100 for a new account or 500 for an established one.
6. Click **Test Connection** at the bottom of the form and wait for the verification result.
7. If the test shows a success message, click **Save** at the top-right. If it fails, double-check your credentials and port before saving.

That's it! Now your SMTP account is ready to be assigned to a brand and used in campaigns.

## Notes

- Use port 587 with STARTTLS for standard SMTP connections. Port 465 with SSL/TLS is also supported for legacy servers, but 587 is preferred.
- SendGrid and Mailgun use API keys instead of passwords. Store these keys securely because they grant full sending access.
- The daily send limit protects your sender reputation. ColdAF enforces this as a hard cap and will queue any excess emails for the next day.
- After saving, go to **Brands** and assign this account to at least one brand. An unassigned account cannot send campaign emails.
- Health checks run automatically every 24 hours. You can also trigger a manual check from the **SMTP Accounts** list.

## Related Articles

- How to Test Your SMTP Connection in ColdAF
- How to Connect Gmail via OAuth in ColdAF
- How to Monitor SMTP Health in ColdAF
- How to Troubleshoot SMTP Errors in ColdAF
