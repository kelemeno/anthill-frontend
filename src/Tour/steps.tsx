// The guided tour's steps: each points at a real part of the page and says what
// it does. Built per run, since what's on the page depends on whether you're
// signed in and in the tree.
import type { TourStep } from "./Tour";

const el = (selector: string) => () => document.querySelector(selector);

// the circle in focus (marked by GraphFlow) and its id
const focusNode = el('[data-focus="true"]');
const focusId = () =>
  focusNode()?.closest(".react-flow__node")?.getAttribute("data-id") ?? undefined;

const card = el("#mouse-over-popover .MuiPaper-root");

function openCard(id: string | undefined) {
  if (id) window.dispatchEvent(new CustomEvent("anthill:popover", { detail: id }));
}
function closeCard() {
  window.dispatchEvent(new Event("anthill:popover-close"));
}

export function tourSteps(context: {
  signedIn: boolean;
  inTree: boolean;
  accountId?: string;
}): TourStep[] {
  const steps: TourStep[] = [
    {
      title: "Welcome to Anthill",
      body: (
        <p>
          Anthill is a reputation system shaped like a tree. Everyone has one spot
          in the tree and a reputation score, but your spot doesn't set your
          reputation: <strong>votes from the people near you do</strong>. This
          tour points at each part of the page. Use Next and Back, or the arrow
          keys.
        </p>
      ),
    },
    {
      title: "The tree",
      target: el(".react-flow"),
      body: (
        <p>
          Each circle is a person. A line joins someone to the person directly
          above them, their <em>parent</em>. Everyone has at most two people
          directly below them, and the root is at the top. Drag to move around,
          and scroll or pinch to zoom.
        </p>
      ),
    },
    {
      title: "The person in focus",
      target: focusNode,
      optional: true,
      body: (
        <p>
          The slightly bigger circle with the shadow is in focus. Click any
          circle to put it in focus, and the view recentres on it. Hovering a
          circle opens the branch below it.
        </p>
      ),
    },
    {
      title: "A person's card",
      target: card,
      optional: true,
      onEnter: () => openCard(focusId()),
      onLeave: closeCard,
      body: (
        <p>
          Hovering a circle (or tapping it on a phone) opens their card: name,
          reputation, profile, and the actions you can take with them. If an
          action isn't possible right now, its button is greyed out and the card
          says why.
        </p>
      ),
    },
    {
      title: "What the buttons on a card do",
      target: card,
      onEnter: () => openCard(focusId()),
      onLeave: closeCard,
      body: (
        <ul className="tour-list">
          <li>
            <strong>Add / Remove reputation vote</strong>: support someone above
            you, up to 6 levels up in your part of the tree, but not at your own
            level. Your vote passes on part of your reputation to them.
          </li>
          <li>
            <strong>Switch positions</strong> (on your parent): swap places with
            them once your reputation is higher than theirs. That's how you climb.
          </li>
          <li>
            <strong>Move position</strong>: move under anyone with a free spot.
            You keep the votes that are still within reach.
          </li>
          <li>
            <strong>Join tree here</strong>: if you're not in the tree yet, join
            under this person.
          </li>
        </ul>
      ),
    },
  ];

  if (context.inTree && context.accountId) {
    const me = context.accountId;
    steps.push({
      title: "Your own card",
      target: card,
      optional: true,
      onEnter: () => openCard(me),
      onLeave: closeCard,
      body: (
        <p>
          On your own circle: <strong>Copy invite link</strong> makes a one-time
          link, and whoever opens it joins the tree under you.{" "}
          <strong>Change name</strong> renames you. <strong>Leave the tree</strong>{" "}
          removes you and your votes, and the people below you move up.
        </p>
      ),
    });
  }

  steps.push(
    {
      title: "Three ways to look",
      target: el(".ViewModeSwitch"),
      body: (
        <ul className="tour-list">
          <li>
            <strong>Tree</strong>: who sits where.
          </li>
          <li>
            <strong>+ Votes</strong>: also shows who the person in focus votes
            for.
          </li>
          <li>
            <strong>Reputation</strong>: shows who votes for the person in focus,
            which is where their reputation comes from.
          </li>
        </ul>
      ),
    },
    {
      title: "Zoom",
      target: el(".react-flow__controls"),
      optional: true,
      body: (
        <p>
          <strong>+</strong> and <strong>−</strong> zoom in and out. The square
          fits everything that's open into view.
        </p>
      ),
    },
    {
      title: "Replay the history",
      target: el(".HistoryBar"),
      optional: true,
      body: (
        <p>
          Replays how this part of the tree grew, one change at a time. Step with
          ⏮ and ⏭, press ▶ to play, or drag the slider. <strong>Live</strong>{" "}
          jumps back to now.
        </p>
      ),
    },
    {
      title: context.inTree ? "Back to your spot" : "Joining",
      target: el(".insideButton button"),
      optional: true,
      body: context.inTree ? (
        <p>
          <strong>Go to my node</strong> brings your own circle into focus.
        </p>
      ) : (
        <p>
          <strong>Join tree in random position</strong> puts you at a free spot.
          Better: ask someone to send you an invite link, so you start next to
          them.
        </p>
      ),
    },
    {
      title: "Polls",
      target: el(".PollsButton"),
      optional: true,
      body: (
        <p>
          Anyone in the tree can ask a question. Votes are weighted by reputation:
          an option's weight is the total reputation of the people who chose it.
          The person who asked can close the poll, which freezes the result.
        </p>
      ),
    },
    context.signedIn
      ? {
          title: "Your account",
          target: el(".AccountMenuButton"),
          optional: true,
          body: (
            <p>
              Your menu: <strong>invite someone</strong>, edit your{" "}
              <strong>profile</strong> (a short bio and a link),{" "}
              <strong>add a passkey</strong> on another device, make a new{" "}
              <strong>recovery code</strong>, or sign out.
            </p>
          ),
        }
      : {
          title: "Signing in",
          target: el(".AccountButtons"),
          optional: true,
          body: (
            <p>
              You sign in with a <strong>passkey</strong>: Face ID, Touch ID or
              your phone, with no password and no wallet.{" "}
              <strong>Create passkey</strong> makes your account and shows a
              recovery code once, so save it. <strong>Lost your passkey?</strong>{" "}
              uses that code to make a new one.
            </p>
          ),
        },
    {
      title: "How reputation is counted",
      body: (
        <p>
          Everyone starts with 1. Each vote you receive adds a share of the
          voter's reputation, and a voter's reputation is split between everyone
          they vote for. So votes from people with high reputation who vote for
          few people count the most. Once your reputation is higher than your
          parent's, you can switch places with them and move up.
        </p>
      ),
    },
    {
      title: "That's it",
      target: el(".TutorialButton"),
      body: <p>You can replay this tour any time from here.</p>,
    },
  );

  return steps;
}
