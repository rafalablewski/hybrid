import { useCallback, useEffect, useState } from "react";
import { View, Text, Image, Share } from "react-native";
import { sketchBrief, sketchCoverage, FEEDBACK } from "@hybrid/core";
import { fs, space, Mono, Chip, LoadSwap, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Banner, ErrorNote, Input, PillBtn } from "./_kit";
import { ACard, cardStack , RADIUS} from "../aurora/kit";
import { adminGet, adminSend } from "../../lib/admin-api";
import { useConfirm } from "../aurora/confirm";

// Mobile parity for apps/web/components/admin/media.tsx. Same /api/admin/media
// (+/[id]) backend: list assets and manage them — edit metadata (title/alt/
// tags), the draft→published→archived lifecycle, delete, and reveal the public
// CDN URL. NOTE: uploading new bytes is out of v1 scope on mobile (the web
// console does the Supabase Storage upload); everything else works.

type Status = "draft" | "published" | "archived";
type Kind = "image" | "video" | "other";

type Asset = {
  id: string;
  path: string;
  url: string;
  title: string;
  alt: string | null;
  kind: Kind;
  contentType: string | null;
  sizeBytes: number | null;
  tags: string[];
  status: Status;
  authorEmail: string | null;
  createdAt: string;
};

type ListResp = { assets?: Asset[]; unavailable?: boolean };

function fmtSize(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminMedia() {
  const { confirm, notify } = useConfirm();
  const { palette } = useTheme();
  const [list, setList] = useState<Asset[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; alt: string; tags: string }>({ title: "", alt: "", tags: "" });

  const load = useCallback(async () => {
    const r = await adminGet<ListResp>("/api/admin/media");
    if (!r.ok || !r.data) {
      setFailed(true);
      setList([]);
      return;
    }
    setFailed(false);
    setUnavailable(Boolean(r.data.unavailable));
    setList(r.data.assets ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(a: Asset) {
    setForm({ title: a.title, alt: a.alt ?? "", tags: a.tags.join(", ") });
    setEdit(a.id);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const r = await adminSend("PATCH", `/api/admin/media/${id}`, body);
    setBusy(false);
    setEdit(null);
    if (!r.ok) setErr("That change didn't save — re-syncing.");
    load();
  }

  async function remove(a: Asset) {
    const ok = await confirm({ title: "Delete asset", message: `Delete “${a.title}” permanently (file + catalog entry)?`, confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    const r = await adminSend("DELETE", `/api/admin/media/${a.id}`);
    setBusy(false);
    if (!r.ok) setErr("Delete failed — re-syncing.");
    load();
  }

  function showUrl(a: Asset) {
    void notify("Public URL", a.url);
  }

  return (
    <LoadSwap loading={list === null && !failed}>
      {() => {
        if (list === null && !failed) return null;
        if (failed) return <ErrorNote error="Couldn't load the media library. Pull to retry." />;
        // The sketch backlog is computed from the shipped catalog, so it stands even
        // when the media table/bucket isn't initialized yet.
        if (unavailable)
          return (
            <View>
              <SketchCoverage />
              <Banner tone="amber" title="Media library not initialized">
                The MediaAsset table + media bucket don&apos;t exist yet. Run reference/sql-media-library.sql in the Supabase SQL
                Editor, then reload.
              </Banner>
            </View>
          );

        const statusColor = (s: Status) => (s === "published" ? palette.lime : s === "archived" ? palette.amber : palette.ash);

        return (
          <View>
            <SketchCoverage />
            <Mono color={palette.ash} style={{ marginBottom: 6, lineHeight: 18 }}>
              {list ? `${list.length} asset${list.length === 1 ? "" : "s"}` : "…"} – public CDN URLs
            </Mono>
            <Banner tone="amber" title="Uploading is web-only">
              Add new clips/images from the web admin console — mobile uploads aren&apos;t in v1. You can manage, edit, and
              delete existing assets here.
            </Banner>

            {err ? <ErrorNote error={err} onDismiss={() => setErr(null)} /> : null}

            {list?.map((a) => (
              <ACard key={a.id} accent={statusColor(a.status)} style={cardStack}>
                {a.kind === "image" ? (
                  <Image
                    source={{ uri: a.url }}
                    style={{ width: "100%", height: 150, borderRadius: RADIUS.field, marginBottom: 10, backgroundColor: palette.ink2 }}
                    resizeMode="cover"
                  />
                ) : null}

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 6 }}>
                  <Chip color={statusColor(a.status)}>{a.status}</Chip>
                  <Chip color={palette.ash}>{a.kind}</Chip>
                  {a.sizeBytes ? <Chip color={palette.ash}>{fmtSize(a.sizeBytes)}</Chip> : null}
                </View>

                {edit === a.id ? (
                  <View>
                    <Input label="Title" value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} placeholder="Title" />
                    <Input label="Alt / caption" value={form.alt} onChangeText={(t) => setForm({ ...form, alt: t })} placeholder="Alt / caption" />
                    <Input label="Tags (comma-separated)" value={form.tags} onChangeText={(t) => setForm({ ...form, tags: t })} placeholder="tags, comma-separated" />
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                      <PillBtn
                        label="Save"
                        disabled={busy}
                        onPress={() =>
                          patch(a.id, {
                            title: form.title,
                            alt: form.alt || null,
                            tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
                          })
                        }
                      />
                      <PillBtn label="Cancel" outline color={palette.ash} disabled={busy} onPress={() => setEdit(null)} />
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: palette.chalk }}>{a.title}</Text>
                    {a.tags.length > 0 ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 6 }}>
                        {a.tags.map((t) => <Chip key={t} color={palette.ash}>{t}</Chip>)}
                      </View>
                    ) : null}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12 }}>
                      <PillBtn label="Show URL" outline color={palette.ash} onPress={() => showUrl(a)} />
                      <PillBtn label="Edit" outline color={palette.ash} disabled={busy} onPress={() => openEdit(a)} />
                      {a.status !== "published" ? (
                        <PillBtn label="Publish" outline disabled={busy} onPress={() => patch(a.id, { status: "published" })} />
                      ) : (
                        <PillBtn label="Unpublish" outline color={palette.ash} disabled={busy} onPress={() => patch(a.id, { status: "draft" })} />
                      )}
                      {a.status !== "archived" ? (
                        <PillBtn label="Archive" outline color={palette.amber} disabled={busy} onPress={() => patch(a.id, { status: "archived" })} />
                      ) : null}
                      <PillBtn label="Delete" outline color={FEEDBACK.error.text} disabled={busy} onPress={() => remove(a)} />
                    </View>
                  </>
                )}
              </ACard>
            ))}

            {list && list.length === 0 ? (
              <Mono color={palette.ash} style={{ textAlign: "center", paddingVertical: 24 }}>
                No media yet. Upload a demo clip or image from the web console to start the library.
              </Mono>
            ) : null}
          </View>
        );
      }}
    </LoadSwap>
  );
}

/**
 * EXERCISE DEMO SKETCHES — how much of the exercise catalog has real hand-drawn
 * art, and the commissioning brief for what's left. Everything not yet drawn
 * falls back to the procedural stick-figure demo in the app, so this is the
 * backlog that retires the placeholder. Numbers come from core (exercise-media):
 * the registry of delivered art plus any library row pointed at an uploaded
 * asset. Web twin: apps/web/components/admin/media.tsx (which also copies the
 * brief to the clipboard — here it goes out through the share sheet).
 */
function SketchCoverage() {
  const { palette } = useTheme();
  const cov = sketchCoverage();
  const worst = cov.byArchetype.filter((a) => a.pending > 0).slice(0, 10);

  return (
    <ACard style={cardStack}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: palette.chalk }}>Exercise demo sketches</Text>
      <Mono color={palette.ash} style={{ marginTop: 6, lineHeight: 18 }}>
        {cov.drawn} of {cov.total} lifts drawn{cov.pattern > 0 ? `, ${cov.pattern} on a pattern stand-in` : ""} – {cov.pct}% covered.
        Every undrawn lift shows the procedural stick-figure demo until its sketch lands.
      </Mono>
      <View style={{ height: 6, borderRadius: RADIUS.mark, backgroundColor: palette.ink, overflow: "hidden", marginTop: 12 }}>
        <View style={{ height: "100%", width: `${cov.pct}%`, backgroundColor: palette.lime, borderRadius: RADIUS.mark }} />
      </View>

      {worst.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <Mono color={palette.ash} style={{ marginBottom: 6 }}>Still to draw, by movement pattern</Mono>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {worst.map((a) => <Chip key={a.archetype} color={palette.ash}>{`${a.archetype} ${a.pending}`}</Chip>)}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 14 }}>
        <PillBtn
          label="Share illustrator brief"
          outline
          color={palette.ash}
          onPress={() => { void Share.share({ message: sketchBrief() }).catch(() => {}); }}
        />
      </View>
      <Mono color={palette.ash} style={{ marginTop: 10, lineHeight: 18 }}>
        The brief carries the drawing spec and every remaining lift with the filename slot to deliver it under. Upload the
        finished art from the web console, then either register it in core (registerSketchMedia) or paste a URL into the
        exercise&apos;s demo-video field.
      </Mono>
    </ACard>
  );
}
