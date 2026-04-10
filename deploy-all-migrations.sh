#!/bin/bash
# Movido v12 - Complete Migration Deployment Script
# Deploy all 4 migrations to Supabase

set -e

PROJECT_DIR="/sessions/charming-vibrant-fermi/mnt/movido-v12-CLEAN"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

echo "🚀 Movido v12 - Migration Deployment"
echo "===================================="
echo ""
echo "⚠️  IMPORTANT: You need to manually run this for now due to browser limitations."
echo ""
echo "📍 Migration files ready at:"
for i in 005 006 007 008; do
  FILE="$MIGRATIONS_DIR/${i}_*.sql"
  if ls $FILE 1> /dev/null 2>&1; then
    ACTUAL_FILE=$(ls $FILE)
    SIZE=$(wc -l < $ACTUAL_FILE)
    echo "   ✅ $(basename $ACTUAL_FILE) - $SIZE lines"
  fi
done

echo ""
echo "📖 TO DEPLOY MANUALLY:"
echo "====================="
echo ""
echo "1. Open your browser:"
echo "   https://supabase.com/dashboard/project/zjvozjnbvrtrrpehqdpf/sql/new"
echo ""
echo "2. For each migration (005, 006, 007, 008):"
echo "   a) Click '+ New' to create new query"
echo "   b) Open this file: DEPLOY_NOW.md"
echo "   c) Copy the SQL for that migration"
echo "   d) Paste into SQL editor"
echo "   e) Click 'Run' button"
echo "   f) Wait for ✅ 'Query completed successfully'"
echo ""
echo "📁 DEPLOYMENT GUIDE:"
echo "  📄 DEPLOY_NOW.md (easiest - copy-paste ready)"
echo "  📄 SUPABASE_DEPLOYMENT_GUIDE.md (complete reference)"
echo ""
echo "⏱️  Expected time: 5 minutes"
echo "📚 Difficulty: Very easy (just copy & paste)"
