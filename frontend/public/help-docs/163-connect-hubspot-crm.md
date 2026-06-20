# How to Connect HubSpot CRM to ColdAF

**Last Update:** July 2026

**Post ID:** 163

ColdAF is built for sending and tracking outreach, but most teams already manage their contacts and deals inside a CRM. Connecting **HubSpot CRM** to ColdAF bridges the gap between your outreach tool and your customer database, so you never have to manually copy contact data back and forth. With bidirectional sync, activity logging, and automatic field mapping, this **HubSpot integration** keeps your **cold outreach** engine and your CRM aligned in real time. This guide walks you through the OAuth connection, permission setup, and sync configuration.

## You can connect HubSpot CRM to ColdAF in just a few steps. Here's how to do it:

1. Go to the **Integrations** page from the main navigation.
2. Click **HubSpot** in the CRM section of the available integrations.
3. Click **Connect HubSpot** to start the OAuth flow.
4. You will be redirected to the HubSpot login screen. Log in with your HubSpot credentials.
5. Grant the requested permissions so ColdAF can read and write contact data.
6. You will be redirected back to ColdAF after authorization is complete.
7. Configure the sync direction. Choose **ColdAF to HubSpot**, **HubSpot to ColdAF**, or **Bidirectional**.
8. Map the fields. For example, map **ColdAF Email** to **HubSpot Email** and other corresponding fields.
9. Set the sync frequency that fits your workflow.
10. Click **Save & Sync** to activate the connection.
11. Test the setup by clicking **Sync Now** to pull or push data immediately.

That's it! Now your HubSpot contacts and ColdAF leads stay in sync automatically.

## Notes

- **OAuth tokens** auto-refresh, so you do not need to manually reauthorize after setup.
- **Bidirectional sync** keeps both systems in sync, creating and updating contacts in either direction.
- **Activity logging** creates timeline events in HubSpot for every email sent, opened, clicked, and replied.
- Sync logs show per-contact success or failure, so you can troubleshoot specific records.
- Disconnecting the integration removes the token but preserves all data already synced.
- Reconnecting later restores the sync and resumes where it left off.
- Use HubSpot for CRM and pipeline management, and ColdAF for outreach execution, combining the best of both platforms.

## Related Articles

- How to Sync HubSpot Contacts with ColdAF
- How to Set Up an Outbound Webhook
- How to Import Leads from a CSV File
