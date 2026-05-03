export const getMockData = (method, path) => {
  if (import.meta.env.PROD) {
    console.warn(`[ColdAF] API unavailable — returning mock data for ${method} ${path}. Check backend connectivity.`);
  }
  
  if (method === 'GET' || !method) {
    // ----------------------------------------
    // DASHBOARD & ANALYTICS
    // ----------------------------------------
    if (path.includes('/analytics/overview')) {
      return {
        data: {
          totalSent: 12500,
          delivered: 11980,
          opened: 4200,
          replied: 850,
          bounced: 520,
          openRate: 33.6,
          replyRate: 6.8,
          bounceRate: 4.16,
          positiveReplies: 240,
          positiveReplyRate: 32.5,
        }
      };
    }
    
    if (path.includes('/analytics/timeline')) {
      return {
        data: Array.from({ length: 7 }).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return {
            date: d.toISOString().split('T')[0],
            sent: Math.floor(Math.random() * 500) + 1000,
            opened: Math.floor(Math.random() * 200) + 400,
            replied: Math.floor(Math.random() * 50) + 50,
            positive: Math.floor(Math.random() * 20) + 10,
          };
        })
      };
    }

    if (path.includes('/analytics/lead-status-distribution')) {
      return {
        data: [
          { status: 'NEW', count: 4500, color: '#f3f4f6' },
          { status: 'CONTACTED', count: 2100, color: '#fef08a' },
          { status: 'REPLIED', count: 850, color: '#bae6fd' },
          { status: 'INTERESTED', count: 240, color: '#bbf7d0' },
          { status: 'NOT_INTERESTED', count: 320, color: '#fecaca' },
          { status: 'BOUNCED', count: 520, color: '#e5e7eb' },
        ]
      };
    }

    if (path.includes('/analytics/top-subjects')) {
      return {
        data: [
          { subject: 'Quick question regarding your growth goals', openRate: 45.2, replyRate: 8.5 },
          { subject: 'Idea for {{company_name}}', openRate: 42.1, replyRate: 7.2 },
          { subject: 'Your recent post on LinkedIn', openRate: 38.5, replyRate: 6.1 },
          { subject: 'Exploring synergies', openRate: 25.4, replyRate: 2.1 },
        ]
      };
    }

    if (path.includes('/analytics/funnel')) {
      return {
        data: {
          sent: 12500, delivered: 11980, opened: 4200, clicked: 1850, replied: 850,
          deliveredRate: 95.8, openRate: 33.6, clickRate: 14.8, replyRate: 6.8,
        }
      };
    }

    if (path.includes('/analytics/campaigns')) {
      return {
        data: [
          { id: '1', name: 'Q3 Enterprise Outreach', sent: 5000, delivered: 4850, opened: 2050, clicked: 820, replied: 400, openRate: 41, clickRate: 16.4, replyRate: 8 },
          { id: '2', name: 'Startup SaaS Leads', sent: 3200, delivered: 3100, opened: 1216, clicked: 496, replied: 192, openRate: 38, clickRate: 15.5, replyRate: 6 },
          { id: '3', name: 'Agency Partners', sent: 1500, delivered: 1450, opened: 435, clicked: 174, replied: 60, openRate: 29, clickRate: 11.6, replyRate: 4 },
        ]
      };
    }

    if (path.includes('/analytics/brands')) {
      return {
        data: [
          { id: '1', name: 'Acme Corp', sent: 8200, delivered: 7900, opened: 3100, replied: 600, openRate: 37.8, replyRate: 7.3 },
          { id: '2', name: 'Globex Inc', sent: 4300, delivered: 4080, opened: 1100, replied: 250, openRate: 25.6, replyRate: 5.8 },
        ]
      };
    }

    if (path.includes('/analytics/smtp-performance')) {
      return {
        data: [
          { id: '1', host: 'smtp.gmail.com', user: 'sender1@example.com', sent: 6000, delivered: 5820, bounced: 180, bounceRate: 3.0, spamRate: 0.1 },
          { id: '2', host: 'smtp.office365.com', user: 'sender2@example.com', sent: 6500, delivered: 6160, bounced: 340, bounceRate: 5.2, spamRate: 0.3 },
        ]
      };
    }

    if (path.includes('/analytics/send-time-heatmap')) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return {
        data: days.map(day => ({
          day,
          hours: Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            openRate: h >= 8 && h <= 18 ? Math.random() * 40 + 10 : Math.random() * 10,
          }))
        }))
      };
    }

    if (path.includes('/analytics/response-times')) {
      return {
        data: {
          avgResponseHours: 4.2,
          medianResponseHours: 2.8,
          under1h: 22,
          under4h: 45,
          under24h: 78,
          over24h: 22,
        }
      };
    }

    if (path.includes('/analytics/compare')) {
      return {
        data: {
          period1: { sent: 6500, opened: 2200, replied: 450, openRate: 33.8, replyRate: 6.9 },
          period2: { sent: 6000, opened: 1900, replied: 400, openRate: 31.7, replyRate: 6.7 },
          changes: { sent: 8.3, opened: 15.8, replied: 12.5, openRate: 6.6, replyRate: 3.0 },
        }
      };
    }

    if (path.includes('/brands')) {
      return {
        data: [
          { id: '1', name: 'Acme Corp', logo: 'https://ui-avatars.com/api/?name=Acme+Corp&background=random' },
          { id: '2', name: 'Globex Inc', logo: 'https://ui-avatars.com/api/?name=Globex+Inc&background=random' },
        ]
      };
    }

    // ----------------------------------------
    // CAMPAIGNS
    // ----------------------------------------
    if (path.match(/\/campaigns\/\w+\/leads/)) {
      return {
        data: Array.from({ length: 20 }).map((_, i) => ({
          id: `lead_${i}`,
          first_name: `Demo User ${i}`,
          last_name: `Test ${i}`,
          company: `Firm ${i} LLC`,
          email: `demo${i}@firm${i}.com`,
          status: ['CONTACTED', 'REPLIED', 'INTERESTED', 'BOUNCED'][Math.floor(Math.random() * 4)],
        })),
        pagination: { total: 250, page: 1, limit: 20, totalPages: 13 }
      };
    }

    if (path.match(/\/campaigns\/\w+/)) {
      return {
        data: {
          id: path.split('/').pop(),
          name: 'Demo Campaign ' + Math.floor(Math.random() * 100),
          status: 'ACTIVE',
          brand_id: '1',
          created_at: new Date().toISOString(),
          stats: {
            total_leads: 250,
            emails_sent: 120,
            opens: 45,
            replies: 12,
            bounces: 3
          },
          sequences: [
            { step: 1, subject: 'Demo Step 1', content: 'Hi {{first_name}},\n\nJust reaching out!', delay_days: 0 },
            { step: 2, subject: 'Follow up', content: 'Any thoughts?', delay_days: 3 }
          ]
        }
      };
    }

    if (path.includes('/campaigns')) {
      const qStr = path.includes('?') ? path.split('?')[1] : '';
      const qp = new URLSearchParams(qStr);
      const search = (qp.get('search') || '').toLowerCase().trim();
      const statusFilter = qp.get('status') || '';
      const allCampaigns = [
        { id: 'c1', name: 'Q3 Enterprise Outreach', status: 'ACTIVE', brandNames: ['Acme Corp'], createdAt: new Date().toISOString(), totalSent: 4850, totalOpened: 2050, totalReplied: 400 },
        { id: 'c2', name: 'Startup SaaS Leads', status: 'PAUSED', brandNames: ['Acme Corp'], createdAt: new Date().toISOString(), totalSent: 3100, totalOpened: 1216, totalReplied: 192 },
        { id: 'c3', name: 'Agency Partners Q4', status: 'COMPLETED', brandNames: ['Globex Inc'], createdAt: new Date().toISOString(), totalSent: 1450, totalOpened: 435, totalReplied: 60 },
        { id: 'c4', name: 'SMB Cold Outreach', status: 'DRAFT', brandNames: ['Acme Corp'], createdAt: new Date().toISOString(), totalSent: 0, totalOpened: 0, totalReplied: 0 },
      ];
      let filtered = allCampaigns;
      if (search) filtered = filtered.filter(c => c.name.toLowerCase().includes(search));
      if (statusFilter && statusFilter !== 'all') filtered = filtered.filter(c => c.status.toLowerCase() === statusFilter.toLowerCase());
      return {
        data: {
          campaigns: filtered,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / 15)),
        }
      };
    }

    // ----------------------------------------
    // LEADS
    // ----------------------------------------
    if (path.includes('/leads/stats')) {
      return {
        data: {
          total: 10250,
          active: 4500,
          replied: 850,
          bounced: 520,
        }
      };
    }

    if (path.includes('/leads')) {
      return {
        data: Array.from({ length: 20 }).map((_, i) => ({
          id: `lead_${i}`,
          first_name: `John ${i}`,
          last_name: `Doe ${i}`,
          email: `john.doe.${i}@example.com`,
          company: `Example ${i} Corp`,
          status: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'BOUNCED'][Math.floor(Math.random() * 5)],
          brand_name: 'Acme Corp',
          campaign_name: 'Q3 Enterprise Outreach',
          score: Math.floor(Math.random() * 100),
          created_at: new Date().toISOString(),
        })),
        pagination: { total: 10250, page: 1, limit: 20, totalPages: 513 }
      };
    }

    if (path.includes('/users')) {
      return {
        data: [
          { id: 'u1', name: 'Admin User', email: 'admin@demo.com', role: 'ADMIN' },
          { id: 'u2', name: 'Sales Rep 1', email: 'sales1@demo.com', role: 'USER' },
        ]
      };
    }

    // ----------------------------------------
    // INTEGRATIONS (Sheets, Webhooks)
    // ----------------------------------------
    if (path.includes('/integrations/sheets')) {
      return {
        data: [
          { id: '1', name: 'Main Leads Google Sheet', spreadsheet_id: '1xyz123abc', sheet_name: 'Sheet1', sync_status: 'ACTIVE', last_sync: new Date().toISOString() }
        ]
      };
    }

    if (path.includes('/integrations/webhooks')) {
      return {
        data: [
          { id: '1', name: 'Discord Bot Webhook', endpointPath: 'wh_demo123abc', endpointUrl: 'http://localhost:4000/api/webhook/leads/wh_demo123abc', brandId: '1', isActive: true, fieldMapping: {}, createdAt: new Date().toISOString() }
        ]
      };
    }

    if (path.includes('/integrations/outbound')) {
      return {
        data: [
          { id: '1', name: 'Discord Notifications', type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/123/abc', eventTriggers: ['reply_received', 'campaign_paused'], isActive: true, createdAt: new Date().toISOString() },
          { id: '2', name: 'CRM Sync', type: 'custom_webhook', url: 'https://crm.example.com/api/webhook', eventTriggers: ['reply_received'], isActive: true, createdAt: new Date().toISOString() },
        ]
      };
    }

    if (path.includes('/integrations/api-keys')) {
      return {
        data: {
          anthropic_api_key: '****abcd',
          openai_api_key: null,
          google_gemini_api_key: null,
          sendgrid_api_key: null,
          mailgun_api_key: null,
          vapi_api_key: null,
          vapi_phone_number_id: null,
          vapi_assistant_id: null,
          vapi_webhook_secret: null,
        }
      };
    }

    // ----------------------------------------
    // OTHER SETTINGS & ENDPOINTS
    // ----------------------------------------
    if (path.includes('/templates')) {
      return {
        data: [
          { id: 't1', name: 'Outreach Template 1', subject: 'Quick question {{company_name}}', content: 'Hi {{first_name}}...', is_global: true },
          { id: 't2', name: 'Follow up', subject: 'Re: Quick question', content: 'Any thoughts?', is_global: false },
        ]
      };
    }

    if (path.includes('/smtp')) {
      return {
        data: [
          { id: '1', host: 'smtp.gmail.com', port: 587, user: 'sender1@example.com', daily_limit: 100, current_usage: 25, status: 'HEALTHY' },
          { id: '2', host: 'smtp.office365.com', port: 587, user: 'sender2@example.com', daily_limit: 500, current_usage: 490, status: 'RATE_LIMITED' },
        ]
      };
    }

    if (path.includes('/replies')) {
      return {
        data: [
          { id: 'r1', lead_id: 'lead_0', from_email: 'demo0@firm0.com', subject: 'Re: Outreach', content: 'Yes, Im interested.', sentiment: 'POSITIVE', created_at: new Date().toISOString() },
        ],
        pagination: { total: 1, limit: 20, page: 1, totalPages: 1 }
      };
    }

    if (path.includes('/audit-logs/action-types')) {
      return {
        success: true,
        data: ['USER_LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'SEND'],
      };
    }

    if (path.includes('/audit-logs')) {
      return {
        success: true,
        data: {
          logs: [
            { id: 'a1', actorName: 'Admin User', actionType: 'USER_LOGIN', targetType: 'USER', description: 'Successful login', createdAt: new Date().toISOString() }
          ],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        },
      };
    }

    if (path.includes('/signatures')) {
      return {
        data: [
          { id: 's1', name: 'Default Signature', content_html: '<p>Best, John</p>' }
        ]
      };
    }

    if (path.includes('/settings')) {
      return { data: {} };
    }

    if (path.includes('/notifications/unread-count')) {
      return { data: { count: 3 } };
    }

    if (path.startsWith('/notifications')) {
      return {
        data: {
          notifications: [
            { id: '1', type: 'reply_received', title: 'New reply from John Smith', message: 'Interested in learning more about your offering.', is_read: false, created_at: new Date(Date.now() - 5 * 60000).toISOString() },
            { id: '2', type: 'gmail_expired', title: 'Gmail account needs reconnection', message: 'sales@yourcompany.com OAuth token has expired. Reconnect to resume sending.', is_read: false, created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
            { id: '3', type: 'campaign_paused', title: 'Campaign auto-paused', message: 'Campaign "Q1 Outreach" was paused due to high bounce rate (8.3%).', is_read: true, created_at: new Date(Date.now() - 24 * 3600000).toISOString() },
          ]
        }
      };
    }

    if (path.includes('/phone-calls/knowledge')) {
      return { data: [] };
    }

    if (path.includes('/phone-calls/agent/call-script')) {
      return { data: { vapi_custom_first_message: '', vapi_system_prompt: '', vapi_knowledge_enabled: 'true' } };
    }

    if (path.includes('/ai/usage/summary')) {
      const days = 30;
      return {
        data: {
          totals: { inputTokens: 2450000, outputTokens: 890000, totalTokens: 3340000, estimatedCost: 12.45, requestCount: 342 },
          daily: Array.from({ length: days }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
            return {
              date: d.toISOString().split('T')[0],
              inputTokens: Math.floor(Math.random() * 120000) + 30000,
              outputTokens: Math.floor(Math.random() * 50000) + 10000,
              cost: parseFloat((Math.random() * 0.8 + 0.1).toFixed(2)),
              requestCount: Math.floor(Math.random() * 15) + 3,
            };
          }),
          byProvider: [
            { provider: 'anthropic', inputTokens: 2000000, outputTokens: 700000, cost: 9.50, requestCount: 280 },
            { provider: 'openai', inputTokens: 350000, outputTokens: 150000, cost: 2.25, requestCount: 50 },
            { provider: 'google_gemini', inputTokens: 100000, outputTokens: 40000, cost: 0.70, requestCount: 12 },
          ],
          byModel: [
            { model: 'claude-haiku-4-5', provider: 'anthropic', inputTokens: 1800000, outputTokens: 600000, cost: 4.80, requestCount: 250 },
            { model: 'claude-sonnet-4-6', provider: 'anthropic', inputTokens: 200000, outputTokens: 100000, cost: 4.70, requestCount: 30 },
            { model: 'gpt-4o-mini', provider: 'openai', inputTokens: 350000, outputTokens: 150000, cost: 2.25, requestCount: 50 },
            { model: 'gemini-2.0-flash', provider: 'google_gemini', inputTokens: 100000, outputTokens: 40000, cost: 0.70, requestCount: 12 },
          ],
          bySource: {
            agent: { inputTokens: 1500000, outputTokens: 500000, cost: 5.50, requestCount: 150 },
            chat: { inputTokens: 950000, outputTokens: 390000, cost: 6.95, requestCount: 192 },
          },
        },
      };
    }

    if (path.includes('/ai/usage/limits')) {
      return {
        data: {
          limits: { monthlyTokenLimit: 5000000, monthlyCostLimit: 50.00, alertAtPercent: 80 },
          currentUsage: { tokens: 3340000, cost: 12.45, percentTokens: 66.8, percentCost: 24.9 },
        },
      };
    }

    if (path.includes('/ai/usage/pricing')) {
      return {
        data: {
          anthropic: { 'claude-haiku-4-5': { inputPer1M: 1.00, outputPer1M: 5.00 }, 'claude-sonnet-4-6': { inputPer1M: 3.00, outputPer1M: 15.00 }, 'claude-opus-4-6': { inputPer1M: 15.00, outputPer1M: 75.00 } },
          openai: { 'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 }, 'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 } },
          google_gemini: { 'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.00 }, 'gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 } },
        },
      };
    }

    if (path.match(/\/ai\/agent\/agents\/[a-z-]+$/)) {
      const slug = path.split('/').pop();
      return {
        data: {
          agent: {
            id: `agent_${slug}`, slug, name: slug === 'ceo' ? 'CEO Agent' : slug === 'cold-email' ? 'Cold Email Specialist' : slug === 'cold-calling' ? 'Cold Calling Specialist' : slug,
            specialty: slug === 'ceo' ? 'Oversight & Coordination' : slug === 'cold-email' ? 'Email Outreach' : 'Phone Calls',
            description: 'Built-in specialist agent', model: 'claude-haiku-4-5', isBuiltin: true, isEnabled: true, checkIntervalMinutes: 120,
            parentAgentId: slug === 'ceo' ? null : 'agent_ceo', parentSlug: slug === 'ceo' ? null : 'ceo', parentName: slug === 'ceo' ? null : 'CEO Agent', config: {}, lastCheckAt: null,
          },
          logs: [],
        },
      };
    }

    if (path.includes('/ai/agent/agents')) {
      return {
        data: {
          agents: [
            { id: 'agent_ceo', slug: 'ceo', name: 'CEO Agent', specialty: 'Oversight & Coordination', description: 'Oversees all specialist agents.', model: 'claude-haiku-4-5', isBuiltin: true, isEnabled: true, checkIntervalMinutes: 120, parentAgentId: null, parentSlug: null, parentName: null, config: {}, lastCheckAt: null, lastLog: null },
            { id: 'agent_cold_email', slug: 'cold-email', name: 'Cold Email Specialist', specialty: 'Email Outreach', description: 'Monitors email campaigns, bounce rates, and SMTP health.', model: 'claude-haiku-4-5', isBuiltin: true, isEnabled: true, checkIntervalMinutes: 120, parentAgentId: 'agent_ceo', parentSlug: 'ceo', parentName: 'CEO Agent', config: {}, lastCheckAt: null, lastLog: null },
            { id: 'agent_cold_calling', slug: 'cold-calling', name: 'Cold Calling Specialist', specialty: 'Phone Calls', description: 'Monitors phone call campaigns and call quality.', model: 'claude-haiku-4-5', isBuiltin: true, isEnabled: true, checkIntervalMinutes: 120, parentAgentId: 'agent_ceo', parentSlug: 'ceo', parentName: 'CEO Agent', config: {}, lastCheckAt: null, lastLog: null },
          ],
        },
      };
    }

    if (path.includes('/ai/agent/logs')) {
      return { data: { logs: [] } };
    }

    if (path.includes('/ai/agent/status')) {
      return { data: { enabled: false, intervalMinutes: 120, autoPauseEnabled: false, bounceThreshold: 5, spamThreshold: 0.1, queueBacklogLimit: 1000, aiModel: 'claude-haiku-4-5', lastCheck: null, lastStatus: null, lastSummary: null, nextScheduledCheck: null } };
    }

    if (path.includes('/ai/agent')) {
      return { data: { enabled: false, lastRun: null, status: 'idle' } };
    }

    if (path.includes('/ai/chat/history')) {
      return { data: { messages: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } };
    }

    // ----------------------------------------
    // BILLING & USAGE
    // ----------------------------------------
    if (path.includes('/billing/plans')) {
      return {
        data: [
          { id: 'free', name: 'Free', price: 0, priceDisplay: 'Free forever', purchasable: false,
            limits: { users: 1, brands: 1, emailsPerMonth: 250, phoneMinutesPerMonth: 5 },
            features: ['1 user', '1 brand', '250 emails/mo', '5 phone min/mo', 'BYOK AI (all models)', 'Basic analytics'] },
          { id: 'starter', name: 'Starter', price: 900, priceDisplay: '$9/mo', purchasable: true,
            limits: { users: 3, brands: 2, emailsPerMonth: 10000, phoneMinutesPerMonth: 150 },
            features: ['3 users', '2 brands', '10,000 emails/mo', '150 phone min/mo', 'BYOK AI (all models)', 'Deliverability toolkit', 'Priority support'] },
          { id: 'pro', name: 'Pro', price: 2900, priceDisplay: '$29/mo', purchasable: true,
            limits: { users: 10, brands: 5, emailsPerMonth: 50000, phoneMinutesPerMonth: 400 },
            features: ['10 users', '5 brands', '50,000 emails/mo', '400 phone min/mo', 'BYOK AI (all models)', 'Public API', 'Lead enrichment', 'Saved views', 'Priority support'] },
          { id: 'agency', name: 'Agency', price: 24900, priceDisplay: '$249/mo', purchasable: true,
            limits: { users: 'Unlimited', brands: 'Unlimited', emailsPerMonth: 'Unlimited', phoneMinutesPerMonth: 'Unlimited' },
            features: ['Unlimited users', 'Unlimited brands', 'Unlimited emails/mo', 'Unlimited phone min/mo', 'BYOK AI (all models)', 'Whitelabel', 'Client portals', 'Custom domain', 'Dedicated account manager'] },
        ],
      };
    }

    if (path.includes('/billing/usage')) {
      return {
        data: {
          plan: 'pro',
          planName: 'Pro',
          planStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          trialEndsAt: null,
          trialDaysRemaining: null,
          trialExpired: false,
          stripe: {
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
            cancelAtPeriodEnd: false,
            delinquent: false,
          },
          usage: {
            emails: { used: 3420, limit: 50000, percentage: 7 },
            phoneMinutes: { used: 45.5, limit: 400, percentage: 11 },
            users: { used: 4, limit: 10 },
            brands: { used: 2, limit: 5 },
            resetAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          },
          history: Array.from({ length: 7 }).map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return { day: d.toISOString(), eventType: 'email_sent', total: Math.floor(Math.random() * 300) + 100 };
          }),
        },
      };
    }

    if (path.includes('/billing/invoices')) {
      return { data: [] };
    }

    // ----------------------------------------
    // ORGANIZATIONS
    // ----------------------------------------
    // ----------------------------------------
    // PLATFORM ADMIN (owner-only)
    // ----------------------------------------
    if (path.includes('/platform/analytics')) {
      return {
        data: {
          totalOrgs: 47,
          totalUsers: 183,
          totalEmailsSent: 1240500,
          totalRevenueCents: 418700,
          activeSubscriptions: 34,
          trialAccounts: 9,
          freeAccounts: 4,
          mrr: 418700,
        }
      };
    }

    if (path.includes('/platform/super-admins/pending')) {
      return {
        data: [
          { id: 'pa1', name: 'Sarah Connor', email: 'sarah@techfirm.io', orgName: 'TechFirm IO', reason: 'Managing 12 client accounts, need platform access for white-label setup.', requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 'pa2', name: 'Marcus Wells', email: 'marcus@agencypro.com', orgName: 'AgencyPro', reason: 'Running campaigns for 8 B2B clients, need billing oversight.', requestedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
        ]
      };
    }

    if (path.includes('/platform/super-admins')) {
      return {
        data: [
          { id: 'sa1', name: 'Platform Owner', email: 'apansuvi1@gmail.com', orgName: 'ColdAF HQ', orgCount: 47, status: 'active', createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString() },
        ]
      };
    }

    if (path.includes('/platform/organizations')) {
      return {
        data: [
          { id: 'o1', name: 'Acme Growth Agency', plan: 'agency', users: 12, emailsSent: 245000, emailsLimit: 'Unlimited', status: 'active', revenue: 24900, createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 'o2', name: 'StartupBoost LLC', plan: 'pro', users: 7, emailsSent: 38200, emailsLimit: 50000, status: 'active', revenue: 2900, createdAt: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 'o3', name: 'SalesForce Pros', plan: 'starter', users: 3, emailsSent: 6100, emailsLimit: 10000, status: 'active', revenue: 900, createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 'o4', name: 'LeadGen Masters', plan: 'pro', users: 9, emailsSent: 22000, emailsLimit: 50000, status: 'active', revenue: 2900, createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 'o5', name: 'ColdReach Demo', plan: 'free', users: 1, emailsSent: 190, emailsLimit: 250, status: 'active', revenue: 0, createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 'o6', name: 'BadActor Spammers', plan: 'starter', users: 2, emailsSent: 9800, emailsLimit: 10000, status: 'suspended', revenue: 900, createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        ]
      };
    }

    if (path.includes('/organizations/members')) {
      return {
        data: [
          { id: '1', email: 'admin@coldaf.com', fullName: 'System Admin', isActive: true, role: 'org_admin', createdAt: new Date().toISOString() },
          { id: '2', email: 'sales@coldaf.com', fullName: 'Sales User', isActive: true, role: 'sales', createdAt: new Date().toISOString() },
        ],
      };
    }

    if (path.includes('/organizations/invitations')) {
      return { data: [] };
    }

    if (path.includes('/organizations/roles')) {
      return {
        data: [
          { id: 'r1', name: 'org_admin', description: 'Organization administrator' },
          { id: 'r2', name: 'org_manager', description: 'Team and campaign manager' },
          { id: 'r3', name: 'sales', description: 'Sales representative' },
          { id: 'r4', name: 'email_manager', description: 'Email campaign manager' },
          { id: 'r5', name: 'developer', description: 'Developer access' },
        ],
      };
    }

    if (path.includes('/organizations')) {
      return {
        data: {
          id: 'dev-org',
          name: 'Dev Organization',
          slug: 'dev-org',
          plan: 'agency',
          isActive: true,
          usage: {
            emailsSent: 3420,
            phoneMinutes: 45.5,
            maxEmails: 999999,
            maxPhoneMinutes: 999999,
            maxUsers: 999999,
            maxBrands: 999999,
          },
        },
      };
    }

    // ----------------------------------------
    // ADMIN PANEL
    // ----------------------------------------
    if (path.includes('/admin/dashboard')) {
      return {
        data: {
          totalOrgs: 247,
          totalUsers: 1853,
          emailsSent30d: 482340,
          mrr: 18420,
          arr: 221040,
          churn30d: 2.4,
          activeCampaigns: 94,
          recentActivity: [
            { id: 'a1', type: 'signup', org_name: 'Rocket Growth', created_at: new Date(Date.now() - 3600000).toISOString() },
            { id: 'a2', type: 'upgrade', org_name: 'Acme Inc', detail: 'starter → pro', created_at: new Date(Date.now() - 7200000).toISOString() },
            { id: 'a3', type: 'signup', org_name: 'Beta Labs', created_at: new Date(Date.now() - 14400000).toISOString() },
            { id: 'a4', type: 'churn', org_name: 'OldCo', created_at: new Date(Date.now() - 86400000).toISOString() },
          ],
        },
      };
    }

    if (path.includes('/admin/health')) {
      return {
        data: {
          checks: [
            { name: 'PostgreSQL', status: 'healthy', latencyMs: 4, detail: '14 active connections' },
            { name: 'Redis', status: 'healthy', latencyMs: 1, detail: 'Memory: 142 MB' },
            { name: 'Email Queue', status: 'healthy', detail: '23 jobs waiting, 5 active' },
            { name: 'Workers', status: 'healthy', detail: '3 workers, last heartbeat 2s ago' },
            { name: 'Memory', status: 'healthy', detail: '62% used (4.8 GB / 8 GB)' },
            { name: 'Stripe', status: 'healthy', latencyMs: 184, detail: 'API reachable' },
          ],
        },
      };
    }

    if (path.includes('/admin/analytics')) {
      const days = path.includes('7d') ? 7 : path.includes('90d') ? 90 : 30;
      const series = Array.from({ length: days }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        return {
          date: d.toISOString().split('T')[0],
          signups: Math.floor(Math.random() * 8) + 2,
          activations: Math.floor(Math.random() * 6) + 1,
          emails: Math.floor(Math.random() * 5000) + 8000,
          replies: Math.floor(Math.random() * 300) + 400,
        };
      });
      return { data: { series } };
    }

    if (path.includes('/admin/billing')) {
      return {
        data: {
          organizations: [
            { id: 'o1', name: 'Acme Inc', plan: 'pro', stripe_status: 'active', emails_sent_this_month: 12480, created_at: '2025-11-15' },
            { id: 'o2', name: 'Rocket Growth', plan: 'agency', stripe_status: 'active', emails_sent_this_month: 48210, created_at: '2025-08-22' },
            { id: 'o3', name: 'Beta Labs', plan: 'starter', stripe_status: 'past_due', emails_sent_this_month: 840, created_at: '2026-02-01' },
            { id: 'o4', name: 'DevHouse', plan: 'pro', stripe_status: 'active', emails_sent_this_month: 8420, created_at: '2026-01-10' },
            { id: 'o5', name: 'ScaleUp', plan: 'agency', stripe_status: 'canceling', emails_sent_this_month: 21040, created_at: '2025-09-14' },
            { id: 'dev-org', name: 'Dev Organization', plan: 'agency', stripe_status: 'comped', emails_sent_this_month: 3420, created_at: '2025-01-01' },
          ],
        },
      };
    }

    if (path.includes('/admin/revenue')) {
      const history = Array.from({ length: 12 }).map((_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (11 - i));
        return {
          month: d.toISOString().slice(0, 7),
          mrr: 8000 + i * 900 + Math.floor(Math.random() * 600),
        };
      });
      return {
        data: {
          mrr: 18420,
          arr: 221040,
          churn: 2.4,
          history,
          planBreakdown: [
            { plan: 'free', count: 142 },
            { plan: 'starter', count: 58 },
            { plan: 'pro', count: 34 },
            { plan: 'agency', count: 13 },
          ],
        },
      };
    }

    if (path.includes('/admin/discount-codes')) {
      return {
        data: {
          codes: [
            { id: 'd1', code: 'SUMMER20', type: 'percent', amount: 20, times_used: 47, max_uses: 100, expires_at: '2026-08-31', applies_to_plan: null, is_active: true },
            { id: 'd2', code: 'LAUNCH50', type: 'percent', amount: 50, times_used: 231, max_uses: null, expires_at: null, applies_to_plan: 'pro', is_active: true },
            { id: 'd3', code: 'BLACKFRI', type: 'fixed', amount: 50, times_used: 89, max_uses: 200, expires_at: '2025-12-01', applies_to_plan: null, is_active: false },
          ],
        },
      };
    }

    if (path.includes('/admin/license-keys')) {
      return {
        data: {
          keys: [
            { id: 'k1', key: 'COLD-AF42-PRO7-X9K2', plan: 'pro', seats: 5, status: 'active', org_name: 'Acme Inc', expires_at: '2027-01-01' },
            { id: 'k2', key: 'COLD-BF83-AGY1-M4L7', plan: 'agency', seats: 20, status: 'active', org_name: 'Rocket Growth', expires_at: null },
            { id: 'k3', key: 'COLD-CC19-PRO2-H8N3', plan: 'pro', seats: 5, status: 'unused', org_name: null, expires_at: '2027-06-30' },
            { id: 'k4', key: 'COLD-DD56-STR3-P2Q6', plan: 'starter', seats: 1, status: 'revoked', org_name: null, expires_at: null },
          ],
        },
      };
    }

    if (path.includes('/admin/affiliates')) {
      return {
        data: {
          affiliates: [
            { id: 'af1', user_name: 'Jane Smith', user_email: 'jane@agency.com', code: 'JANE25', commission_pct: 25, referral_count: 12, total_earned: 842, total_paid: 600, status: 'approved' },
            { id: 'af2', user_name: 'Mike Chen', user_email: 'mike@consult.io', code: 'MIKE20', commission_pct: 20, referral_count: 4, total_earned: 198, total_paid: 0, status: 'approved' },
            { id: 'af3', user_name: 'Ana Rivera', user_email: 'ana@marketing.co', code: 'ANA30', commission_pct: 30, referral_count: 0, total_earned: 0, total_paid: 0, status: 'pending' },
          ],
        },
      };
    }

    if (path.includes('/admin/pro-users')) {
      return {
        data: {
          users: [
            { id: 'pu1', full_name: 'Sarah Johnson', email: 'sarah@acme.com', org_name: 'Acme Inc', plan: 'pro', seats: 5, seats_used: 4, mrr_contribution: 99, emails_sent_30d: 12480, created_at: '2025-11-15' },
            { id: 'pu2', full_name: 'David Park', email: 'david@rocket.io', org_name: 'Rocket Growth', plan: 'agency', seats: 20, seats_used: 18, mrr_contribution: 299, emails_sent_30d: 48210, created_at: '2025-08-22' },
            { id: 'pu3', full_name: 'Leah Goldberg', email: 'leah@devhouse.co', org_name: 'DevHouse', plan: 'pro', seats: 3, seats_used: 3, mrr_contribution: 99, emails_sent_30d: 8420, created_at: '2026-01-10' },
          ],
        },
      };
    }

    if (path.includes('/admin/users')) {
      return {
        data: {
          users: [
            { id: 'u1', full_name: 'Sarah Johnson', email: 'sarah@acme.com', org_name: 'Acme Inc', plan: 'pro', role_name: 'owner', last_login_at: '2026-04-22T10:30:00Z', is_active: true },
            { id: 'u2', full_name: 'David Park', email: 'david@rocket.io', org_name: 'Rocket Growth', plan: 'agency', role_name: 'owner', last_login_at: '2026-04-22T08:15:00Z', is_active: true },
            { id: 'u3', full_name: 'Tom Wright', email: 'tom@beta.com', org_name: 'Beta Labs', plan: 'starter', role_name: 'member', last_login_at: '2026-04-20T14:00:00Z', is_active: true },
            { id: 'u4', full_name: 'Emma Liu', email: 'emma@freemail.com', org_name: null, plan: 'free', role_name: 'owner', last_login_at: '2026-03-15T11:00:00Z', is_active: false },
            { id: 'u5', full_name: 'Leah Goldberg', email: 'leah@devhouse.co', org_name: 'DevHouse', plan: 'pro', role_name: 'admin', last_login_at: '2026-04-21T19:45:00Z', is_active: true },
          ],
        },
      };
    }

    if (path.includes('/admin/admins')) {
      return {
        data: {
          admins: [
            { id: 'ad1', full_name: 'Platform Owner', email: 'apansuvi1@gmail.com', role: 'platform_owner', created_at: '2025-01-01', last_login_at: '2026-04-22', is_platform_owner: true },
            { id: 'ad2', full_name: 'Support Lead', email: 'support@coldaf.com', role: 'support_admin', created_at: '2025-06-12', last_login_at: '2026-04-21', is_platform_owner: false },
          ],
        },
      };
    }

    if (path.includes('/admin/content/templates')) {
      return {
        data: {
          templates: [
            { id: 't1', name: 'SaaS Cold Outreach', subject: 'Quick question about {{company}}', category: 'outreach', usage_count: 1240, updated_at: '2026-04-10' },
            { id: 't2', name: 'Follow-up #1', subject: 'Circling back on {{topic}}', category: 'follow-up', usage_count: 892, updated_at: '2026-04-15' },
            { id: 't3', name: 'Agency Partnership', subject: 'Partnership idea', category: 'partnership', usage_count: 310, updated_at: '2026-03-28' },
          ],
        },
      };
    }

    if (path.includes('/admin/content/changelog')) {
      return {
        data: {
          entries: [
            { id: 'c1', version: 'v3.2.0', title: 'Gmail OAuth Multi-Account Support', body: 'Connect unlimited Gmail accounts per org with native OAuth. Automatic rotation across accounts in campaigns.', published_at: '2026-04-22' },
            { id: 'c2', version: 'v3.1.0', title: 'Admin Panel Launch', body: 'Brand new platform admin panel with 15 sections: dashboard, health, analytics, billing, revenue, and more.', published_at: '2026-04-22' },
            { id: 'c3', version: 'v3.0.5', title: 'Collapsible Sidebar', body: 'Sidebar can now be collapsed to save screen real estate on smaller displays.', published_at: '2026-04-18' },
          ],
        },
      };
    }

    if (path.includes('/admin/ai-usage')) {
      return {
        data: {
          requestCount: 84320,
          byProvider: [
            { provider: 'openai', tokens: 12400000, cost: 248.50 },
            { provider: 'anthropic', tokens: 8200000, cost: 186.20 },
            { provider: 'google', tokens: 3100000, cost: 42.80 },
          ],
          topSpenders: [
            { org_name: 'Rocket Growth', plan: 'agency', tokens: 4800000, request_count: 18420, cost: 96.40 },
            { org_name: 'Acme Inc', plan: 'pro', tokens: 2100000, request_count: 8240, cost: 42.10 },
            { org_name: 'DevHouse', plan: 'pro', tokens: 1800000, request_count: 7420, cost: 36.80 },
            { org_name: 'ScaleUp', plan: 'agency', tokens: 1500000, request_count: 6100, cost: 30.20 },
          ],
        },
      };
    }

    if (path.includes('/admin/security/audit')) {
      const actions = ['user.login', 'user.login.failed', 'user.signup', 'campaign.send', 'admin.action', 'user.logout'];
      const events = Array.from({ length: 25 }).map((_, i) => ({
        id: `ev${i}`,
        action: actions[Math.floor(Math.random() * actions.length)],
        user_email: ['sarah@acme.com', 'david@rocket.io', 'tom@beta.com', 'unknown@attack.ru'][Math.floor(Math.random() * 4)],
        target_type: 'campaign',
        target_id: Math.floor(Math.random() * 100),
        ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        created_at: new Date(Date.now() - i * 180000).toISOString(),
      }));
      return { data: { events } };
    }

    if (path.includes('/admin/security/failed-logins')) {
      return {
        data: {
          attempts: [
            { email: 'attack@evil.ru', ip_address: '185.220.101.42', attempts: 23, last_attempt_at: new Date(Date.now() - 600000).toISOString() },
            { email: 'admin@coldaf.com', ip_address: '45.142.214.88', attempts: 11, last_attempt_at: new Date(Date.now() - 1800000).toISOString() },
            { email: 'sarah@acme.com', ip_address: '72.14.203.10', attempts: 3, last_attempt_at: new Date(Date.now() - 3600000).toISOString() },
          ],
        },
      };
    }

    if (path.match(/\/admin\/requests\/[^/]+$/)) {
      return {
        data: {
          request: {
            id: 'rq1',
            subject: 'Gmail OAuth reconnect loop',
            body: 'After disconnecting my Gmail, reconnecting takes me through the consent screen but then shows "Token exchange failed". Can you look?',
            user_email: 'sarah@acme.com',
            org_name: 'Acme Inc',
            status: 'open',
            priority: 'high',
            created_at: new Date(Date.now() - 7200000).toISOString(),
            messages: [
              { id: 'm1', author_email: 'support@coldaf.com', from_admin: true, body: "Hi Sarah — looking into this now. Can you share the browser console error?", created_at: new Date(Date.now() - 5400000).toISOString() },
              { id: 'm2', author_email: 'sarah@acme.com', from_admin: false, body: 'Here it is: "invalid_grant: Token has been expired or revoked."', created_at: new Date(Date.now() - 3600000).toISOString() },
            ],
          },
        },
      };
    }

    if (path.includes('/admin/requests')) {
      return {
        data: {
          requests: [
            { id: 'rq1', subject: 'Gmail OAuth reconnect loop', body: 'After disconnecting my Gmail…', user_email: 'sarah@acme.com', org_name: 'Acme Inc', status: 'open', priority: 'high', updated_at: new Date(Date.now() - 3600000).toISOString() },
            { id: 'rq2', subject: 'Billing invoice mismatch', body: 'My March invoice shows $299 but I was on pro…', user_email: 'david@rocket.io', org_name: 'Rocket Growth', status: 'pending', priority: 'normal', updated_at: new Date(Date.now() - 14400000).toISOString() },
            { id: 'rq3', subject: 'How to add custom tracking domain?', body: 'I want to use emails.mydomain.com…', user_email: 'tom@beta.com', org_name: 'Beta Labs', status: 'open', priority: 'low', updated_at: new Date(Date.now() - 86400000).toISOString() },
            { id: 'rq4', subject: 'Campaign stopped mid-send', body: 'My campaign #42 stopped at 450/1000…', user_email: 'leah@devhouse.co', org_name: 'DevHouse', status: 'resolved', priority: 'urgent', updated_at: new Date(Date.now() - 172800000).toISOString() },
            { id: 'rq5', subject: 'Feature request: Slack integration', body: 'Would love native Slack alerts when…', user_email: 'emma@freemail.com', org_name: null, status: 'closed', priority: 'low', updated_at: new Date(Date.now() - 604800000).toISOString() },
          ],
        },
      };
    }
  }

  if (method === 'PUT' && path.match(/^\/notifications\/[^/]+$/)) {
    return { data: { success: true } };
  }

  // Template spam-check
  if (method === 'POST' && path.includes('/templates/spam-check')) {
    return { data: { success: true, score: 1.5, level: 'good', flags: [{ id: 'NO_UNSUBSCRIBE', description: 'Missing unsubscribe link', score: 1.5 }] } };
  }

  // Template preview
  if (method === 'POST' && path.includes('/templates/preview')) {
    return { data: { success: true, html: '<html><body><p>Email preview (demo mode)</p></body></html>', subject: 'Preview' } };
  }

  // Fallback for POST/PUT/DELETE
  return { status: 'success', data: { id: 'mock_id', message: 'Simulated success response in Demo Mode.' }, message: 'Simulated success' };
};
