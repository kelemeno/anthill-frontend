// Anthill's privacy policy (/privacy) and terms (/terms), linked from the
// front pages' footer and Google's consent screen. Keep the privacy page true
// to what the backend stores: when that changes, this changes with it.
import type { ReactNode } from "react";

import { AppLink, Card, SiteFooter, SOURCE_URL } from "../ui";

const UPDATED = "18 November 2026";

function LegalPage(props: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
        <p className="mt-1 text-[13px] text-slate-500">Last updated {UPDATED}</p>
        <div className="mt-4 text-[15px] leading-relaxed text-slate-700">{props.intro}</div>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600 [&_h2]:pt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
          {props.children}
        </div>
      </Card>
      <SiteFooter />
    </div>
  );
}

const Contact = () => (
  <p>
    Questions, or something here that isn't right? Open an issue where Anthill's code lives,{" "}
    <a href={SOURCE_URL} className="font-medium text-accent-600 hover:underline">
      github.com/kelemeno/anthill
    </a>
    .
  </p>
);

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro={
        <p>
          Anthill keeps what it needs to run your communities, and nothing more. No ads, no
          selling your data, no tracking or analytics, no cookies. It shares nothing about you
          with anyone else, except with a community's agent commons when you take part in one
          (see below).
        </p>
      }
    >
      <h2>What Anthill stores</h2>
      <p>
        Everything below lives on Anthill's server, in an append-only log: a list of what
        happened, in order, which is the source of truth for every community. Entries are added
        to it, never edited. The one exception is your Google email, which is kept apart from
        the log so that it can be erased.
      </p>
      <ul>
        <li>
          <strong>Your account:</strong> a random id, your name, and the bio and link on your
          profile, if you add them.
        </li>
        <li>
          <strong>What you do in communities:</strong> joining and leaving, moves in the tree,
          endorsements, the invites you make and use, polls you start and how you vote, and a
          community's settings and its site (which pages it shows, its colour and its About
          text, which everyone who can see the community can read) if you change them.
        </li>
        <li>
          <strong>Passkeys:</strong> each one's public key and id, how your browser said it can
          be reached (for example "on this device"), and a counter that changes with each use.
          The private key never leaves your device.
        </li>
        <li>
          <strong>Google, if you use it to sign in:</strong> Google's id for your account, in
          the log, and your email address, kept outside the log and updated when it has changed
          as you sign in. Unlinking Google or deleting your account erases the email; Google's id
          for your account stays in the log. A new account
          takes its starting name from your first name on Google (your full name, if Google
          gives no first name), and you can change it. Nothing else from Google: not your
          contacts, calendar or anything in your Google account.
        </li>
        <li>
          <strong>Your recovery code:</strong> only a one-way hash of it, which can check a
          code but can't be turned back into one.
        </li>
        <li>
          <strong>Sessions:</strong> when each sign-in happened, how (a passkey, Google, or the
          recovery code), and a rough device label such as "Chrome on macOS", read from what
          your browser says about itself. You see these on your account page.
        </li>
        <li>
          <strong>IP addresses:</strong> held for a short time in the server's memory, to limit
          how fast sign-ups and other requests can come from one place. They're never written
          to the log.
        </li>
      </ul>
      <p>
        In your browser, Anthill keeps your session (so you stay signed in), copies of the public
        communities and their trees (so pages open quickly), the last community you opened, whether
        you've seen the tour, and light or dark if you chose one. While you're away signing in at Google, the tab also remembers a
        one-time value that checks Google sent you back from the sign-in you started.
      </p>

      <h2>Who sees what</h2>
      <ul>
        <li>
          <strong>Public communities:</strong> anyone can see who's in them, with their names,
          bios and links, the tree, endorsements, the community's history (the replay) and its
          polls.
        </li>
        <li>
          <strong>Private communities:</strong> the same, but only for their members.
        </li>
        <li>
          <strong>Polls</strong> show, for each option, how many people picked it and the total
          of their reputations, as votes come in. Reputations are public too, so others can
          often work out how you voted, especially when few have voted. Anthill shows your own
          choice only to you, and the log records every vote.
        </li>
        <li>
          <strong>Only you</strong> see your Google email and your sessions. They're never in a
          tree, a profile or anything public.
        </li>
        <li>The people who run Anthill's server can read the log.</li>
      </ul>

      <h2>Communities with an agent commons</h2>
      <p>
        Some communities have an agent commons: a separate app, with its own server (its
        coordinator, named on the community's Agents page) and its own ledger, where members'
        AI agents work on a project together. Its ledger is separate from Anthill's log and
        append-only too: entries are added to it, never edited or removed. Anyone can read it,
        under the commons' own terms. For such a community, Anthill signs statements that the
        commons keeps in its ledger:
      </p>
      <ul>
        <li>
          <strong>The community's tree:</strong> every member's Anthill user id and where they
          are in it (not their names), which the commons fetches from Anthill, like anyone who
          can see the community.
        </li>
        <li>
          <strong>When you connect an agent:</strong> Anthill's server sends the coordinator a
          signed statement that the agent is yours, with your Anthill user id, the community, the agent's public key, the model
          family and what it runs in (as your agent declared them), and when. The commons keeps
          it in its ledger and lists every person's agents publicly, by their Anthill user id.
        </li>
        <li>
          <strong>When you revoke an agent:</strong> Anthill's server sends a signed statement
          that you revoked it, with the same ids, the time and the reason you give, which the ledger keeps and
          shows publicly too.
        </li>
        <li>
          <strong>When you link your own commons key,</strong> if you do: a signed statement
          that the key is yours, with your Anthill user id, which you give the commons.
        </li>
      </ul>
      <p>
        Anthill's server also asks the coordinator for your list of agents, to show it to you.
        The one-time code that pairs an agent, and what the agent says when it uses it, are held
        only in the server's memory until the pairing ends, and never written to Anthill's log.
        What your agent then does in the commons is up to you and the commons, under its rules.
      </p>

      <h2>Services Anthill uses</h2>
      <p>
        The website is served by Firebase Hosting (a Google service) and the server runs on
        Render. Like any host, they handle the traffic to and from Anthill, IP addresses
        included, under their own privacy policies. Signing in with Google happens at Google,
        under Google's privacy policy; Google learns that you signed in to Anthill. For a
        community with an agent commons, Anthill's server talks to that commons' coordinator
        (see above). Nothing else: the website loads no scripts, fonts or images from anyone
        else, and there are no analytics or ad networks. Everything travels encrypted over
        HTTPS.
      </p>

      <h2>Your data, your choices</h2>
      <ul>
        <li>
          <strong>Download it:</strong> on your <AppLink to="/account" global className="font-medium text-accent-600 hover:underline">account page</AppLink>,
          "Download my data" gives you a file with everything Anthill holds about your account.
        </li>
        <li>
          <strong>Change how you sign in:</strong> add or remove passkeys, link or unlink
          Google, end sessions or sign out everywhere, from the same page.
        </li>
        <li>
          <strong>Delete your account:</strong> you leave every community (each records it, like
          any leave), your profile, passkeys, Google link and recovery code stop working and are
          no longer shown, your Google email is erased, and every session ends. The account is
          renamed "Deleted account" and can never sign in again. A community you started then
          has no founder: whoever is at the root of its tree decides its settings. Once nobody is in it, a public one that
          isn't closed can be started again by anyone, and a private one stays hidden for good.
        </li>
      </ul>
      <p>
        <strong>What deleting and unlinking can't erase:</strong> because the log is append-only,
        what's already in it stays there for good. Your past names, actions and votes can still
        show in a community's history, to whoever can see that community. The rest is never
        shown to anyone again, but stays in the log, and in any backup of it, where the people
        who run Anthill's server can read it: Google's id for your account (not your email,
        which is kept outside the log and erased), your bio and link, your passkeys' public keys
        and ids, your recovery code's hash, and when and how you signed in, with each session's
        device label. Anthill can't promise to remove any of it. Snapshots of the server's
        disk, which the hosting provider keeps for a short time, may also hold your Google
        email until they expire.
      </p>
      <p>
        <strong>Nor what an agent commons keeps:</strong> its ledger is the commons', not
        Anthill's. Revoking an agent, leaving the community or deleting your Anthill account
        doesn't erase anything from it: your Anthill user id, your agents' public keys, model
        families and what they run in, Anthill's signed statements and your revoke reasons stay
        there for good. Deleting your Anthill account revokes your agents first (Anthill's server
        sends the commons a signed revocation for each, with the reason that you deleted your
        account), and isn't done if that fails. Leaving a community doesn't revoke them: revoke
        them on its Agents page, which still lists them for you after you leave.
      </p>

      <h2>Changes</h2>
      <p>
        If what Anthill stores or shares changes, this page changes first, with a new date at the
        top.
      </p>

      <h2>Contact</h2>
      <Contact />
    </LegalPage>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro={
        <p>
          Anthill is free to use. By using it you agree to these terms; they're short, so please
          read them. How Anthill handles your data is on the{" "}
          <AppLink to="/privacy" global className="font-medium text-accent-600 hover:underline">
            privacy page
          </AppLink>
          .
        </p>
      }
    >
      <h2>Your account</h2>
      <ul>
        <li>One account per person. Don't make extra accounts to gather reputation or votes.</li>
        <li>
          Keep your ways to sign in safe: your passkeys, the Google account you linked, and your
          recovery code. Whoever has them can act as you.
        </li>
        <li>You can download your data or delete your account at any time.</li>
      </ul>

      <h2>What you put on Anthill</h2>
      <ul>
        <li>
          Your name, bio, link, polls and actions are seen by others: by anyone in a public
          community, by members in a private one. You're responsible for them.
        </li>
        <li>
          Don't post anything illegal, don't harass or threaten people, don't pretend to be
          someone else, and don't spam or try to break or overload the service.
        </li>
        <li>
          Anthill's history is an append-only log: what you do there becomes part of it for good
          (see the privacy page on deletion).
        </li>
      </ul>

      <h2>Communities</h2>
      <p>
        Whoever starts a community chooses who can see it and how people join; if they delete
        their account, whoever is at the root of its tree does. The tree's rules
        (where you join, endorsements, swaps, how reputation flows) are the same in every
        community and enforced by the server.
      </p>

      <h2>Running the service</h2>
      <ul>
        <li>
          Anthill may limit or end an account, or hide what it posted, when it breaks these
          terms or the law.
        </li>
        <li>
          Anthill is provided as it is, without guarantees: it may change, have outages or stop,
          and data could be lost. Download your data if you want your own copy.
        </li>
        <li>As far as the law allows, Anthill isn't liable for losses from using it.</li>
        <li>These terms may change; this page then shows the new date at the top.</li>
      </ul>

      <h2>Contact</h2>
      <Contact />
    </LegalPage>
  );
}
