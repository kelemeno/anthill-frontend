

import { GraphSVG } from "./Graph"

export const Graph = (props: {"account":string, "chainId":number, "isAccountInGraph":boolean, "setIsAccountInGraph":any, "clickedNodeId":string,"setClickedNodeId":any,  "AnthillContract": any, "backendUrl": string, "wsUrl":string }) => {

    return GraphSVG(props)
}