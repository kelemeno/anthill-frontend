// buttons for the main app.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { address0 } from "../Graph/GraphBase";

import ".././App.css";
import { getRandomLeaf } from "../ExternalConnections/BackendGetters";

import { useJoinTree } from "../ExternalConnections/BackendActions";

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
  api: any;
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

  const joinTree = useJoinTree(props.api, recipient);

  return (
    // <div className='Popover'>
    <button onClick={() => joinTree?.()}>Join tree in random position</button>
    // </div>
  );
}

export function TreeOrRepModeSwitch(props: {
  viewMode: "tree" | "votes" | "rep";
  setViewMode: any;
}) {
  const options: { key: "tree" | "votes" | "rep"; label: string }[] = [
    { key: "tree", label: "Tree" },
    { key: "votes", label: "+ Votes" },
    { key: "rep", label: "Reputation" },
  ];
  return (
    <div
      className="ViewModeSwitch"
      style={{
        display: "inline-flex",
        border: "1px solid #d8dde3",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {options.map((o, i) => {
        const active = props.viewMode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => props.setViewMode(o.key)}
            style={{
              border: "none",
              borderLeft: i === 0 ? "none" : "1px solid #d8dde3",
              borderRadius: 0,
              background: active ? "#2b6cb0" : "#fff",
              color: active ? "#fff" : "#2d3748",
              padding: "7px 12px",
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Starts the guided tour (see src/Tour).
export function TutorialButton(props: { startTour: () => void }) {
  return (
    <button type="button" className="TutorialButton" onClick={props.startTour}>
      Tutorial
    </button>
  );
}
