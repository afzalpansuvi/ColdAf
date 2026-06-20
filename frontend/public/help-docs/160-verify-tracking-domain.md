# How to Verify Your Tracking Domain DNS

**Last Update:** July 2026

**Post ID:** 160

Setting up a **custom tracking domain** is one of the best ways to protect your deliverability and brand reputation, but the setup only works if your DNS records are configured correctly. Learning how to **verify tracking domain DNS** inside ColdAF helps you catch typos, misaligned records, or propagation delays before they break your tracking. Whether you are using Cloudflare, GoDaddy, Namecheap, or another provider, this guide walks you through the exact steps to add the required CNAME records and confirm they are live in ColdAF.

## You can verify your tracking domain DNS in just a few steps. Here's how to do it:

1. After adding your domain in ColdAF, note the **CNAME values** shown on the setup screen.
2. Log in to your DNS provider. Common providers include Cloudflare, GoDaddy, or Namecheap.
3. Find the DNS records section in your provider dashboard.
4. Add a **CNAME record**: enter your subdomain name in the name field, for example **track**.
5. Enter the ColdAF target value in the value field, for example **coldaf.example.com**.
6. Set the **TTL** to **300** (5 minutes) for faster propagation.
7. Save the new record.
8. Wait **5 to 30 minutes** for DNS propagation across the internet.
9. Return to ColdAF and click **Verify Domain** to confirm the records are detected.

That's it! Now your tracking domain is verified and ready to use for open and click tracking.

## Notes

- If verification fails, double-check that you added a **CNAME record**, not an **A record**.
- Check for typos or extra dots in the name and value fields.
- DNS propagation can take time. Use a tool like dnschecker.org to confirm global propagation.
- Some DNS providers automatically append the root domain. Do not include the root domain in the name field unless required by your provider.
- **SSL verification** may take longer than DNS verification. If DNS is verified but SSL is pending, wait a bit longer and retry.
- If you are stuck, use command-line tools like **dig** or **nslookup** to test the record directly, or contact your DNS provider support.

## Related Articles

- How to Add a Custom Tracking Domain
- How to Create a Brand in ColdAF
- How to Improve Your Email Deliverability
