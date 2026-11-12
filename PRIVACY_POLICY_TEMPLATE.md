# Privacy policy template — CHRONO TOWER

This is a draft template, not legal advice. Complete the operator identity, support email, jurisdiction, retention periods and platform-specific clauses before publication.

## Data the game may process
- Supabase account identifier and authentication session needed to sign in.
- Display name, game profile, inventory snapshot and progression fields when Cloud Save is used.
- City presence, movement state and chat messages while connected to the online city.
- Server-side Raid receipts (account ID, Raid ID, Boss, damage contribution, reward receipt and timestamps) for integrity and support.
- Basic technical logs needed to protect availability and investigate failures.

## Purpose and sharing
Data is used to provide account access, Cloud Save, online city/chat, Raid receipt records, abuse prevention and technical support. Do not sell profile data. Do not add analytics/advertising SDKs without updating this policy and obtaining any required consent.

## Retention and deletion
Set exact retention periods before release. Provide an account/data deletion contact and implement deletion for Supabase Auth plus associated profile and receipt records, subject to lawful retention requirements.

## Security
The server-only Supabase service-role key must remain in Render environment variables and must never be embedded in the browser build. Use HTTPS in production and restrict allowed origins.

## Contact
[Insert legal operator name and monitored support email before public release.]
