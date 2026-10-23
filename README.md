# Anthill frontend

The website at anthilldao.dev: React, TypeScript, Tailwind, built with Vite and hosted on Firebase. It talks to the off-chain backend (`anthill-backend`); people sign in with passkeys.

## Pages

- **You** (`/`): your reputation and rank, next steps (how close you are to swapping with your parent, people you can endorse, free spots to invite into), where your reputation comes from, who you endorse, your neighbourhood. Visitors who aren't signed in see the landing page, with a read-only preview as any member (`?as=<id>`).
- **Explore** (`/explore`): the whole tree with pan and zoom, search, circles sized by reputation, endorsement arcs, who you can endorse highlighted, and a side panel (a sheet on phones) for whoever you click.
- **Polls** (`/polls`): polls weighted by reputation.
- **People** (`/people`): everyone by reputation.
- **Person pages** (`/p/<id>`): their standing, how they relate to you, what you can do with them (dry-run on the server, with the reason when it isn't possible), endorsements in and out.
- **Invites** (`/invite/<code>`): join under the person who invited you, creating a passkey first if needed.

The account menu has profile editing (name, bio, link, leaving the tree), invites, extra passkeys and a new recovery code; the sign-in dialog also creates and recovers accounts. The guided tour (the `?` button) walks through the pages, and starts once by itself on a first visit.

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
