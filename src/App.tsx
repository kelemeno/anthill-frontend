import React from 'react';
import * as d3Base from 'd3';
import * as d3Dag from 'd3-dag';
// import * as reactD3 from 'react-d3-dag';
// import Dag from 'react-d3-dag';
import './App.css';
// import { Point } from 'd3-dag/dist/dag';
import * as fs from 'fs';
import { stringify } from 'querystring';
// import * as svg from 'svg';
var svg = require('svg');
// var fs = require('fs');

// console.log(fs);

export const DrawGraph = () => {
  
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
  const dag_data = orgChart2;
  const dag = reader(dag_data);
  

  //laidout
   
    const layout = d3Dag
    .sugiyama()
    .layering(d3Dag.layeringSimplex())
    .decross(d3Dag.decrossTwoLayer().order(d3Dag.twolayerGreedy().base(d3Dag.twolayerAgg())))
    .coord(d3Dag.coordSimplex())
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
    console.log("width:",width, "height : ", height)
    const templateString = `<svg width="100%" height="1000"></svg>`;
    const svgNode = svg(templateString);
    // `<svg width= ${Width} height= ${Height}></svg>`;
    
    console.log("svgNode: ", svgNode)
    console.log( "type: ", typeof(svgNode))
    const svgSelection = d3Base.select(svgNode);
    const defs = svgSelection.append("defs"); // For gradients
  

    // Initialize color map
    const steps = dag.size();
    const interp = d3Base.interpolateRainbow;
    const colorMap :{[key: string]: string} = {};
    for (const [i, node] of [...dag].entries()) {
      colorMap[node.data.id] = interp(i / steps);
    }
  
    // How to draw edges
    type Datatype= {x: any, y: any}
    const curve = undefined ??
      // splines.get(spline) ??
      (true ? d3Base.curveMonotoneY : d3Base.curveCatmullRom);
      // coord === "Simplex (medium)" ?
    const line = d3Base
      .line<Datatype>()
      .curve(curve)
      .x((d) => d.x)
      .y((d) => d.y);
    

    // const decideNumber= (num: number|undefined):number|null => {
    //   if (num === undefined){
    //     return null
    //   }
    //   return num
    // }
    
    // Plot edges
    svgSelection
      .append("g")
      .selectAll("path")
      .data(dag.links())
      .enter()
      .append("path")
      .attr("d", ({ points }) => line(points))
      .attr("fill", "none")
      .attr("stroke-width", 3)
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
      .attr("transform", ({ x, y }) => `translate(${x}, ${y})`);
  
    // Plot node circles
    nodes
      .append("circle")
      .attr("r", nodeRadius)
      .attr("fill", (n) => colorMap[n.data.id]);
  
    // Plot Arrows
    const arrows= false;
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
          const [end, start] = points.slice().reverse();
          // This sets the arrows the node radius (20) + a little bit (3) away from the node center, on the last line segment of the edge. This means that edges that only span ine level will work perfectly, but if the edge bends, this will be a little off.
          const dx :number = start.x - end.x;
          const dy :number = start.y - end.y;
          const scale = (nodeRadius * 1.15) / Math.sqrt(dx * dx + dy * dy);
          // This is the angle of the last line segment
          const angle = (Math.atan2(-dy, -dx) * 180) / Math.PI + 90;
          console.log(angle, dx, dy);
          return `translate(${end.x + dx * scale}, ${
            end.y + dy * scale
          }) rotate(${angle})`;
        })
        .attr("fill", ({ target }) => colorMap[target.data.id])
        .attr("stroke", "white")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", `${arrowLen},${arrowLen}`);
    }
  
    // Add text to nodes
    nodes
      .append("text")
      .text((d) => d.data.id)
      .attr("fontWeight", "bold")
      .attr("fontFamily", "sans-serif")
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("dominant-baseline", "middle")

      .attr("fill", "white");
    
    return (svgNode);
  

}

// type IsNever<T> = [T] extends [never] ? true : false;
// type Res1 = IsNever<never> // 'true' ✅
// type Res2 = IsNever<number> // 'false' 

export const App2 =() =>{
  const svg  = React.useRef<HTMLDivElement>(null);

  var s = new XMLSerializer();
  var str = s.serializeToString(DrawGraph());
  console.log("image text", str)

  React.useEffect(()=>{
    // var s = new XMLSerializer();
    // var str = s.serializeToString(DrawGraph());
    // console.log("image text", str)
    
    if (svg.current){
      
      svg.current.appendChild(DrawGraph())
    } 
  }, []);

  return (
    
    <div ref={svg}/>
  );
}

export default class App extends React.Component {
  Image =  DrawGraph();
  MySvg = () => this.Image;
  ref: SVGSVGElement;

  // var Zeroth = Imag[0]
  // Image = this.ImageF()

  // a=fs.writeFile('test.svg', (this.Image), (err:any) => {

  //   if(err) throw err;
  //   console.log("file saved");
  // })


  // componentDidMount() {

  //   this.ref= this.Image;
  
  // }
  

  render(){
    console.log("Image: ", this.Image);
    console.log("typeof Image: ",typeof(this.Image))
    console.log("DrawGraph: ", DrawGraph)
    console.log("typeof DrawGraph: ",typeof(DrawGraph))

    // var s = new XMLSerializer();
    // var str = s.serializeToString(this.Image);
    // console.log("image text", str)
    
    
    return (
      // <div>
      // <svg xmlns="http://www.w3.org/2000/svg" width="360" height="180"><defs><linearGradient id="Eve--Cain" gradientUnits="userSpaceOnUse" x1="150" x2="330" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(71, 117, 222)"/></linearGradient><linearGradient id="Eve--Seth" gradientUnits="userSpaceOnUse" x1="150" x2="270" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(121, 246, 89)"/></linearGradient><linearGradient id="Eve--Abel" gradientUnits="userSpaceOnUse" x1="150" x2="210" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(201, 211, 58)"/></linearGradient><linearGradient id="Eve--Awan" gradientUnits="userSpaceOnUse" x1="150" x2="150" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(255, 140, 56)"/></linearGradient><linearGradient id="Eve--Enoch" gradientUnits="userSpaceOnUse" x1="150" x2="90" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(255, 83, 117)"/></linearGradient><linearGradient id="Eve--Azura" gradientUnits="userSpaceOnUse" x1="150" x2="30" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(200, 61, 172)"/></linearGradient><linearGradient id="Seth--Enos" gradientUnits="userSpaceOnUse" x1="270" x2="330" y1="90" y2="150"><stop offset="0%" stopColor="rgb(121, 246, 89)"/><stop offset="100%" stopColor="rgb(30, 184, 208)"/></linearGradient><linearGradient id="Seth--Noam" gradientUnits="userSpaceOnUse" x1="270" x2="270" y1="90" y2="150"><stop offset="0%" stopColor="rgb(121, 246, 89)"/><stop offset="100%" stopColor="rgb(40, 234, 141)"/></linearGradient></defs><g><path d="M150,30L330,90" fill="none" strokeWidth="3" stroke="url(#Eve--Cain)"/><path d="M150,30L270,90" fill="none" strokeWidth="3" stroke="url(#Eve--Seth)"/><path d="M150,30L210,90" fill="none" strokeWidth="3" stroke="url(#Eve--Abel)"/><path d="M150,30L150,90" fill="none" strokeWidth="3" stroke="url(#Eve--Awan)"/><path d="M150,30L90,90" fill="none" strokeWidth="3" stroke="url(#Eve--Enoch)"/><path d="M150,30L30,90" fill="none" strokeWidth="3" stroke="url(#Eve--Azura)"/><path d="M270,90L330,150" fill="none" strokeWidth="3" stroke="url(#Seth--Enos)"/><path d="M270,90L270,150" fill="none" strokeWidth="3" stroke="url(#Seth--Noam)"/></g><g><g transform="translate(150, 30)"><circle r="20" fill="rgb(110, 64, 170)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Eve</text></g><g transform="translate(30, 90)"><circle r="20" fill="rgb(200, 61, 172)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Azura</text></g><g transform="translate(90, 90)"><circle r="20" fill="rgb(255, 83, 117)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Enoch</text></g><g transform="translate(150, 90)"><circle r="20" fill="rgb(255, 140, 56)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Awan</text></g><g transform="translate(210, 90)"><circle r="20" fill="rgb(201, 211, 58)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Abel</text></g><g transform="translate(270, 90)"><circle r="20" fill="rgb(121, 246, 89)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Seth</text></g><g transform="translate(270, 150)"><circle r="20" fill="rgb(40, 234, 141)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Noam</text></g><g transform="translate(330, 150)"><circle r="20" fill="rgb(30, 184, 208)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Enos</text></g><g transform="translate(330, 90)"><circle r="20" fill="rgb(71, 117, 222)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Cain</text></g></g></svg>
      // <div>{this.Image}</div>
      // str.toString()
      // this.Image.outerHTML
      // <object data={this.Image} type="image/svg+xml" />
      // <object data = {DrawGraph()} type="image/svg+xml"/>
      // DrawGraph()
      // <svg width="100%" height="100%" dangerouslySetInnerHTML={{__html: this.Image.innerHTML}} />
      <App2 />
      // <svg className="links" ref={this.Image} width={360} height={180}/>
      
      // <this.MySvg/>
      // </div>
    )
    // return(
    //   DrawGraph()
    // )
  }

}



// function App()  {
//   return (
//     <header className="App-header">
//     <div className="App">
//     Hello
//     </div>
//     </ header>
//   );
// }


// const data = [{ id: "parent" }, { id: "child1", parentIds: ["parent"] }, { id: "child2", parentIds: ["parent"] }, { id: "grandchild", parentIds: ["child1", "child2"] }];
// const dag = d3Dag.dagStratify()(data);
// console.log("dag initially: ", dag)
// console.log(typeof(dag))


// const layout = d3Dag
//     .sugiyama() // base layout
//     .decross(d3Dag.decrossOpt()); // minimize number of crossings
//   const { width, height } = layout(dag);

// layout(dag)
// console.log("dag after: ", dag)
// console.log(typeof(dag))

// export default function OrgChartTree() {
//   return (
//       d3Dag.renderDag(dag)
    
//   );
// }











// This is a simplified example of an org chart with a depth of 2.
// Note how deeper levels are defined recursively via the `children` property.
const orgChart = {
  name: 'CEO',
  id: '1',
  children: [
    {
      name: 'Manager',
      id: '2',
      attributes: {
        
        department: 'Production',
      },
      children: [
        {
          name: 'Foreman',
          id: '3',
         
          children: [
            {
              name: 'Worker',
              id : '5',
            },
          ],
        },
        {
          name: 'Foreman',
          id: '4',
          children: [
            {
              name: 'Worker',
              id : '5',
            },
          ],
        },
      ],
    },
  ],
};


const orgChart2 = [
  {
    "id": "Root",
    "parentIds" : ["Zittu"],
  },
  {
    "id": "Cain",
    "parentIds": ["Root"]
  },
  {
    "id": "Seth",
    "parentIds": ["Root"]
  },
  {
    "id": "Enos",
    "parentIds": ["Seth"]
  },
  {
    "id": "Noam",
    "parentIds": ["Seth"]
  },
  {
    "id": "Abel",
    "parentIds": ["Root"]
  },
  {
    "id": "Awan",
    "parentIds": ["Root"]
  },
  {
    "id": "Enoch",
    "parentIds": ["Root"]
  },
  {
    "id": "Azura",
    "parentIds": ["Root"]
  },
  {
    "id": "C1",
    "parentIds": ["Abel"]
  },
  {
    "id": "C2",
    "parentIds": ["Abel"]
  },
  {
    "id": "C3",
    "parentIds": ["Abel", "Noam"]
  },
  {
    "id": "C4",
    "parentIds": ["Noam", "C3", "C2"]
  },
  {
    "id": "C5",
    "parentIds": ["Awan", "C2", "C1"]
  },
  {
    "id": "C6",
    "parentIds": ["Enos", "Seth"]
  },
  {
    "id": "C7",
    "parentIds": ["Awan", "C3", "C6"]
  },
  {
    "id": "C8",
    "parentIds": ["Awan", "C4", "C5"]
  },
  {
    "id": "C9",
    "parentIds": ["Awan", "C4", "C5"]
  },
  {
    "id": "C10",
    "parentIds": ["C8", "C9", "C5"]
  },
  {
    "id": "Zittu",
    "parentIds": []
  },


]



// import logo from './logo.svg';
// import './App.css';
// //import data from './data';

// function App() {
//   return (
//     <div className="App">
//       <header className="App-header">
     
     
//       </header>
//       <body></body>
//     </div>
//   );
// }

// export default App;
