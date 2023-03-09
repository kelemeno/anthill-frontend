import * as d3Base from 'd3';
import {useState} from 'react';
import React from 'react';


import * as d3Dag from 'd3-dag';

import {GraphDataRendering,  NodeDataRendering} from './GraphCore/LoadGraph';
var svg = require('svg');

function GraphDataToArray(graph: GraphDataRendering): NodeDataRendering[]{
    var array :NodeDataRendering[] = [];
    for (const [key, value] of Object.entries(graph)) {    
        var node = graph[key] as NodeDataRendering;
        array.push(node)
    }
    return array
}

export const DrawGraph= (props:{graph: GraphDataRendering, handleClick: any, handleMouseOver: any, handleMouseOut: any}) =>{
// export class DrawGraph extends React.Component{
    const nodeRadius = 35;
    
    // const sources = new Map([
    //   ["Grafo", ["grafo", d3Dag.dagStratify()]],
    //   ["X-Shape", ["ex", d3Dag.dagStratify()]],
    //   ["Zherebko", ["zherebko", d3Dag.dagConnect()]],
    //   [
    //     "Materials",
    //     [
    //       "materials",
    //       (data : any) => {
    //         const ids = new Map();
    //         const getId = (label: any) => {
    //           const id = ids.get(label);
    //           if (id === undefined) {
    //             const newId = ids.size.toString();
    //             ids.set(label, newId);
    //             return newId;
    //           } else {
    //             return id;
    //           }
    //         };
    //         const layout = d3Dag
    //           .dagConnect()
    //           // .sourceId((d) => getId(d.source))
    //           // .targetId((d) => getId(d.target));
    //         return layout(data);
    //       }
    //     ]
    //   ]
    // ])

    // const layerings = new Map([
    //   ["Simplex (shortest edges)", d3Dag.layeringSimplex()],
    //   // ["Longest Path (minimum height)", d3Dag.layeringLongestPath()],
    //   // ["Coffman Graham (constrained width)", d3Dag.layeringCoffmanGraham()],
    // ])
    // const layering = "Simplex (shortest edges)";

    // const decrossings = new Map([
    // [
    //   "Two Layer Greedy (fast)",
    //   d3Dag.decrossTwoLayer().order(d3Dag.twolayerGreedy().base(d3Dag.twolayerAgg()))
    // ],
    // // ["Two Layer Agg (fast)", d3Dag.decrossTwoLayer().order(d3Dag.twolayerAgg())],
    // // ["Optimal (can be very slow)", d3Dag.decrossOpt()],
    // // [
    // //   "Two Layer Opt (can be very slow)",
    // //   d3Dag.decrossTwoLayer().order(d3Dag.twolayerOpt())
    // // ]
    // ])

    // const coords = new Map([
    //   ["Simplex (medium)", d3Dag.coordSimplex()],
    //   // ["Quadratic (can be slow)", d3Dag.coordQuad()],
    //   // ["Greedy (fast)", d3.coordGreedy()],
    //   // ["Center (fast)", d3.coordCenter()]
    // ])

    //nodesizes
    
    // const padding = 1.5;
    // const base = nodeRadius * 2 * padding;
    // const nodeSizes = new  Map([
    //   [ "Less Space around Edges",
    //     (node: any) => {
    //       const size = node ? base : 5;
    //       return [1.2 * size, size];
    //     }
    //   ],
    //   ["Constant Separation", () => [base, base]]
    // ]);
    

    //splines
    // const splines = new Map([
    //   ["Default", undefined],
    //   ["Linear", d3Base.curveLinear],
    //   ["Step Before", d3Base.curveStepBefore]
    // ])

    // dag
    // const [key, reader] = sources.get(source);
    const [, reader]  =    ["grafo", d3Dag.dagStratify()];
    // const dag_data = await d3.json(`https://raw.githubusercontent.com/erikbrinkman/d3-dag/master/examples/${key}.json`);
    const dag_data = props.graph;
    if (dag_data === undefined) {
        return
    }
    var dag = reader(GraphDataToArray(dag_data));
    // applyTreeStructure(dag.roots()[0]);
    
    


    // const dag_data2 : GraphData = {
    //     "Seth":{
    //     "id": "Seth",
    //     "parentIds" : [],
    //     "childIds": [ "Awan"],
    //     "loaded": false
  
    //   },
    //     "Awan":{
    //     "id": "Awan",
    //     "parentIds": ["Seth"],
    //     "childIds": [],
    //     "loaded": false
  
    //   },
    // }
    // var dag2 = reader(GraphDataToArray(dag_data2));


    //laidout
    
    const layout = d3Dag
    .sugiyama()
    .layering(d3Dag.layeringSimplex())
    .decross(d3Dag.decrossOpt())
    // .decross(d3Dag.decrossTwoLayer().order(d3Dag.twolayerGreedy().base(d3Dag.twolayerAgg())))
    .coord(d3Dag.coordCenter())
    .nodeSize(()=>[1.5*2*nodeRadius, 1.2*1.5*2*nodeRadius]);
    // const start   = performance.now();
        const { width, height } = layout(dag);

    // const time = performance.now() - start;
    // const laidout =  { width, height, time, dag };
    // console.log("width:",width, "height : ", height)
    
    


    //picture
    
    // Use computed layout and get size
    // const { width, height, time, dag } = laidout;
    
    // This code only handles rendering
    // const nontemplatestring= '<svg xmlns='+'"http://localhost:3000/svg"'+' width="'+width+'" height="'+height+'"></svg>'
    const nontemplatestring= '<svg width="'+width+'" height="'+height+'"></svg>'

    const templateString = `${nontemplatestring}`;

    const svgNode = svg(templateString);
    // `<svg width= ${Width} height= ${Height}></svg>`;
    

    const svgSelection = d3Base.select(svgNode);
    const defs = svgSelection.append("defs"); // For gradients
    

    // Initialize color map
    const steps = dag.size();
    const interp = d3Base.interpolateRainbow;
    const colorMap :{[key: string]: string} = {};
    for (const [i, node] of [...dag].entries()) {
        let stringUniqueHash = [...node.data.id].reduce((acc, char) => {
            return char.charCodeAt(0) + ((acc << 5) - acc);
        }, 0);
        
        colorMap[node.data.id] = interp(((Math.sin(stringUniqueHash)/2+1/2)*10%1));
        // colorMap[node.data.id] = interp(i / steps);

    }
    
    // How to draw edges
    type Datatype= {x: any, y: any}
    const curve = undefined ??
        // splines.get(spline) ??
        (true ? d3Base.curveMonotoneY : d3Base.curveCatmullRom);
        // coord === "Simplex (medium)" ? ...
    const line = d3Base
        .line<Datatype>()
        .curve(curve)
        .x((d) => d.x)
        .y((d) => d.y);
    
    
    svgSelection
        .append("g")
        .selectAll("path")
        .data(dag.links())
        .enter()
        .append("path")
        .attr("d", ({ points }) => line(points))
        .attr("fill", "none")
        .attr("stroke-width", ({ source, target }) => {
            if ( props.graph[target.data.id].sentTreeVote==source.data.id) {
                return 6
            } else {
                return 2
            }
        })
        .attr("stroke", ({ source, target }) => {
        // encodeURIComponents for spaces, hope id doesn't have a `--` in it
        const gradId = encodeURIComponent(`${source.data.id}--${target.data.id}`);
        const grad = defs
            .append("linearGradient")
            .attr("id", gradId)
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("x1", source.x ?? 142)
            .attr("x2", target.x ?? 142)
            .attr("y1", source.y ?? 142)
            .attr("y2", target.y ?? 142);
        
        grad
            .append("stop")
            .attr("offset", "0%")
            .attr("stop-color", colorMap[source.data.id]);
        grad
            .append("stop")
            .attr("offset", "100%")
            .attr("stop-color", colorMap[target.data.id]);
        return `url(#${gradId})`;
        });

   
        
    // Select nodes
    const nodes = svgSelection
        .append("g")
        .selectAll("g")
        .data(dag.descendants())
        .enter()
        .append("g")
        .attr("transform", ({ x, y }) => `translate(${x}, ${y})`)
        .on("click", (n) => {props.handleClick(n.target.__data__.data.id)})
        .on("mouseover", (n)=>props.handleMouseOver(n, n.target.__data__.data))
        .on("mouseout",  props.handleMouseOut);
        
    
        
    // add script for button clicks
    //   nodes
    //   .append("script")
    //   .(()=> `console.log("Hello")`);
    //   ' window.addEventListener("DOMContentLoaded", () => {document.getElementById("button_${n.data.id}").addEventListener("click", function(){  console.log("hello")} ) })' );
    
    
    // Plot node circles
    nodes
        .append("circle")
        .attr("r", nodeRadius)
        .attr("fill", (n) => colorMap[n.data.id])
        ;

    
    
    // Plot Arrows
    const arrows= true;
    if (arrows) {
        const arrowSize = (nodeRadius * nodeRadius) / 5.0;
        const arrowLen = Math.sqrt((4 * arrowSize) / Math.sqrt(3));
        const arrow = d3Base.symbol().type(d3Base.symbolTriangle).size(arrowSize);
        
        svgSelection
        .append("g")
        .selectAll("path")
        .data(dag.links())
        .enter()
        .append("path")
        .attr("d", arrow)
        .attr("transform", ({ source, target, points }) => {
            const [end, start] = points.slice();//.reverse();
            // This sets the arrows the node radius (20) + a little bit (3) away from the node center, on the last line segment of the edge. This means that edges that only span ine level will work perfectly, but if the edge bends, this will be a little off.
            const dx :number = start.x - end.x;
            const dy :number = start.y - end.y;
            const scale = (nodeRadius * 1.15) / Math.sqrt(dx * dx + dy * dy);
            // This is the angle of the last line segment
            const angle = (Math.atan2(-dy, -dx) * 180) / Math.PI + 90;
            // console.log(angle, dx, dy);
            return `translate(${end.x + dx * scale}, ${
            end.y + dy * scale
            }) rotate(${angle})`;
        })
        .attr("fill", ({ source }) => colorMap[source.data.id])
        .attr("stroke", "white")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", `${arrowLen},${arrowLen}`);
    }
    
    // Add text to nodes
    nodes
        .append("text")
        .text((d) => d.data.name)
        .attr("fontWeight", "bold")
        .attr("fontFamily", "sans-serif")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("dominant-baseline", "middle")

        .attr("fill", "white");
    
    return (svgNode);
    

}

