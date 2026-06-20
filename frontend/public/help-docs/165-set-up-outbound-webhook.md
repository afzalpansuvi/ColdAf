# How to Set Up an Outbound Webhook

**Last Update:** July 2026

**Post ID:** 165

When your outreach tool generates events like sends, opens, replies, and lead creations, you often want those events to trigger actions in other systems. Setting up an **outbound webhook** in ColdAF lets you push real-time event notifications to your own endpoints, whether that is a Slack channel, a custom CRM, a Zapier flow, or an internal dashboard. This **event webhook** capability helps you build automated workflows around your **cold outreach** without constantly polling for updates. This article explains how to create an outbound webhook, select triggers, and test delivery.

## You can set up an outbound webhook in just a few steps. Here's how to do it:

1. Go to the **Integrations** page from the main navigation.
2. Click the **Outbound Webhooks** tab to manage outgoing event notifications.
3. Click **Create Outbound Webhook** to start the configuration.
4. Name the webhook so you can identify it in the list.
5. Select the trigger events you want to send. For example, choose **Email Sent**, **Email Opened**, **Reply Received**, or **Lead Created**.
6. Enter the target URL. This is the endpoint on your system that will receive the events.
7. Set the payload format to **JSON**.
8. Add custom headers if your endpoint requires authentication or specific content-type settings.
9. Test the connection by clicking **Send Test Event** to deliver a sample payload.
10. Review the **Delivery Log** to confirm the test event arrived successfully.
11. Save and activate the webhook to start sending live events.

That's it! Now your systems will receive real-time event notifications from ColdAF automatically.

## Notes

- **Outbound webhooks** push events from ColdAF to your external systems in real time.
- Common use cases include sending lead events to Slack, updating a CRM, or triggering Zapier and Make flows.
- The payload includes the event type, timestamp, and all relevant data for that event.
- ColdAF retries failed deliveries with an exponential backoff strategy to avoid spamming your endpoint.
- Delivery logs show success or failure status for every event sent, so you can audit easily.
- You can create multiple outbound webhooks if different systems need different events.
- Use **API keys** or request signatures to secure your endpoint and verify that events come from ColdAF.

## Related Articles

- How to Set Up a Webhook for Lead Intake
- How to Manage Your API Keys in ColdAF
- How to Connect HubSpot CRM to ColdAF
- How to Connect Google Sheets to ColdAF
