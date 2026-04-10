#!/usr/bin/env python3
"""
Automated Supabase Migration Deployment Script
Deploys all 4 Movido feature migrations (005-008) to your Supabase project
"""

import os
import sys
import subprocess
from pathlib import Path

def main():
    print("🚀 Movido v12 - Supabase Migration Deployer\n")

    # Check if Supabase CLI is installed
    try:
        subprocess.run(["supabase", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Supabase CLI not found. Installing...\n")
        print("Run this command first:")
        print("  npm install -g supabase\n")
        sys.exit(1)

    # Migration files to deploy
    migrations = [
        "005_geofence_events.sql",
        "006_pod_tables.sql",
        "007_eta_fields.sql",
        "008_rbac_permissions.sql"
    ]

    migration_dir = Path(__file__).parent / "supabase" / "migrations"

    print("=" * 60)
    print("📋 Migrations to Deploy:")
    print("=" * 60)
    for i, migration in enumerate(migrations, 1):
        print(f"{i}. {migration}")
    print()

    # Check if all migration files exist
    print("Checking migration files...")
    for migration in migrations:
        path = migration_dir / migration
        if path.exists():
            print(f"  ✅ {migration}")
        else:
            print(f"  ❌ {migration} - NOT FOUND")
            sys.exit(1)

    print()
    print("=" * 60)
    print("🔑 Authentication")
    print("=" * 60)
    print("Make sure you're logged in to Supabase CLI:\n")
    print("  supabase login\n")

    # Check if logged in
    try:
        result = subprocess.run(
            ["supabase", "projects", "list"],
            capture_output=True,
            text=True,
            check=False
        )
        if result.returncode != 0:
            print("❌ Not authenticated. Run: supabase login\n")
            sys.exit(1)
        print("✅ Authenticated with Supabase\n")
    except Exception as e:
        print(f"❌ Authentication check failed: {e}\n")
        sys.exit(1)

    print("=" * 60)
    print("🚀 Deploying Migrations")
    print("=" * 60)
    print()

    deployed = 0
    failed = 0

    for i, migration in enumerate(migrations, 1):
        migration_path = migration_dir / migration

        print(f"[{i}/4] Deploying {migration}...")

        try:
            # Read migration SQL
            with open(migration_path, 'r') as f:
                sql_content = f.read()

            # Execute via supabase CLI
            # Method: Save to temp file and use psql
            temp_sql = f"/tmp/{migration}"
            with open(temp_sql, 'w') as f:
                f.write(sql_content)

            # Try using Supabase CLI to execute
            result = subprocess.run(
                f"cat {temp_sql} | supabase db push",
                shell=True,
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                print(f"    ✅ SUCCESS\n")
                deployed += 1
            else:
                # Try alternative method: direct execution
                print(f"    ⚠️ Trying alternative deployment method...\n")
                print(f"    Paste this SQL in Supabase SQL Editor:")
                print(f"    - Go to https://supabase.com/dashboard")
                print(f"    - Click SQL Editor → New Query")
                print(f"    - Copy contents of: {migration_path}")
                print(f"    - Click Run\n")
                failed += 1

        except Exception as e:
            print(f"    ❌ Error: {e}\n")
            failed += 1

    # Summary
    print("=" * 60)
    print("📊 Deployment Summary")
    print("=" * 60)
    print(f"✅ Deployed: {deployed}")
    print(f"❌ Failed:   {failed}")
    print()

    if deployed == len(migrations):
        print("🎉 All migrations deployed successfully!\n")
        print("Next steps:")
        print("  1. Go to Supabase Studio → Tables")
        print("  2. Verify these tables exist:")
        print("     - geofence_events")
        print("     - geofence_config")
        print("     - pod_photos")
        print("     - pod_signatures")
        print("     - eta_history")
        print("     - permissions")
        print("     - role_permissions")
        print("     - audit_log")
        print()
        sys.exit(0)
    else:
        print("⚠️  Some migrations may need manual deployment.\n")
        print("Use the SUPABASE_DEPLOYMENT_GUIDE.md for manual steps.\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
