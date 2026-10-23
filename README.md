# Anthill frontend

The website at anthilldao.dev: React, TypeScript, Tailwind, built with Vite and hosted on Firebase. It talks to the off-chain backend (`anthill-backend`); people sign in with passkeys.

## Pages

- **Home** (`/`): your communities with your rank in each, public ones to discover, and starting a new one. Visitors see what Anthill is, with the top of the demo community's tree.
- Inside a community (`/c/<id>`, switched from the header):
  - **You** (`/c/<id>`): your reputation and rank, next steps (how close you are to swapping with your parent, people you can endorse, free spots to invite into), where your reputation comes from, who you endorse, your neighbourhood. Visitors see the community's landing page, with a read-only preview as any member (`?as=<id>`); people signed in but not in it see how to join.
  - **Explore** (`/c/<id>/explore`): the whole tree with pan and zoom, search, circles sized by reputation, endorsement arcs, who you can endorse highlighted, and a side panel (a sheet on phones) for whoever you click.
  - **Polls** (`/c/<id>/polls`): polls weighted by reputation.
  - **People** (`/c/<id>/people`): everyone by reputation.
  - **Person pages** (`/c/<id>/p/<id>`): their standing, how they relate to you, what you can do with them (dry-run on the server, with the reason when it isn't possible), endorsements in and out.
- **Invites** (`/invite/<code>`): which community, and joining under the person who invited you, creating a passkey first if needed.

The account menu has profile editing (name, bio, link, leaving the current community), invites to the current community, extra passkeys and a new recovery code; the sign-in dialog also creates and recovers accounts. The community menu in the header switches communities, starts new ones and, for founders, changes settings. The guided tour (the `?` button) walks through the pages, and starts once by itself on a first visit to a community.

Pages paint at once: each public community's tree and the community list are kept in localStorage from the last visit and refreshed in the background, and anything not cached yet shows placeholders in its final layout.

## Development

```
npm install
npm run dev     # :5173, expects the backend on :5001 (see the anthill repo README)
npm test
```

## Deploying

```
npm run build
npx firebase-tools deploy --only hosting --project anthill-147b0
```

`.env.production` points the build at the Render backend.
