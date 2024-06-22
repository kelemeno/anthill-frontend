# Frontend for Anthill

## Getting started

Development: run smartcontracts(see repo) on devnet(see repo), and run npm start here.

## Components:

- index.tsx main file, renders the main buttons, connect to metamask, get test tokens, jump home, maybe tutorial.
- App.tsx main rendering logic, displays and handles interactions with the graph rendering and loadGraph module. Displays popups,
- DrawGraph: draws Graph provided by App.tsx and loaded from LoadGraph
- LoadGraph: loads Graph from Database, updates as needed.
