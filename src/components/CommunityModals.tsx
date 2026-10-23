// Starting a community (you become the root of its tree) and, for its founder,
// changing its name, description, visibility and who can join.
import { Globe, Lock } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
  type Community,
  type CommunitySettings,
  createCommunity,
  isCancel,
  saveCommunitySettings,
  slugify,
} from "../api";
import { useApp } from "../state";
import { Button, communityPath, cx, Field, Modal, useAppNavigate } from "../ui";

export function CreateCommunityModal(props: { onClose: () => void }) {
  const { session, reload, notify } = useApp();
  const navigate = useAppNavigate();
  const [settings, setSettings] = useState<CommunitySettings>({
    name: "",
    description: "",
    visibility: "public",
    joinPolicy: "open",
  });
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const address = idEdited ? id : slugify(settings.name);

  const create = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const community = await createCommunity(session, { id: address, ...settings });
      reload();
      notify(`${community.name} is ready. You're at the top of its tree.`);
      props.onClose();
      navigate(communityPath(community.id, "/"), { global: true });
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Start a community"
      wide
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !settings.name.trim() || address.length < 3} onClick={create}>
            Start {settings.name.trim() || "community"}
          </Button>
        </>
      }
    >
      <p>
        A community is its own tree with its own reputation and polls. You start at the top;
        everyone you invite joins below you. Your account and profile stay the same everywhere.
      </p>
      <SettingsFields settings={settings} onChange={setSettings} autoFocus />
      <Field
        label="Address"
        value={address}
        onChange={(v) => {
          setIdEdited(true);
          setId(v.toLowerCase().replace(/[^a-z0-9-]/g, ""));
        }}
        maxLength={32}
        hint={`${window.location.host}/c/${address || "…"} · letters, digits and dashes; can't be changed later`}
      />
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
    </Modal>
  );
}

export function CommunitySettingsModal(props: { community: Community; onClose: () => void }) {
  const { session, reload, notify } = useApp();
  const { name, description, visibility, joinPolicy } = props.community;
  const [settings, setSettings] = useState<CommunitySettings>({ name, description, visibility, joinPolicy });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await saveCommunitySettings(session, props.community.id, settings);
      reload();
      notify("Settings saved.");
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Community settings"
      wide
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !settings.name.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <SettingsFields settings={settings} onChange={setSettings} />
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
    </Modal>
  );
}

function SettingsFields(props: {
  settings: CommunitySettings;
  onChange: (settings: CommunitySettings) => void;
  autoFocus?: boolean;
}) {
  const { settings, onChange } = props;
  const set = (changes: Partial<CommunitySettings>) => onChange({ ...settings, ...changes });
  return (
    <>
      <Field
        label="Name"
        value={settings.name}
        onChange={(name) => set({ name })}
        maxLength={60}
        autoFocus={props.autoFocus}
        placeholder="Book club, Lisbon builders, …"
      />
      <Field
        label="What it's about (optional)"
        value={settings.description}
        onChange={(description) => set({ description })}
        maxLength={280}
        multiline
        hint={`${settings.description.length}/280`}
      />
      <p className="mt-4 mb-1 text-[13px] font-medium text-slate-700">Who can see it</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Choice
          selected={settings.visibility === "public"}
          onSelect={() => set({ visibility: "public" })}
          icon={<Globe size={16} />}
          title="Public"
        >
          Anyone can see the tree, its people and polls, and find it in the list.
        </Choice>
        <Choice
          selected={settings.visibility === "private"}
          onSelect={() => set({ visibility: "private", joinPolicy: "invite" })}
          icon={<Lock size={16} />}
          title="Private"
        >
          Only members can see it. People join with an invite link from a member.
        </Choice>
      </div>
      {settings.visibility === "public" && (
        <>
          <p className="mt-4 mb-1 text-[13px] font-medium text-slate-700">Who can join</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice selected={settings.joinPolicy === "open"} onSelect={() => set({ joinPolicy: "open" })} title="Anyone">
              Anyone signed in can take a free spot in the tree.
            </Choice>
            <Choice
              selected={settings.joinPolicy === "invite"}
              onSelect={() => set({ joinPolicy: "invite" })}
              title="Invited people"
            >
              Joining needs an invite link from a member.
            </Choice>
          </div>
        </>
      )}
    </>
  );
}

function Choice(props: {
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      onClick={props.onSelect}
      className={cx(
        "rounded-xl border p-3 text-left transition-colors",
        props.selected
          ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
          : "border-slate-200 hover:border-slate-300",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        {props.icon}
        {props.title}
      </span>
      <span className="mt-1 block text-[13px] text-slate-600">{props.children}</span>
    </button>
  );
}
