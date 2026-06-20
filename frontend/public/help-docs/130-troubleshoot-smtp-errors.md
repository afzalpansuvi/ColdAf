# How to Troubleshoot SMTP Errors in ColdAF

**Last Update:** July 2026

**Post ID:** 130

SMTP errors can be frustrating because they often stop campaigns without a clear explanation. Learning how to troubleshoot SMTP errors cold email teams face every day will save you hours of downtime. Whether you're dealing with authentication failures, port issues, or provider blocks, ColdAF gives you the tools to diagnose and fix problems fast. In this guide, we'll walk through how to fix SMTP connection coldaf issues step by step so you can get back to sending.

## You can troubleshoot SMTP errors in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the **Accounts** panel that opens, find the account showing an error status.
2. In the **SMTP Accounts** list, click on the account name to open the **Account Details** panel.
3. In the **Account Details** page, in the **Error Log** section at the bottom, read the error message carefully.
4. Check common fixes based on the error: credentials mismatch, wrong port, firewall blocking, provider rate limits, or 2FA enabled.
5. For Gmail: check that you're using an app password and that "less secure apps" is properly configured. For SendGrid or Mailgun: verify the API key is still valid and hasn't been revoked.
6. After each fix, click **Test Connection** in the **Actions** panel to confirm the issue is resolved. If the error persists, contact ColdAF support with the error code.

That's it! Now you can identify and fix SMTP errors without guessing.

## Notes

- Common errors include: 535 authentication failed, 553 relay access denied, and 421 connection dropped.
- Gmail: always use app passwords, not your main account password.
- SendGrid: regenerate the API key if the old one expired or was rotated.
- Port 587 is for STARTTLS; port 465 is for SSL/TLS. Choose the one your provider requires.
- Check if your sending IP is blacklisted if authentication passes but emails still fail.

## Related Articles

- How to Test Your SMTP Connection in ColdAF
- How to Reconnect a Degraded SMTP Account
- How to Understand Blacklist Checks in ColdAF
