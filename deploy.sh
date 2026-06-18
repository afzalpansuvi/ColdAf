#!/bin/bash
# =============================================================================
# ColdAF Deploy Script — GitHub + Coolify
# =============================================================================
# Usage:
#   export GITHUB_TOKEN="ghp_xxxxxxxx"
#   export COOLIFY_API_KEY="xxxxxxxx"
#   export COOLIFY_PROJECT_ID="your-project-id"
#   ./deploy.sh
#
# Prerequisites:
#   - Git configured with origin pointing to GitHub
#   - GITHUB_TOKEN has repo push access
#   - COOLIFY_API_KEY has deploy access
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ColdAF Deploy Script                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Check credentials ──────────────────────────────────────────
if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN environment variable is not set."
  echo "   Export it first: export GITHUB_TOKEN='ghp_xxxxxxxx'"
  exit 1
fi

if [ -z "$COOLIFY_API_KEY" ]; then
  echo "❌ COOLIFY_API_KEY environment variable is not set."
  echo "   Export it first: export COOLIFY_API_KEY='xxxxxxxx'"
  exit 1
fi

if [ -z "$COOLIFY_PROJECT_ID" ]; then
  echo "⚠️  COOLIFY_PROJECT_ID not set. Will only push to GitHub."
  echo "   To also trigger Coolify deploy, set it:"
  echo "   export COOLIFY_PROJECT_ID='your-project-id'"
  echo ""
fi

# ── Get remote URL and inject token ────────────────────────────
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE_URL" ]; then
  echo "❌ No git remote 'origin' configured."
  exit 1
fi

# Convert HTTPS URL to token-authenticated URL
if [[ "$REMOTE_URL" == https://github.com/* ]]; then
  AUTH_URL="https://${GITHUB_TOKEN}@github.com/${REMOTE_URL#https://github.com/}"
elif [[ "$REMOTE_URL" == git@github.com:* ]]; then
  echo "⚠️  Remote is SSH (git@github.com). Converting to HTTPS for token auth..."
  REPO_PATH="${REMOTE_URL#git@github.com:}"
  AUTH_URL="https://${GITHUB_TOKEN}@github.com/${REPO_PATH}"
else
  echo "❌ Unrecognized remote URL format: $REMOTE_URL"
  exit 1
fi

# ── Show what's about to be deployed ───────────────────────────
echo "▶ Changes to be deployed:"
git diff --stat
echo ""

# ── Stage and commit ───────────────────────────────────────────
if [ -n "$(git status --short)" ]; then
  echo "▶ Staging changes..."
  git add -A
  git commit -m "deploy: production hardening - $(date -u +%Y-%m-%d-%H%M)"
  echo "  ✅ Committed"
else
  echo "⚠️  No uncommitted changes. Checking if there are unpushed commits..."
fi

# ── Push to GitHub ───────────────────────────────────────────
echo "▶ Pushing to GitHub..."
git push "$AUTH_URL" HEAD:main || git push "$AUTH_URL" HEAD:master
echo "  ✅ Pushed to GitHub"

# ── Trigger Coolify deploy ───────────────────────────────────
if [ -n "$COOLIFY_PROJECT_ID" ]; then
  echo "▶ Triggering Coolify deployment..."
  
  # Try to get the Coolify instance URL from git remote or env
  COOLIFY_URL="${COOLIFY_URL:-https://coolify.ataflexsolutions.com}"
  
  # Deploy via Coolify API
  DEPLOY_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${COOLIFY_API_KEY}" \
    -H "Content-Type: application/json" \
    "${COOLIFY_URL}/api/v1/deploy?uuid=${COOLIFY_PROJECT_ID}" \
    2>/dev/null || echo "\n000")
  
  HTTP_CODE=$(echo "$DEPLOY_RESPONSE" | tail -n 1)
  
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "  ✅ Coolify deployment triggered"
  else
    echo "  ⚠️  Coolify deploy returned HTTP $HTTP_CODE"
    echo "      You may need to deploy manually from the Coolify dashboard."
  fi
fi

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "✅ Deploy complete!"
echo ""
echo "Next steps:"
echo "  1. Check the live site: https://coldaf.ataflexsolutions.com/"
echo "  2. Check health: https://coldaf.ataflexsolutions.com/api/health"
echo "  3. Test login with real credentials"
echo "  4. If anything breaks, check Coolify dashboard for logs"
echo ""
echo "⚠️  IMPORTANT: Remove your token from shell history now:"
echo "   history -c && exit"
echo ""
