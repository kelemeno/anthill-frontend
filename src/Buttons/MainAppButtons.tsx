// buttons for the main app.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { address0 } from "../Graph/GraphBase";

import ".././App.css";
import { getRandomLeaf } from "../ExternalConnections/BackendGetters";

import { useJoinTree } from "../ExternalConnections/SmartContractInteractions";

export function GoHomeButton(props: {
  account: string;
  isAccountInGraph: boolean;
  setClickedNode: any;
}) {
  const navigate = useNavigate();
  if (!props.isAccountInGraph) {
    return <></>;
  }

  return (
    <button
      onClick={() => {
        console.log("gohome");
        props.setClickedNode(props.account);
        navigate("/?id=" + props.account);
      }}
    >
      Go to my node
    </button>
  );
}

export const JoinTreeRandomlyCheck = (
  isAccountInGraph: boolean,
  voter: string,
) => {
  return !isAccountInGraph && voter !== undefined && voter !== address0;
};

export function JoinTreeRandomlyButton(props: {
  AnthillContract: any;
  chainId: number;
  account: string;
  isAccountInGraph: boolean;
  setIsAccountInGraph: any;
  backendUrl: string;
  setClickedNode: any;
}) {
  // var navigate = useNavigate();
  // if (props.isAccountInGraph) {return <></>}
  // if (props.account === address0){return <></>}

  // return <button onClick={async () => {
  //         await JoinTree(props.AnthillContract,  props.account, recipient, props.setClickedNode, props.setIsAccountInGraph) ;
  //         navigate("/"+props.account)
  //         }
  //     }>
  //     Join tree in random position
  //     </button>
  const [recipient, setRecipient] = useState<string>("");

  useEffect(() => {
    getRandomLeaf(props.backendUrl).then((res) => {
      setRecipient(res);
    });
  }, [props.backendUrl]);

  const joinTree = useJoinTree(props.AnthillContract, props.account, recipient);

  return (
    // <div className='Popover'>
    <button onClick={() => joinTree?.()}>Join tree in random position</button>
    // </div>
  );
}

export function TreeOrRepModeSwitch(props: {
  treeMode: boolean;
  setTreeMode: any;
}) {
  function handleOnChange() {
    // console.log("---", e.target.checked);
    props.setTreeMode(!props.treeMode);
  }
  return (
    <>
      <StyledLabel htmlFor="checkbox" checked={props.treeMode}>
        <input
          id="checkbox"
          type="checkbox"
          checked={props.treeMode}
          onChange={handleOnChange}
        />
      </StyledLabel>
      <div style={{ textAlign: "center", width: "80px" }}>
        {props.treeMode ? "Tree" : "Reputation"}
      </div>
    </>
  );
}

const StyledLabel = styled.label<{ checked: boolean }>`
  cursor: pointer;
  display: flex;
  align-items: center;
  text-indent: -9999px;
  width: 60px;
  height: 30px;
  background: ${({ checked }) => (checked ? "#00ff00" : "#808080")};
  display: block;
  border-radius: 20px;
  position: relative;
  margin-top: 10px;
  margin-left: 10px;
  user-select: none;

  &:after {
    content: "";
    position: absolute;
    left: ${({ checked }) => (checked ? "6px" : "calc(55% - 1px)")};
    top: 4.5px;
    width: 20px;
    height: 20px;
    background: #fff;
    border-radius: 20px;
    transition: 0.3s;
    appearance: none;
  }
`;

export function TutorialButton(props: {
  showTutorial: boolean;
  setShowTutorial: any;
}) {
  return (
    <button
      onClick={() => {
        props.setShowTutorial(!props.showTutorial);
      }}
    >
      Tutorial
    </button>
  );
}

const TUTORIAL_STEPS: { icon: string; title: string; body: React.ReactNode }[] =
  [
    {
      icon: "🐜",
      title: "Welcome to Anthill",
      body: (
        <>
          Anthill is a <strong>liquid-democracy reputation system</strong>.
          Everyone sits somewhere in a binary tree and has a reputation score.
          The key idea: your <em>position</em> in the tree doesn&apos;t set your
          reputation — <strong>votes do</strong>.
        </>
      ),
    },
    {
      icon: "⭐",
      title: "How reputation works",
      body: (
        <>
          You earn reputation from <strong>value votes</strong>. You can vote
          for people <em>above</em> you in the tree (within reach), and receive
          votes from people <em>below</em> you. More votes — and votes from
          higher-reputation people — mean a higher score.
        </>
      ),
    },
    {
      icon: "🔀",
      title: "Two ways to look",
      body: (
        <>
          Use the toggle in the top-left.{" "}
          <strong>Tree</strong> shows the binary-tree structure — who sits
          where. <strong>Reputation</strong> shows the value votes — who
          actually supports whom, which is what drives the scores.
        </>
      ),
    },
    {
      icon: "🧭",
      title: "Exploring the graph",
      body: (
        <>
          The graph opens to the top three levels.{" "}
          <strong>Tap or click a node</strong> to select and centre it. Tap a
          node&apos;s <strong>−/+N badge</strong> to open or close a branch (on
          a computer you can also just hover to peek). Drag to pan, scroll or
          pinch to zoom.
        </>
      ),
    },
    {
      icon: "⏱️",
      title: "Replaying history",
      body: (
        <>
          The bar at the bottom replays how the current view grew. Use{" "}
          <strong>◀ ▶</strong> to step, <strong>▶</strong> to play, or drag the
          slider. Hidden branches summarise as a single{" "}
          <em>“grew to N”</em> step. Hit <strong>Live</strong> to jump back to
          now.
        </>
      ),
    },
    {
      icon: "🗳️",
      title: "Taking part",
      body: (
        <>
          <strong>Connect your wallet</strong> (top-right) to act: join the
          tree, give or remove reputation votes, rename yourself, climb by
          switching with your parent, move to an open spot, or leave. Tap any
          node to see what you can do with it.
        </>
      ),
    },
  ];

export const TutorialPopup = (props: {
  showTutorial: boolean;
  setShowTutorial: any;
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  if (!props.showTutorial) return null;

  const last = TUTORIAL_STEPS.length - 1;
  const step = TUTORIAL_STEPS[stepIndex];
  const close = () => {
    props.setShowTutorial(false);
    setStepIndex(0);
  };

  return (
    <div
      className="tutorial-backdrop"
      onClick={close}
      onKeyDown={(e) => e.key === "Escape" && close()}
      role="presentation"
    >
      <div
        className="tutorial-popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Anthill tutorial"
      >
        <button
          type="button"
          className="tutorial-close"
          aria-label="Close tutorial"
          onClick={close}
        >
          ×
        </button>
        <div className="tutorial-icon">{step.icon}</div>
        <h2 className="tutorial-title">{step.title}</h2>
        <p className="tutorial-body">{step.body}</p>

        <div className="tutorial-dots">
          {TUTORIAL_STEPS.map((s, i) => (
            <button
              type="button"
              key={s.title}
              aria-label={`Go to step ${i + 1}`}
              className={`tutorial-dot${i === stepIndex ? " active" : ""}`}
              onClick={() => setStepIndex(i)}
            />
          ))}
        </div>

        <div className="tutorial-nav">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            Back
          </button>
          {stepIndex === last ? (
            <button type="button" className="tutorial-primary" onClick={close}>
              Got it
            </button>
          ) : (
            <button
              type="button"
              className="tutorial-primary"
              onClick={() => setStepIndex((i) => Math.min(last, i + 1))}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TutorialPopup;
