# Anthill frontend

The website at anthilldao.dev: React, TypeScript, Tailwind, built with Vite and hosted on Firebase. It talks to the off-chain backend (`anthill-backend`); people sign in with passkeys, or with Google when the backend has it set up.

## Pages

- **Home** (`/`): your communities with your rank in each, public ones to discover, and starting a new one. Visitors see what Anthill is, with the top of the demo community's tree.
- Inside a community (`/c/<id>`, switched from the header):
  - **You** (`/c/<id>`): your reputation and rank, next steps (how close you are to swapping with your parent, people you can endorse, free spots to invite into), where your reputation comes from, who you endorse, your neighbourhood. Visitors see the community's landing page, with a read-only preview as any member (`?as=<id>`); people signed in but not in it see how to join.
  - **Explore** (`/c/<id>/explore`): the whole tree with pan and zoom (and a button to fit it all), search, circles sized by reputation, endorsement arcs, who you can endorse highlighted, and a side panel (a sheet on phones) for whoever you click. Changes glide into place. **Watch it grow** replays the community's history step by step: play, pause, step, scrub, speed, what happened in words, and the view following the tree; `?replay=1` opens it, so a link can be shared (the front page links the demo's).
  - **Polls** (`/c/<id>/polls`): polls weighted by reputation.
  - **People** (`/c/<id>/people`): everyone by reputation.
  - **Agents** (`/c/<id>/agents`, a tab only for a community whose summary has `commons`): connecting your own agent (Claude Code, Codex or another, run in your own sandbox) to the community's agent commons. Pick the agent, copy the prompt the backend writes (with a one-time code), the sandbox and network note, and the loop command; the page polls the pairing every 3 s while it's in view and shows the claim's fingerprint to approve or reject. Then your agents, each revocable (with an optional reason, kept in the commons' public ledger). Visitors are asked to sign in, non-members to join.
  - **Person pages** (`/c/<id>/p/<id>`): their standing, how they relate to you, what you can do with them (dry-run on the server, with the reason when it isn't possible), endorsements in and out.
- **Invites** (`/invite/<code>`): which community, and joining under the person who invited you, creating a passkey first if needed (or signing up with Google, which comes back to the invite to join).
- **Account** (`/account`, from the account menu): name and profile, the ways to sign in (passkeys with when they were added and last used, add and remove; Google with its email, or "a Google account" when the server doesn't have it, link and unlink), the recovery code, the sessions signed in now (this device marked, end one, sign out everywhere), downloading your data, and deleting the account.
- **Privacy** (`/privacy`) and **Terms** (`/terms`), linked from the front pages' footer. Keep the privacy page true to what the backend stores.
- `/auth/google`: where Google sends the tab back to after signing in (see below).

The account menu has profile editing (name, bio, link, leaving the current community), invites to the current community, the account page and signing out (which ends the session on the server too); the sign-in dialog also creates and recovers accounts. The community menu in the header switches communities, starts new ones and, for founders, changes settings. The guided tour (the `?` button) walks through the pages, and starts once by itself on a first visit to a community.

Pages paint at once: each public community's tree and the community list are kept in localStorage from the last visit and refreshed in the background, and anything not cached yet shows placeholders in its final layout.

## Development

```
npm install
npm run dev     # :5173, expects the backend on :5001 (see the anthill repo README)
npm test
```

## Accounts and security

- **Google sign-in** goes through the backend (authorization code flow with PKCE): no Google script runs on our pages. "Continue with Google" shows only when `GET /auth/methods` says Google is on. Before going to Google the tab keeps the flow's `state` (and where to come back to) in sessionStorage; `/auth/google` removes the code and state from the address bar at once, finishes only a flow this tab started, and goes back only to a path on this site.
  To set it up, create an OAuth client of type "Web application" in Google Cloud (APIs and Services, Credentials) with the authorised redirect URIs `https://anthilldao.dev/auth/google` and `http://localhost:5173/auth/google`, and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the backend. The consent screen's home page is `https://anthilldao.dev`, its privacy policy `https://anthilldao.dev/privacy` and its terms `https://anthilldao.dev/terms`. Without them Google stays off.
- **Confirming it's you**: account changes (adding or removing a passkey, Google, the recovery code, deleting) need a recent sign-in. The app signs in again with a passkey and retries. An account without passkeys, or one with Google linked whose passkey sheet is closed, confirms through Google instead (intent `confirm`, with the session: the server accepts only the Google account already linked to it and never makes an account for it). It asks first, comes back to the account page and says which change to make again. A replaced session is ended on the server.
- **Google sign-in makes an account** for a Google account that isn't linked to one yet: the sign-in dialog and invite page say so, and the callback tells someone who started from the sign-in dialog how to undo it. Coming Back from Google's page to a page the browser kept (back-forward cache) frees its buttons again.
- **Sessions, export and deletion** are on the account page; deleting leaves every community through the normal leave, and what's already in the append-only log stays there (the privacy page says so). The Google email isn't in the log: the backend keeps it apart and erases it on unlink or deletion, while Google's account id stays in the log.
- **Headers** (`firebase.json`, every page): a Content Security Policy that allows only this site's own scripts, styles (plus inline style attributes), images and fonts, and connections to this site and the backend (`connect-src` names the https and wss origins of `.env.production`: change both together); no framing; HSTS; `nosniff`; a strict referrer policy; a Permissions-Policy that turns off camera, microphone, location and payment and keeps passkeys to this site; and `Cross-Origin-Opener-Policy: same-origin`. Nothing may be inline in `index.html` or the Keel pages beyond `<style>`, and nothing loads from another site: Inter is self-hosted (`@fontsource-variable/inter`).

## Deploying

```
npm run build
npx firebase-tools deploy --only hosting --project anthill-147b0
```

`.env.production` points the build at the Render backend; the CSP's `connect-src` in `firebase.json` must name the same backend.
