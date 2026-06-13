import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Screen, Card, Kicker, Mono, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

const BUCKET = "progress";
type Photo = { name: string; path: string; url: string; date: string };
type Status = "loading" | "ready" | "no-auth" | "no-bucket";

// Progress photos on mobile — capture from the camera or library and upload to
// the same private Supabase Storage bucket the web app reads (progress/{uid}/…,
// owner-folder RLS). The phone is where these get taken, so this is the natural
// capture surface; the web Progress screen shows the same timeline.
export default function ProgressScreen() {
  const C = useTheme().palette;
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

    const { data, error } = await supabase.storage.from(BUCKET).list(id, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) return setStatus("no-bucket");
    const files = (data ?? []).filter((f) => f.id); // skip folder placeholders
    const paths = files.map((f) => `${id}/${f.name}`);
    const signed = paths.length ? (await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
    setPhotos(
      files.map((f, i) => ({
        name: f.name,
        path: `${id}/${f.name}`,
        url: signed[i]?.signedUrl ?? "",
        date: new Date(Number(f.name.split(".")[0]) || Date.parse(f.created_at ?? "") || Date.now()).toLocaleDateString(),
      })),
    );
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
    <Screen refreshing={status === "loading"} onRefresh={load}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>Progress photos</Kicker>
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>← back</Text>
      </View>

      {status === "no-auth" && (
        <Card style={{ marginTop: 10 }}>
          <Mono style={{ lineHeight: 20 }}>Sign in to capture your transformation timeline — photos are private to your account.</Mono>
        </Card>
      )}

      {status === "no-bucket" && (
        <Card style={{ marginTop: 10 }}>
          <Mono color={C.red} style={{ lineHeight: 20 }}>The progress storage bucket isn&apos;t set up yet.</Mono>
          <Mono style={{ lineHeight: 20, marginTop: 6 }}>Run reference/sql-progress-photos.sql in Supabase, then pull to refresh.</Mono>
        </Card>
      )}

      {status === "ready" && (
        <>
          <Card style={{ marginTop: 10 }}>
            <Mono style={{ lineHeight: 20, marginBottom: 12 }}>Same pose, same light, every couple of weeks. Private to you.</Mono>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={takePhoto} disabled={busy} style={{ flex: 1, backgroundColor: C.lime, borderRadius: 12, paddingVertical: 13, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontFamily: F.black, fontSize: 15, color: "#0c0d0c" }}>{busy ? "Uploading…" : "Take photo"}</Text>
              </Pressable>
              <Pressable onPress={pickFromLibrary} disabled={busy} style={{ flex: 1, borderWidth: 1, borderColor: `${C.lime}66`, borderRadius: 12, paddingVertical: 13, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: txt(C, C.lime) }}>From library</Text>
              </Pressable>
            </View>
          </Card>

          {photos.length === 0 ? (
            <Mono style={{ marginTop: 14 }}>No photos yet — add your first to start the timeline.</Mono>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 6 }}>
              {photos.map((p) => (
                <View key={p.path} style={{ width: "48.5%", marginTop: 12, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2 }}>
                  <Image source={{ uri: p.url }} style={{ width: "100%", aspectRatio: 3 / 4 }} resizeMode="cover" />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 8 }}>
                    <Mono style={{ fontSize: 12 }}>{p.date}</Mono>
                    <Text onPress={() => remove(p.path)} style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>delete</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
