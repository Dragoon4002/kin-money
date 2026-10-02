import { CameraView, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Flashlight } from "lucide-react-native";
import { useRef, useState } from "react";
import type { Address } from "viem";
import { Pressable, Vibration, View } from "react-native";
import { Button, ErrorText, Screen, Text } from "@/components/ui";
import { API_BASE } from "@/lib/config";
import { kinTarget, parseWalletUri } from "@/lib/scan";
import { useTheme } from "@/theme";

/** Scan & pay: camera QR → native Pay screen (or claim/invoice/chores on web). */
export default function Scan() {
  const t = useTheme();
  const [perm, requestPerm] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [err, setErr] = useState("");
  const done = useRef(false);

  async function handle(text: string) {
    if (done.current) return;
    const wallet = parseWalletUri(text);
    if (wallet === "other") return setErr("That code can't be paid from Kin.");
    if (wallet) return payAccount(wallet.to, wallet.units);
    const path = kinTarget(text, API_BASE);
    if (!path) return setErr("That's not a Kin code. Ask them to open My QR in Kin.");
    done.current = true;
    Vibration.vibrate(30);
    if (path.startsWith("/send")) return router.replace(path as Href);
    await WebBrowser.openBrowserAsync(API_BASE + path);
    router.back();
  }

  // Pick a screenshot/photo of a QR (no camera permission needed for the photo library on Android 13+).
  async function fromPhoto() {
    setErr("");
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (pick.canceled || !pick.assets[0]) return;
    const found = await scanFromURLAsync(pick.assets[0].uri, ["qr"]).catch(() => []);
    if (!found[0]) return setErr("Couldn't find a Kin code in that photo. Try again closer.");
    await handle(found[0].data);
  }

  // Code from another app: pay that account directly (Pay shows its Kin name if it has one).
  function payAccount(to: Address, units: bigint | null) {
    done.current = true;
    Vibration.vibrate(30);
    router.replace(`/send?to=${to}${units ? `&amt=${units}` : ""}` as Href);
  }

  return (
    <Screen title="Scan to pay" back>
      <View style={{ aspectRatio: 3 / 4, borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2 }}>
        {perm?.granted ? (
          <CameraView style={{ flex: 1 }} facing="back" enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => void handle(data)} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
            <Text style={{ color: t.muted, textAlign: "center" }}>
              {perm && !perm.canAskAgain ? "Camera is off for Kin. Turn it on in your phone's settings." : "Kin needs your camera to scan codes."}
            </Text>
            {(!perm || perm.canAskAgain) && <Button title="Allow camera" onPress={requestPerm} />}
          </View>
        )}
        {perm?.granted && (
          <Pressable onPress={() => setTorch((v) => !v)} accessibilityLabel="Flashlight" accessibilityState={{ checked: torch }}
            style={{ position: "absolute", right: 16, bottom: 16, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: torch ? t.ink : t.surface }}>
            <Flashlight color={torch ? t.bg : t.ink} size={22} />
          </Pressable>
        )}
      </View>
      <Text style={{ color: t.muted, textAlign: "center" }}>Point at someone&apos;s Kin QR. Their name and amount fill in for you.</Text>
      <ErrorText>{err}</ErrorText>
      <View style={{ marginTop: "auto" }}>
        <Button title="Scan from a photo" variant="ghost" onPress={() => void fromPhoto()} />
      </View>
    </Screen>
  );
}
