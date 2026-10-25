# Working on Flow

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) before making changes. It explains
the architecture, current implementation, setup, limitations, and next steps.
Use [README.md](README.md) for running the app and Android builds.

Follow [mobile/AGENTS.md](mobile/AGENTS.md) when working on the Expo app.
The primary target is Android, tested through Expo Go. Preserve the web fallback.
The current backend is the free local service with a Cloudflare tunnel; Firebase
Functions deployment is optional future work, not a prerequisite for development.

Keep Nessie credentials server-side. Never commit local environment files or
seed journals. Do not run seeding/funding scripts against the shared sandbox as
part of ordinary setup or testing. Coordinate with the team before changing the
shared customer, Firebase/EAS project configuration, or dataset.

Do not turn local checkout confirmation into a real or Nessie transaction without
implementing and verifying that flow explicitly. Preserve integer-cent money
calculations, bill-data warnings, account ownership checks, and tester access
controls. Run the checks relevant to your changes; commands are in the context file.
