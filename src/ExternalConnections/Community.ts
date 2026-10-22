// Invites, profiles and reputation-weighted polls, talking to the backend as
// the signed-in passkey user.
import { type Api, request } from "./Passkey";

export type PollView = {
  id: string;
  by: string;
  byName: string;
  question: string;
  options: string[];
  createdAt: string;
  closedAt?: string;
  // per option: total reputation (18 decimals, as a string) and voter count
  tally: { weight: string; voters: number }[];
  myVote?: number;
};

//// invites

export async function createInvite(api: Api): Promise<{ code: string; expires: string }> {
  return request(api.backendUrl, "invites", {}, api.session?.token);
}

export async function getInvite(
  backendUrl: string,
  code: string,
): Promise<{ inviter: { id: string; name: string }; expires: string }> {
  return request(backendUrl, `invites/${encodeURIComponent(code)}`, undefined);
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
}

//// profiles

export async function saveProfile(api: Api, bio: string, link: string) {
  return request(api.backendUrl, "profile", { bio, link }, api.session?.token);
}

//// polls

export async function listPolls(api: Api): Promise<PollView[]> {
  const { polls } = await request<{ polls: PollView[] }>(
    api.backendUrl,
    "polls",
    undefined,
    api.session?.token,
  );
  return polls;
}

export async function createPoll(api: Api, question: string, options: string[]) {
  return request(api.backendUrl, "polls", { question, options }, api.session?.token);
}

export async function votePoll(api: Api, id: string, option: number) {
  return request(api.backendUrl, `polls/${id}/vote`, { option }, api.session?.token);
}

export async function closePoll(api: Api, id: string) {
  return request(api.backendUrl, `polls/${id}/close`, {}, api.session?.token);
}

// Reputation is stored with 18 decimals; show it with two.
export function formatReputation(weight: string): string {
  const hundredths = BigInt(weight) / 10n ** 16n;
  return (Number(hundredths) / 100).toFixed(2);
}
