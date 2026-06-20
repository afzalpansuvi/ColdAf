# How to Add a Custom Tracking Domain

**Last Update:** July 2026

**Post ID:** 159

Open and click tracking are essential for understanding how your campaigns perform, but using generic tracking domains can hurt your sender reputation. By setting up a **custom tracking domain**, you separate your brand reputation from shared tracking infrastructure, which improves deliverability and makes your emails look more professional. A **white label tracking** setup inside ColdAF gives you full control over your tracking pixels and links, so ISPs and recipients associate that activity with your domain rather than a third party. This article walks you through adding and verifying a subdomain for tracking.

## You can add a custom tracking domain in just a few steps. Here's how to do it:

1. Go to the **Brands** page from the main navigation.
2. Select the brand you want to configure.
3. Click the **Tracking Domains** tab.
4. Click **Add Domain** to start the setup.
5. Enter your subdomain. For example, type **track.yourcompany.com**.
6. Copy the DNS **CNAME records** that ColdAF displays.
7. Go to your DNS provider and add the CNAME records exactly as shown.
8. Wait **5 to 30 minutes** for DNS propagation.
9. Return to ColdAF and click **Verify Domain** to confirm the records are live.
10. Click **SSL Check** to ensure the certificate is active.
11. Click **Set as Default** to use this domain for all new campaigns under this brand.

That's it! Now you can track opens and clicks using your own branded domain.

## Notes

- A **custom tracking domain** separates your reputation from shared tracking pixels used by other senders.
- Each **brand** in ColdAF can have its own tracking domain, so multi-brand teams stay fully separated.
- Always use a **subdomain**, not your root domain, to avoid any risk to your main website reputation.
- **SSL** is required and is automatically checked during the verification process.
- Verification may fail immediately after a DNS change. Wait a few minutes and try again.
- The default domain is automatically used for all new **campaigns** created under that brand.

## Related Articles

- How to Verify Your Tracking Domain DNS
- How to Create a Brand in ColdAF
- How to Improve Your Email Deliverability
