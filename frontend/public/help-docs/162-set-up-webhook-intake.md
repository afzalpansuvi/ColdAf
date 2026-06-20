# How to Set Up a Webhook for Lead Intake

**Last Update:** July 2026

**Post ID:** 162

If you collect leads through landing pages, form builders, CRMs, or custom applications, you need a reliable way to push that data into ColdAF automatically. Setting up an **inbound webhook** for lead intake lets any external system send lead data directly to ColdAF via a simple HTTP POST request. This is the fastest way to build a real-time **cold outreach** pipeline because leads appear in your account the moment they are captured. This guide explains how to create a webhook endpoint, configure your external system, and map incoming data to ColdAF lead fields.

## You can set up a webhook for lead intake in just a few steps. Here's how to do it:

1. Go to the **Integrations** page from the main navigation.
2. Click the **Webhooks** tab to access webhook management.
3. Click **Create Webhook** to start the setup.
4. Name the webhook so you can identify its source later.
5. Select the type **Inbound Lead Intake**.
6. ColdAF will auto-generate a unique endpoint URL for this webhook. Copy it.
7. Configure your external system to POST to this URL whenever a new lead is captured.
8. Set the payload format to **JSON** in your external system.
9. Map payload fields to ColdAF lead fields so the data lands in the right columns.
10. Test the connection by sending a sample POST request from your external system.
11. Review the **Webhook Events** log to confirm the request arrived and was processed.

That's it! Now your external systems can push leads directly into ColdAF in real time.

## Notes

- Each webhook URL is unique per source, so create separate webhooks for each external system.
- POST with a JSON body containing the lead data. Required fields include **firstName**, **lastName**, and **email**.
- Optional fields include **company**, **title**, and any custom fields you have configured.
- Webhooks are secured with a secret token to prevent unauthorized submissions.
- Requests are rate-limited per source to protect your account from overload.
- The **Webhook Events** log shows all incoming requests with success or failure status.
- Failed webhooks display error details so you can fix the payload or mapping.
- This is great for connecting CRMs, landing pages, or form builders to your **cold outreach** workflow.

## Related Articles

- How to Set Up an Outbound Webhook
- How to Connect Google Sheets to ColdAF
- How to Import Leads from a CSV File
- How to Connect HubSpot CRM to ColdAF
