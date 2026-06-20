# How to Reconnect a Degraded SMTP Account

**Last Update:** July 2026

**Post ID:** 127

A degraded SMTP account can quietly derail your outreach without warning. If you've noticed a dip in sends or a "Degraded" badge next to an account, you need to reconnect SMTP account coldaf quickly before queued emails stall. In this guide, we'll show you how to fix a degraded email account cold outreach setup and restore full sending capacity in just a few clicks. Understanding how to handle SMTP reconnection cold email scenarios is essential for keeping your campaigns healthy and deliverable.

## You can reconnect a degraded SMTP account in just a few steps. Here's how to do it:

1. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the **Accounts** panel that opens, find the account with a **Degraded** status badge.
2. In the **SMTP Accounts** list, in the **Status** column at the far right, click on **Reconnect** next to the degraded account.
3. For Gmail OAuth accounts: a Google authorization window appears — re-authorize with the same Google account to refresh the token. For standard SMTP accounts: re-enter your credentials if the password has recently changed.
4. In the **Connection Test** panel, in the **Actions** section at the bottom, click **Test Connection**.
5. Confirm the success message appears, then click **Save** to finalize the restored connection.

That's it! Now you can resume sending emails from that account with full confidence.

## Notes

- **Degraded** means the connection failed but may work again once reconnected.
- Common causes include: password changed, 2FA enabled, OAuth token expired, or IP blocked by the provider.
- Reconnecting preserves all campaign history, settings, and analytics tied to that account.
- If reconnection fails again, check your provider's dashboard for security blocks or new authentication requirements.
- Always test the connection before saving to confirm the fix took hold.

## Related Articles

- How to Connect Gmail via OAuth in ColdAF
- How to Test Your SMTP Connection in ColdAF
- How to Troubleshoot SMTP Errors in ColdAF
