import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const BUCKET = "progress";
type Photo = { name: string; path: string; url: string; date: string };
type Status = "loading" | "ready" | "no-auth" | "no-bucket";

/** AURORA Progress photos — same private Supabase Storage capture/timeline as
 *  the classic, in the rounded Aurora style. */
export default function AuroraProgress() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return setStatus("no-auth");
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (!id) return setStatus("no-auth");
    const { data, error } = await supabase.storage.from(BUCKET).list(id, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) return setStatus("no-bucket");
    const files = (data ?? []).filter((f) => f.id);
    const paths = files.map((f) => `${id}/${f.name}`);
    const signed = paths.length ? (await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
    setPhotos(files.map((f, i) => ({
      name: f.name,
      path: `${id}/${f.name}`,
      url: signed[i]?.signedUrl ?? "",
      date: new Date(Number(f.name.split(".")[0]) || Date.parse(f.created_at ?? "") || Date.now()).toLocaleDateString(),
    })));
    setStatus("ready");
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!uid) return;
    setBusy(true);
    try {
      const arraybuffer = await fetch(asset.uri).then((r) => r.arrayBuffer());
      const ext = (asset.mimeType?.split("/")[1] || asset.fileName?.split(".").pop() || "jpg").toLowerCase();
      const path = `${uid}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, arraybuffer, { contentType: asset.mimeType ?? "image/jpeg" });
      if (error) { Alert.alert("Upload failed", error.message); setStatus("no-bucket"); }
      else await load();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again.");
    }
    setBusy(false);
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Allow photo access to add progress photos.");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!res.canceled && res.assets[0]) upload(res.assets[0]);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Allow camera access to take progress photos.");
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]) upload(res.assets[0]);
  };

  const remove = (path: string) =>
    Alert.alert("Delete photo?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await supabase.storage.from(BUCKET).remove([path]); load(); } },
    ]);

  return (
    <AuroraScreen refreshing={status === "loading"} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>Progress photos</AHeading>
      </View>

      {status === "no-auth" && (
        <ACard style={{ marginTop: 18 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 20 }}>Sign in to capture your transformation timeline — photos are private to your account.</Text>
        </ACard>
      )}
      {status === "no-bucket" && (
        <ACard style={{ marginTop: 18 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: txt(C, C.red), lineHeight: 20 }}>The progress storage bucket isn&apos;t set up yet.</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: 18, marginTop: 6 }}>Run reference/sql-progress-photos.sql in Supabase, then pull to refresh.</Text>
        </ACard>
      )}

      {status === "ready" && (
        <>
          <ACard style={{ marginTop: 18 }}>
            <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 20, marginBottom: 14 }}>Same pose, same light, every couple of weeks. Private to you.</Text>
            <View style={{ flexDirection: "row", gap: space.ms }}>
              <Pressable onPress={takePhoto} disabled={busy} style={{ flex: 1, flexDirection: "row", gap: 7, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : 1 }}>
                <AuroraIcon name="add" size={18} color={C.onAccent} />
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.onAccent }}>{busy ? "Uploading…" : "Take photo"}</Text>
              </Pressable>
              <Pressable onPress={pickFromLibrary} disabled={busy} style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>From library</Text>
              </Pressable>
            </View>
          </ACard>

          {photos.length === 0 ? (
            <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 16 }}>No photos yet — add your first to start the timeline.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 4 }}>
              {photos.map((p) => (
                <View key={p.path} style={{ width: "48.5%", marginTop: 12, borderRadius: RADIUS.card, overflow: "hidden", borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2 }}>
                  <Image source={{ uri: p.url }} style={{ width: "100%", aspectRatio: 3 / 4 }} resizeMode="cover" />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{p.date}</Text>
                    <Text onPress={() => remove(p.path)} style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.red) }}>delete</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </AuroraScreen>
  );
}
