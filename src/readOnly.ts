// Hosted read-only showcase build (anthilldao.dev): `VITE_READ_ONLY=true npm run
// build`. When true the app only browses the graph served by the snapshot-mode
// backend — wallet connection and all on-chain action buttons are hidden, so
// there's no chain, no keys, nothing to transact.
export const READ_ONLY = import.meta.env.VITE_READ_ONLY === "true";
