# How to Import Leads from Google Sheets in ColdAF

**Last Update:** July 2026

**Post ID:** 137

If your lead data lives in Google Sheets, you do not need to download and re-upload CSVs every time something changes. The **google sheets leads import coldaf** integration lets you sync a live spreadsheet directly into your workspace. This is ideal for teams that collect leads through forms, landing pages, or shared sheets and want to **auto import leads cold outreach** without manual steps. Learning how to **sync google sheets cold email** setups will keep your pipeline fresh and reduce the risk of stale data.

## You can import leads from Google Sheets in just a few steps. Here's how to do it:

1. From the main navigation, go to **Integrations**.
2. Click **Google Sheets** from the list of available integrations.
3. Click **Add Connection** to start linking a new sheet.
4. Paste the Google Sheet URL into the input field.
5. Select the specific sheet tab you want to import from if the spreadsheet has multiple tabs.
6. Set your column mapping so ColdAF knows which columns correspond to lead fields.
7. Set the polling interval, for example, **60 seconds**, so ColdAF checks for new rows regularly.
8. Enable auto-import to allow new rows to be added automatically without manual approval.
9. Click **Save** to activate the connection.
10. Go to **Leads** to confirm the imported leads are visible and properly mapped.

That's it! Now you can **sync google sheets cold email** data automatically and keep your lead list current.

## Notes

- The sheet must be shared or publicly accessible so ColdAF can read it. Share the sheet with **Anyone with link** or a service account.
- Polling checks for new rows at the interval you set. Only new rows are imported; existing rows are skipped to avoid duplicates.
- Row changes in the source sheet do not auto-update existing leads in ColdAF. Updates must be done manually or through a new import.
- You can disconnect the integration anytime without deleting leads that have already been imported.
- If the sheet structure changes, update the column mapping in the integration settings to avoid import errors.

## Related Articles

- How to Connect Google Sheets to ColdAF
- How to Import Leads from a CSV File in ColdAF
- How to Set Up a Webhook for Lead Intake in ColdAF
- How to Assign Leads to a Campaign in ColdAF
