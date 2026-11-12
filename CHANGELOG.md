# Changelog — V38.0 to V39.0

## V38.0 — Original-facing release identity
- Player-facing title, world labels and character/gear terminology moved to Chrono Tower: Gem of Aether.
- Legacy internal keys and profile storage identifiers intentionally retained for compatibility.
- Important: name replacement is not a legal IP clearance. All source art, character silhouettes, story, audio, UI assets and licenses still require human rights audit.

## V38.1 — Progressive onboarding
- Floor 1: core movement, normal attack, Parry and first skill.
- Floor 2: SWITCH unlock; first stiffness hint.
- Floor 3: Forge, sub-weapon Tab and advanced skills unlock.
- Floor 5: Basement and Boss part targeting unlock.
- Floor 10: Guild unlock.
- Guide dismissals persist inside the existing profile extension.

## V38.2 — Arena modifiers
- Floors 11–20: alternating wind direction; fixed mismatch between zone key and movement/render checks.
- Floors 21–30: glowing lava arena; standing still for 3 seconds causes periodic non-lethal HP loss.
- Boss encounters on floors 31–40: elemental shield requires matching element (fire/ice/thunder sequence); shield HP shown in modifier HUD.
- Floors 1–10 remain the introductory combat zone.

## V39.0 — Release candidate / server boundary
- Browser Cloud save/restore routed through Render API; no direct browser upsert to the old profile table.
- Supabase Auth token verified server-side; JSON whitelist, size/range bounds and profile revision conflict protection.
- New service-role-only profile table and atomic revision RPC; one-way read fallback for legacy V36/V37 cloud profiles.
- Server-confirmed Raid receipts persisted separately from client-supplied single-player cloud backup.
- Fixed missing ACK variable in `v37:player_attack` handler.
- Documented remaining limitations and required release checks.


## V39.0.1 — Final source review fixes
- Aligned the seeded Kaelen account key and `username` as `Kaelen_Chrono`, preventing the first snapshot from creating a second key for the same seeded account.
- Replaced remaining player-facing legacy roster labels: Agil → Valerius, Sinon → Sylvia; the other two legacy roster display names Alice/Klein were changed to Aurelia/Darian. Internal asset keys and roster IDs remain unchanged for compatibility.
- Added an elemental-shield Stagger guard: an off-element weapon cannot add Break while the shield is active. Matching-element attacks still add Break; defensive Parry may explicitly bypass the element gate.
- Added four new guard assertions to the in-game V39 self-test runner; isolated Node harness verified wrong-element block, matching-element allow, Parry override, broken-shield allow and ordinary no-shield behavior.
