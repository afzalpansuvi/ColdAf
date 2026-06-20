# How to Connect Google Sheets to ColdAF

**Last Update:** July 2026

**Post ID:** 161

Manually importing leads every time your source data changes is a waste of time and prone to errors. By connecting **Google Sheets** directly to ColdAF, you can set up an automatic polling integration that watches your spreadsheet for new rows and imports them into your lead list without any manual effort. This is ideal for teams that collect leads through forms, landing pages, or shared team spreadsheets and want their **cold outreach** pipeline to stay current. This article shows you how to link a Google Sheet, map your columns, and enable auto-import.

## You can connect Google Sheets to ColdAF in just a few steps. Here's how to do it:

1. Go to the **Integrations** page from the main navigation.
2. Click **Google Sheets** in the available integrations list.
3. Click **Add Connection** to start a new link.
4. Paste the **Google Sheet URL** into the input field.
5. Authenticate with Google if prompted to grant ColdAF access.
6. Select the specific **sheet tab** you want to import from.
7. Map the columns. For example, map **Name**, **Email**, **Company**, and any other custom fields.
8. Set the polling interval. For example, enter **60 seconds** so ColdAF checks frequently.
9. Enable **Auto-Import** to automatically pull new rows as they appear.
10. Click **Save Connection** to store the configuration.
11. Test the setup by clicking **Sync Now** to pull data immediately.

That's it! Now your Google Sheet will automatically feed new leads into ColdAF on your chosen schedule.

## Notes

- The sheet must be shared appropriately or use a **service account** for ColdAF to access it.
- Polling checks for new rows at each interval you set. Only **new rows** are imported.
- Existing rows are not re-synced, and changes to existing rows do not update existing leads.
- You can create multiple sheet connections to pull from different sources simultaneously.
- Disconnecting a sheet removes the integration but does not delete leads already imported.
- The import logs show success or failure per row, so you can troubleshoot specific entries.

## Related Articles

- How to Import Leads from Google Sheets
- How to Set Up a Webhook for Lead Intake
- How to Import Leads from a CSV File
