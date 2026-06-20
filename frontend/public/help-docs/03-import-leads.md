# How to Import Leads from CSV or Google Sheets into ColdAF

**Last Update:** July 2026

**Post ID:** 103

Your outreach is only as good as your lead list. ColdAF makes it simple to **import leads cold email tool** workflows with support for CSV uploads, Google Sheets syncing, and even webhook intake. Whether you have a spreadsheet from a trade show or a live Google Sheet that updates daily, you can get those contacts into ColdAF quickly. This guide covers both **csv import cold outreach** and **google sheets leads import** so your lead database stays current and your campaigns never run dry.

## You can import leads in just a few steps. Here's how to do it:

### CSV Upload

1. On your **Dashboard** page, click on **Leads** in the left sidebar, and in the page that opens, click **Import Leads** at the top right.

2. In the **Import Leads** modal, select **CSV Upload** from the tab options at the top.

3. Click **Select File** and choose your CSV file from your computer. The file should have header rows (e.g., "First Name", "Last Name", "Email", "Company").

4. In the **Column Mapping** step, drag each column from your CSV to the matching ColdAF field. At minimum, map **Email**. Recommended fields include **First Name**, **Last Name**, **Company**, and **Title**.

5. Click **Preview Data** to review the first 10 rows before importing. Verify that the mapping looks correct and that email addresses are properly formatted.

6. Click **Confirm Import** to finish. ColdAF will process the file, verify emails, flag duplicates, and add the leads to your database.

### Google Sheets

1. On your **Dashboard** page, click on **Integrations** in the left sidebar, and in the page that opens, click **Connect Google Sheets**.

2. In the Google authorization prompt, select your account and grant ColdAF permission to read your spreadsheets.

3. Return to **Leads**, click **Import Leads**, and select the **Google Sheets** tab. Paste your sheet URL and choose the worksheet (tab) that contains your lead data.

4. Set the **Polling Interval** (default is every 60 seconds). ColdAF will check the sheet for new rows automatically.

5. Map the columns the same way you would for a CSV upload, then click **Save Connection**.

That's it! Now your leads are in ColdAF and ready for campaigns.

## Notes

- Your CSV file **must include a header row** in the first line. ColdAF uses these headers to suggest column mappings automatically.
- **Email verification** runs automatically on every imported email. Leads with invalid or risky emails are flagged with a status so you can review them before adding them to a campaign.
- **Duplicate emails** are detected automatically. If an email already exists in your database, ColdAF will skip the duplicate row and note it in the import log.
- Google Sheets polling happens every 60 seconds by default. You can adjust this in the connection settings. New rows are imported automatically without any manual action.
- **Webhook URLs** are auto-generated for each lead source. You can find these in the **Integrations** page and use them to push leads into ColdAF from external tools like CRMs or landing pages.
- **Lead scoring** is applied automatically based on the data completeness and email quality. Higher scores appear at the top of filtered lists.

## Related Articles

- How to Create a Cold Email Campaign in ColdAF
- How to Track and Reply to Inbound Emails in ColdAF
- How to Manage Multiple Brands in ColdAF
