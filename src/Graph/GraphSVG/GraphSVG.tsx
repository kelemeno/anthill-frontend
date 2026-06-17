// this is where we create the image of the graph, adding in the popover and the buttons

import Popover from "@mui/material/Popover";
import React, { useState } from "react";

import { useNavigate } from "react-router-dom";

import ".././../App.css";
import {
  AddDagVoteButton,
  AddDagVoteCheck,
  ChangeNameButton,
  ChangeNameCheck,
  JoinTreeButton,
  JoinTreeCheck,
  LeaveTreeButton,
  LeaveTreeCheck,
  MoveTreeVoteButton,
  MoveTreeVoteCheck,
  RemoveDagVoteButton,
  RemoveDagVoteCheck,
  SwitchParentButton,
  SwitchParentCheck,
} from "../../Buttons/PopupButtons";
import type {
  GraphData,
  GraphDataBare,
  GraphDataRendering,
  NodeDataRendering,
} from "../GraphBase";
import { GraphFlow } from "./GraphFlow";
import {
  handleClick,
  handleMouseOut,
  handleMouseOver,
  handleMouseStay,
} from "./GraphNodeMouseInteractions";

export const GraphSVG = (props: {
  account: string;
  chainId: number;
  isAccountInGraph: boolean;
  setIsAccountInGraph: any;
  clickedNode: string;
  setClickedNode: any;
  AnthillContract: any;
  graph: GraphDataRendering;
  altNode: string;
  maxRelRootDepth: number;
  anthillGraph: GraphData;
  anthillGraphBare: GraphDataBare;
}) => {
  // console.log("rendering graph")

  const navigate = useNavigate();

  // the actual data
  const [hoverNode, setHoverNode] = useState({
    id: props.clickedNode,
    name: props.clickedNode,
    totalWeight: 0,
    currentRep: 1,
    depth: 0,
    relRoot: "Enter",
    sentTreeVote: "1",
    parentIds: [],
    recTreeVotes: [],
    isVotable: false,
    isDagVote: false,
    isSwitchable: false,
  } as NodeDataRendering);

  // for the popover
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(
    null,
  );
  const [open, setOpen] = React.useState(Boolean(anchorEl));

  // we delay the popover to render only after the graph is loaded. This is set as true in useEffect
  const [loaded, setLoaded] = React.useState(false);

  // console.log("open", open, anchorEl, loaded)

  // var checkForClick = () => {
  //   if (clickedNodeId.current != props.clickedNodeId) {
  //     clickedNodeId.current = props.clickedNodeId;
  //     handleClickConstructed( props.clickedNodeId )}
  // }

  const handleClickConstructed = (id: string, name: string, rep: number) =>
    handleClick({
      id: id,
      name: name,
      rep: rep,
      setOpen: setOpen,
      setAnchorEl: setAnchorEl,
      setAnchorElSaver: setAnchorElSaver,
      clickedNode: props.clickedNode,
      setClickedNodeId: props.setClickedNode,
      setLoaded: setLoaded,
      setHoverNode: setHoverNode,
      navigate: navigate,
    });

  // Reset the popover whenever the rendered graph/selection changes, then mark
  // the graph loaded so hovers start producing popovers again.
  React.useEffect(() => {
    setOpen(false);
    setLoaded(false);
    setAnchorEl(null);
    setAnchorElSaver(null);
    const t = setTimeout(() => setLoaded(true), 0);
    return () => clearTimeout(t);
  }, [props.graph, props.clickedNode]);

  return (
    <div>
      <GraphFlow
        graph={props.graph}
        clickedNode={props.clickedNode}
        onNodeClick={handleClickConstructed}
        onNodeMouseEnter={(
          event: React.MouseEvent<HTMLElement>,
          node: NodeDataRendering,
        ) =>
          handleMouseOver(
            event,
            node,
            loaded,
            setHoverNode,
            setAnchorEl,
            setAnchorElSaver,
            setOpen,
          )
        }
        onNodeMouseLeave={() => handleMouseOut(loaded, setOpen, setAnchorEl)}
      />
      <Popover
        id="mouse-over-popover"
        sx={{
          pointerEvents: "none",
        }}
        open={open}
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        onClose={() => handleMouseOut(loaded, setOpen, setAnchorEl)}
        slotProps={{
          paper: {
            onMouseEnter: () =>
              handleMouseStay(anchorElSaver, setAnchorEl, setOpen, loaded),
            onMouseLeave: () => handleMouseOut(loaded, setOpen, setAnchorEl),
            sx: { pointerEvents: "auto" },
          },
        }}
        transitionDuration="auto"
      >
        <div className="Popover">Name: {hoverNode.name}. </div>
        {/* <div className='Popover'>Depth: {hoverNode.depth}.  </div> */}
        <div className="Popover">
          {" "}
          Current reputation: {(hoverNode.currentRep / 10 ** 18).toFixed(
            2,
          )}{" "}
        </div>

        {SwitchParentCheck(
          props.isAccountInGraph,
          props.graph[hoverNode.id],
        ) && (
          <SwitchParentButton
            AnthillContract={props.AnthillContract}
            chainId={props.chainId}
            isAccountInGraph={props.isAccountInGraph}
            voter={props.account}
            recipient={hoverNode}
            graph={props.graph}
          />
        )}
        {LeaveTreeCheck(
          props.isAccountInGraph,
          props.account,
          props.graph[hoverNode.id],
        ) && (
          <LeaveTreeButton
            AnthillContract={props.AnthillContract}
            chainId={props.chainId}
            isAccountInGraph={props.isAccountInGraph}
            voter={props.account}
            recipient={hoverNode}
            setIsAccountInGraph={props.setIsAccountInGraph}
            setClickedNode={props.setClickedNode}
            navigate={navigate}
            altNode={props.altNode}
          />
        )}
        {MoveTreeVoteCheck(
          props.isAccountInGraph,
          props.account,
          props.graph[hoverNode.id],
        ) && (
          <MoveTreeVoteButton
            AnthillContract={props.AnthillContract}
            chainId={props.chainId}
            isAccountInGraph={props.isAccountInGraph}
            voter={props.account}
            recipient={hoverNode}
            setClickedNode={props.setClickedNode}
            navigate={navigate}
          />
        )}
        {AddDagVoteCheck(props.isAccountInGraph, props.graph[hoverNode.id]) && (
          <AddDagVoteButton
            AnthillContract={props.AnthillContract}
            chainId={props.chainId}
            isAccountInGraph={props.isAccountInGraph}
            account={props.account}
            recipient={hoverNode.id}
            graph={props.graph}
          />
        )}
        {RemoveDagVoteCheck(
          props.isAccountInGraph,
          props.graph[hoverNode.id],
        ) && (
          <RemoveDagVoteButton
            AnthillContract={props.AnthillContract}
            chainId={props.chainId}
            isAccountInGraph={props.isAccountInGraph}
            account={props.account}
            recipient={hoverNode.id}
            graph={props.graph}
          />
        )}
        {JoinTreeCheck(
          props.isAccountInGraph,
          props.account,
          props.graph[hoverNode.id],
        ) && (
          <JoinTreeButton
            AnthillContract={props.AnthillContract}
            chainId={props.chainId}
            isAccountInGraph={props.isAccountInGraph}
            voter={props.account}
            recipient={hoverNode}
            setClickedNode={props.setClickedNode}
            setIsAccountInGraph={props.setIsAccountInGraph}
          />
        )}
        {ChangeNameCheck(
          props.isAccountInGraph,
          props.account,
          props.graph[hoverNode.id],
        ) && (
          <ChangeNameButton
            AnthillContract={props.AnthillContract}
            chainId={props.chainId}
            isAccountInGraph={props.isAccountInGraph}
            voter={props.account}
            recipient={hoverNode}
          />
        )}

        <div className="Popover">
          {" "}
          Address:{" "}
          <a href={"https://sepolia.etherscan.io/address/" + hoverNode.id}>
            {hoverNode.id.slice(0, 5)}...{hoverNode.id.slice(-3)}
          </a>{" "}
        </div>
      </Popover>
    </div>
  );
};
