# How to Add Custom Tracking Domains in ColdAF

**Last Update:** July 2026

**Post ID:** 109

Deliverability is everything in cold email. If your open and click tracking pixels load from a generic shared domain, inbox providers may associate that domain with mixed reputations, which can drag your sender score down. By setting up a **custom tracking domain cold email** setup, you keep your tracking infrastructure separate from your sending domain, protecting your brand reputation and improving inbox placement over time.

ColdAF makes it easy to configure a **white label tracking domain** for every brand you manage. When a lead opens your email or clicks a link, the pixel loads from your own subdomain—something like **track.yourcompany.com**—which looks professional and keeps your deliverability clean. If you care about **cold email open tracking domain** hygiene and long-term sender health, this is one of the most important technical steps you can take after connecting your SMTP account.

## You can add a custom tracking domain in just a few steps. Here's how to do it:

1. Start with your main navigation, click on **Brands** in the left sidebar at the top and in the **Brands** page that opens, select the brand you want to configure by clicking on it.

2. In the brand detail page, click **Tracking Domains** in the tab navigation at the top.

3. In the **Tracking Domains** tab, click **Add Domain** at the top right.

4. In the **Domain Name** field at the center, enter your custom domain (for example, **track.yourcompany.com**). ColdAF will display the required **DNS CNAME records** below the input field.

5. In your DNS provider dashboard (Cloudflare, GoDaddy, Namecheap, or similar), add the CNAME records exactly as shown in ColdAF. Copy the host and value fields carefully to avoid mismatches.

6. Return to ColdAF and click **Verify Domain** in the domain row. ColdAF will check whether the DNS records have propagated and are pointing correctly.

7. Once the domain is verified, click **SSL Check** next to the domain. ColdAF will confirm that HTTPS is active on your tracking subdomain. SSL is required for secure pixel loading.

8. Click **Set as Default** in the domain row to use this domain for open and click tracking across all campaigns for this brand.

That's it! Now every open and click in your campaigns will be tracked through your own custom domain, keeping your deliverability strong and your brand consistent.

## Notes

- **Custom tracking domains** improve deliverability by keeping your sending domain reputation separate from your tracking infrastructure. This is especially important if you are sending high volume.
- Each **brand** in ColdAF can have its own tracking domain. If you manage multiple brands, configure a separate domain for each to keep reputations isolated.
- **DNS changes** may take **5 to 30 minutes** to propagate depending on your provider. If verification fails immediately, wait a few minutes and try again.
- **SSL is required** for tracking domains. ColdAF checks automatically and will warn you if the certificate is missing or invalid.
- Use a **subdomain**, not your root domain, for tracking. For example, use **track.yourcompany.com** rather than **yourcompany.com** to avoid conflicts with your main website or email infrastructure.

## Related Articles

- How to Set Up Your SMTP Account in ColdAF Email Tool
- How to Manage Multiple Brands in ColdAF
- How to Monitor Email Deliverability in ColdAF
- How to Warm Up Your Email Address in ColdAF
