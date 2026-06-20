# How to Configure Mailgun in ColdAF

**Last Update:** July 2026

**Post ID:** 123

Mailgun is a reliable choice for developers and marketers who need robust webhooks and flexible routing. If you are looking for a straightforward mailgun cold email setup, ColdAF connects directly via Mailgun's API so you can skip manual SMTP configuration. This integration is perfect for teams that want real-time bounce and complaint data pushed back into their outreach platform.

Understanding the mailgun api key coldaf flow is essential because Mailgun uses a private key for authentication rather than traditional username and password pairs. A clean mailgun integration cold outreach configuration means your campaigns benefit from Mailgun's deliverability infrastructure while ColdAF manages the sequencing, scheduling, and lead tracking.

## You can configure Mailgun in just a few steps. Here's how to do it:

1. In a separate browser tab, log in to your Mailgun account and navigate to **Settings** > **API Keys** in the top navigation.
2. On the **API Keys** page, locate your **Private API Key** and copy it to your clipboard. It starts with "key-".
3. Switch back to ColdAF. On your **Dashboard** page, click on **SMTP Accounts** in the left sidebar and in the panel that opens, click **Add Account**.
4. In the **Add Account** form, select **Mailgun** from the **Provider** dropdown.
5. Paste the copied **Private API Key** into the **API Key** field.
6. In the **Domain** field, enter your Mailgun domain exactly as it appears in Mailgun. For example, "mg.yourdomain.com".
7. In the **Daily Send Limit** field, enter a number appropriate for your account age and reputation. For example, 300 for a warmed domain.
8. Click **Test Connection** to verify that ColdAF can reach Mailgun and authenticate successfully.
9. If the test passes, click **Save** at the top-right. If it fails, double-check that the domain is verified in Mailgun and the key is correct.

That's it! Now ColdAF can send emails through Mailgun and receive webhooks for bounces and complaints.

## Notes

- Your Mailgun domain must be verified in Mailgun before ColdAF can send through it. Unverified domains will cause the test connection to fail.
- If your Mailgun account is EU-based, make sure your account settings reflect the EU region. ColdAF routes to the correct endpoint based on the domain you provide.
- Mailgun API keys start with "key-". If you accidentally paste a public key or an HTTP webhook URL, the connection test will fail.
- You can use multiple Mailgun domains per ColdAF account. This is useful if you manage several brands with different sending domains.
- Mailgun provides webhooks for bounces, complaints, and unsubscribes. ColdAF listens to these events and updates lead status automatically in the **Leads** and **Analytics** pages.

## Related Articles

- How to Add an SMTP Account in ColdAF
- How to Configure SendGrid in ColdAF
- How to Monitor SMTP Health in ColdAF
