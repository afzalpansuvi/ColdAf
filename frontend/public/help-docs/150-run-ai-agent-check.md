# How to Run an AI Agent Check Manually

**Last Update:** July 2026

**Post ID:** 150

Automated monitoring is great, but there are moments when you need immediate insight. If you want to run ai agent check coldaf workflows on demand, the manual trigger gives you full control over when health reviews happen. Performing a manual ai health check cold email review is useful right after you launch a new campaign, change SMTP settings, or notice a spike in bounces. When you trigger ai agent cold outreach checks yourself, you get a fresh report in minutes rather than waiting for the next scheduled run. This keeps you proactive instead of reactive, which is critical for protecting your sender reputation.

ColdAF runs three specialized agents: the CEO Agent monitors everything at a high level, the Cold Email Specialist focuses on deliverability and campaign performance, and the Cold Calling Specialist reviews phone outreach. Running a manual check on any of these lets you validate that recent changes are working as expected, or catch problems before they affect your bottom line. It is a simple habit that saves hours of debugging later.

## You can run an AI agent check manually in just a few steps. Here's how to do it:

1. Go to **AI Agent** from the main navigation menu.
2. Review the agent list, which includes the CEO, Cold Email Specialist, and Cold Calling Specialist.
3. Click **Run Now** on the agent you want to evaluate.
4. Wait for the check to complete, which typically takes one to two minutes depending on data volume.
5. Review the generated report that appears in the agent panel.
6. Check the proposed actions section for any recommendations the AI has made.
7. Click **Confirm** or **Dismiss** for each proposed action based on whether you agree with the recommendation.
8. Review the updated agent status to confirm the check finished successfully.

That's it! Now you have a fresh health report and can act on any recommendations immediately.

## Notes

- Agents run automatically on a default schedule: the CEO Agent runs every 60 minutes, and specialists run every 120 minutes.
- Manual checks are most useful after making changes or when you notice unexpected behavior.
- Each agent checks different things: the CEO monitors everything, the Cold Email Specialist checks campaigns and deliverability, and the Cold Calling Specialist checks phone calls.
- Reports are saved automatically in the agent logs for later review.
- If an agent fails to run, check your API key and network connection before retrying.
- Running multiple agents at the same time may increase token usage temporarily.
- You can cancel a running check if you triggered it by mistake, though partial reports may still be saved.
- Manual checks do not interfere with the automatic schedule; they run in parallel.

## Related Articles

- How to View AI Agent Logs in ColdAF
- How to Chat with the AI CEO Agent in ColdAF
- How to Monitor Email Deliverability in ColdAF
