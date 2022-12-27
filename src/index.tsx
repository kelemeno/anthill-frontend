// import * as React from 'react';
// import * as ReactDOM from 'react-dom';
import * as client from 'react-dom/client';
import App from './App';
import App2 from './App';

// import App2 from './App';

import './index.css';
import { DrawGraph } from './App';
var svg = require('svg');

// import data from "./miserables";
// var svg = require('svg');
// ReactDOM.createRoot(
//   <App/>,
//   document.getElementById('root'));
const doc = document.getElementById('root')
const root = client.createRoot(doc!);
// var s = new XMLSerializer();
// var str = s.serializeToString(DrawGraph());
// console.log("stringified", JSON.stringify(DrawGraph()));
// const svgImage = svg`${str}`;
root.render(
//   <React.StrictMode>
    // DrawGraph().outerHTML
        // <svg xmlns="http://www.w3.org/2000/svg" width="360" height="180"><defs><linearGradient id="Eve--Cain" gradientUnits="userSpaceOnUse" x1="150" x2="330" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(71, 117, 222)"/></linearGradient><linearGradient id="Eve--Seth" gradientUnits="userSpaceOnUse" x1="150" x2="270" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(121, 246, 89)"/></linearGradient><linearGradient id="Eve--Abel" gradientUnits="userSpaceOnUse" x1="150" x2="210" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(201, 211, 58)"/></linearGradient><linearGradient id="Eve--Awan" gradientUnits="userSpaceOnUse" x1="150" x2="150" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(255, 140, 56)"/></linearGradient><linearGradient id="Eve--Enoch" gradientUnits="userSpaceOnUse" x1="150" x2="90" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(255, 83, 117)"/></linearGradient><linearGradient id="Eve--Azura" gradientUnits="userSpaceOnUse" x1="150" x2="30" y1="30" y2="90"><stop offset="0%" stopColor="rgb(110, 64, 170)"/><stop offset="100%" stopColor="rgb(200, 61, 172)"/></linearGradient><linearGradient id="Seth--Enos" gradientUnits="userSpaceOnUse" x1="270" x2="330" y1="90" y2="150"><stop offset="0%" stopColor="rgb(121, 246, 89)"/><stop offset="100%" stopColor="rgb(30, 184, 208)"/></linearGradient><linearGradient id="Seth--Noam" gradientUnits="userSpaceOnUse" x1="270" x2="270" y1="90" y2="150"><stop offset="0%" stopColor="rgb(121, 246, 89)"/><stop offset="100%" stopColor="rgb(40, 234, 141)"/></linearGradient></defs><g><path d="M150,30L330,90" fill="none" strokeWidth="3" stroke="url(#Eve--Cain)"/><path d="M150,30L270,90" fill="none" strokeWidth="3" stroke="url(#Eve--Seth)"/><path d="M150,30L210,90" fill="none" strokeWidth="3" stroke="url(#Eve--Abel)"/><path d="M150,30L150,90" fill="none" strokeWidth="3" stroke="url(#Eve--Awan)"/><path d="M150,30L90,90" fill="none" strokeWidth="3" stroke="url(#Eve--Enoch)"/><path d="M150,30L30,90" fill="none" strokeWidth="3" stroke="url(#Eve--Azura)"/><path d="M270,90L330,150" fill="none" strokeWidth="3" stroke="url(#Seth--Enos)"/><path d="M270,90L270,150" fill="none" strokeWidth="3" stroke="url(#Seth--Noam)"/></g><g><g transform="translate(150, 30)"><circle r="20" fill="rgb(110, 64, 170)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Eve</text></g><g transform="translate(30, 90)"><circle r="20" fill="rgb(200, 61, 172)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Azura</text></g><g transform="translate(90, 90)"><circle r="20" fill="rgb(255, 83, 117)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Enoch</text></g><g transform="translate(150, 90)"><circle r="20" fill="rgb(255, 140, 56)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Awan</text></g><g transform="translate(210, 90)"><circle r="20" fill="rgb(201, 211, 58)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Abel</text></g><g transform="translate(270, 90)"><circle r="20" fill="rgb(121, 246, 89)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Seth</text></g><g transform="translate(270, 150)"><circle r="20" fill="rgb(40, 234, 141)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Noam</text></g><g transform="translate(330, 150)"><circle r="20" fill="rgb(30, 184, 208)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Enos</text></g><g transform="translate(330, 90)"><circle r="20" fill="rgb(71, 117, 222)"/><text fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" alignmentBaseline="middle" fill="white">Cain</text></g></g></svg>
        // str
        // <object data={DrawGraph()}/>
        <App2/>
    //   </React.StrictMode>
);