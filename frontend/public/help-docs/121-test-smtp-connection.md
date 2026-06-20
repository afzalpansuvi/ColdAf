# How to Test Your SMTP Connection in ColdAF

**Last Update:** July 2026

**Post ID:** 121

There is nothing worse than launching a campaign and discovering that none of your emails went out. A quick connection test prevents that nightmare. Knowing how to test smtp connection coldaf functionality before you schedule a campaign gives you confidence that your credentials, ports, and network settings are all correct. It is a simple habit that separates professional outreach operators from amateurs.

If you are struggling to verify email server cold outreach readiness, ColdAF runs a live test that sends a real message through your configured account. This article shows you exactly how to run that test, interpret the results, and fix common failures so your cold email pipeline stays reliable.

## You can test your SMTP connection in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the panel that opens, locate the account you want to test.
2. In the **SMTP Accounts** list, in the **Actions** column at the right side of the target account's row, click **Test Connection**.
3. Wait for the test to complete. The spinner typically runs for 5 to 15 seconds depending on the provider.
4. Review the success or failure message that appears in the modal. A green check means the account is ready to send.
5. If the test failed, click **View Details** in the modal to see the exact error message.
6. Check that your **Host**, **Port**, **Username**, and **Password** or **API Key** are correct. Verify the port is open and your firewall allows outbound SMTP traffic.
7. Make any corrections in the account form, click **Save**, then click **Test Connection** again to retest.

That's it! Now you know whether this account can reliably deliver emails before you attach it to a live campaign.

## Notes

- The test sends a real email to a ColdAF test inbox. It uses the exact same credentials and routing that your campaigns will use, so a passing test is a strong signal of readiness.
- If the test fails, check these common causes in order: host is reachable from your server, port is open, credentials are valid, and two-factor authentication is disabled for app passwords on Gmail or Microsoft accounts.
- Test results show permanently in the account status column on the **SMTP Accounts** page. A recent passing test is displayed as a green indicator; a recent failure is displayed as red.
- For API-based providers like SendGrid and Mailgun, test failures usually mean the API key is revoked, expired, or missing required permissions. Regenerate the key if needed.

## Related Articles

- How to Add an SMTP Account in ColdAF
- How to Troubleshoot SMTP Errors in ColdAF
- How to Connect Gmail via OAuth in ColdAF
