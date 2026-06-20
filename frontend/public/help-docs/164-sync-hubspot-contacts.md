# How to Sync HubSpot Contacts with ColdAF

**Last Update:** July 2026

**Post ID:** 164

After connecting HubSpot to ColdAF, you need to understand how data actually flows between the two systems. A one-time import is rarely enough for active teams. You need ongoing **HubSpot contact sync** so new leads, updated records, and status changes reflect accurately across both platforms. With **bidirectional sync** enabled, you can avoid manual exports, prevent duplicate contacts, and keep your outreach lists current. This article shows you how to review sync status, run manual syncs, and resolve conflicts between your CRM and your outreach tool.

## You can sync HubSpot contacts with ColdAF in just a few steps. Here's how to do it:

1. Go to the **Integrations** page from the main navigation.
2. Click **HubSpot** to open the integration settings.
3. Review the current sync status to see whether the connection is active.
4. Click **Sync Now** to trigger a manual sync on demand.
5. Check the sync direction to confirm which way data is currently flowing.
6. Review the field mapping to make sure the right fields are aligned between systems.
7. Check the **Sync Logs** for detailed information about what happened in each sync run.
8. Review which contacts were synced and confirm they appear in the correct lists.
9. Check for any conflicts that may have occurred during the sync.
10. Resolve any duplicates that are flagged for manual review.

That's it! Now you can keep your HubSpot contacts and ColdAF leads aligned and up to date.

## Notes

- The first sync may take extra time if you have a large contact list in HubSpot.
- Subsequent syncs are faster because only changed records are processed.
- Sync logs show each contact with a status: **created**, **updated**, **skipped**, or **failed**.
- When conflicts occur, the last write wins based on the most recent timestamp.
- Duplicates are flagged for manual review rather than being merged automatically.
- Sync frequency options include **real-time**, **hourly**, and **daily**.
- Real-time sync uses webhooks to push changes immediately as they happen.

## Related Articles

- How to Connect HubSpot CRM to ColdAF
- How to Import Leads from a CSV File
- How to Export Leads to a CSV File
- How to View Report Delivery Logs
