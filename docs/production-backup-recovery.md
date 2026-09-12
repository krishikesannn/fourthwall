# Production database backup and recovery

The **Production database backup** GitHub workflow exports the Cloudflare D1 database every day at 02:05 Asia/Kolkata and can also be run manually. Each private artifact contains a compressed SQL export, SHA-256 checksum, and metadata. Backups are retained for seven days to limit exposure of client data.

## One-time setup

Add repository Actions secrets named `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token needs D1 read access for the account. Never place either value in a tracked file.

Run the workflow manually once from GitHub Actions and confirm its artifact contains all three expected files.

## Recovery drill

1. Download the newest successful artifact and decompress `production-backup.sql.gz`.
2. Verify its checksum before using it: `sha256sum -c production-backup.sql.sha256`.
3. Create a temporary D1 database. Never test restoration against production.
4. Import the SQL export into the temporary database with Wrangler.
5. point a temporary Worker environment at that database and verify sign-in, inquiries, projects, and recent audit records.
6. Delete the temporary database after the drill.

For a real incident, pause writes first and preserve the current damaged database with a separate export. Restore into a newly created D1 database, validate it, and only then change the production binding. This keeps rollback possible and avoids overwriting the last recoverable state.

