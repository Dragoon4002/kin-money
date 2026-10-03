import * as Clipboard from "expo-clipboard";
import QRCode from "qrcode";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { type Ref, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, Share, ToastAndroid, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Button, Label, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { currencySymbol, formatMoney, fromLocal } from "@/lib/money";
import { payLink, walletUri } from "@/lib/payLink";
import { useTheme } from "@/theme";

/** QR as one SVG path; always dark-on-light so every camera reads it. */
export function PayQr({ text, label, svgRef }: { text: string; label: string; svgRef?: Ref<Svg> }) {
  const t = useTheme();
  const { size, d } = useMemo(() => {
    const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
    let d = "";
    for (let i = 0; i < data.length; i++) if (data[i]) d += `M${i % size} ${Math.floor(i / size)}h1v1h-1z`;
    return { size, d };
  }, [text]);
  return (
    <Svg ref={svgRef} viewBox={`-2 -2 ${size + 4} ${size + 4}`} width="100%" style={{ aspectRatio: 1 }} accessibilityLabel={label}>
      <Rect x={-2} y={-2} width={size + 4} height={size + 4} fill={t.qrBg} />
      <Path d={d} fill={t.qrInk} />
    </Svg>
  );
}

const MODES = [["kin", "Kin app"], ["wallet", "Other wallet"]] as const;

export default function Receive() {
  const t = useTheme();
  const input = useInputStyle();
  const { profile } = useAccount();
  const handle = profile?.name ?? "";
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [mode, setMode] = useState<"kin" | "wallet">("kin");
  // Amount is optional: with it, the payer's screen opens pre-filled with this exact amount.
  const units = /^\d{1,9}(\.\d{0,2})?$/.test(amount) && Number(amount) > 0 ? fromLocal(amount) : 0n;
  const url = handle ? payLink(handle, units) : "";
  // Other wallet: standard payment code (EIP-681) to my account, same amount.
  const qr = mode === "wallet" && profile ? walletUri(profile.address, units) : url;

  const qrRef = useRef<Svg>(null);
  const text = units ? `Pay me ${formatMoney(units)} on Kin: @${handle}` : `Pay me on Kin: @${handle}`;

  // The QR as a PNG via the share sheet; falls back to the link.
  async function doShare() {
    try {
      if (!qrRef.current || !(await Sharing.isAvailableAsync())) throw new Error("no share sheet");
      const b64 = await new Promise<string>((ok) => qrRef.current!.toDataURL(ok, { width: 720, height: 720 }));
      const file = new File(Paths.cache, `kin-qr-${Date.now()}.png`);
      file.write(b64, { encoding: "base64" });
      await Sharing.shareAsync(file.uri, { mimeType: "image/png", dialogTitle: text });
    } catch {
      await Share.share({ message: `${text} ${url}` }).catch(() => {});
    }
  }

  function whatsApp() {
    const msg = encodeURIComponent(`${text} ${url}`);
    Linking.openURL(`whatsapp://send?text=${msg}`).catch(() => Linking.openURL(`https://wa.me/?text=${msg}`).catch(() => {}));
  }

  async function copyLink() {
    await Clipboard.setStringAsync(url);
    if (Platform.OS === "android") ToastAndroid.show("Copied", ToastAndroid.SHORT);
    setLinkCopied(true);
  }

  return (
    <Screen title="My QR" back scroll>
      <View style={{ alignItems: "center", borderRadius: 32, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 24, gap: 6 }}>
        {mode === "wallet" && <Text style={{ color: t.muted }}>Pay to</Text>}
        <Serif size={36}>@{handle}</Serif>
        <Text style={{ color: t.muted, textAlign: "center" }}>
          {mode === "wallet" ? (units ? `Scan from another app to pay ${formatMoney(units)}` : "Scan from another app to pay me") : units ? `Scan to pay ${formatMoney(units)}` : "Scan with any phone camera to pay me"}
        </Text>
        <View style={{ width: "100%", maxWidth: 288, marginTop: 16, borderRadius: 24, overflow: "hidden" }}>
          {url && qr ? <PayQr svgRef={qrRef} text={qr} label={`QR code to pay @${handle}`} /> : null}
        </View>
        {mode === "wallet" && profile && (
          <>
            <Text style={{ color: t.muted, fontSize: 12, textAlign: "center", marginTop: 8 }}>Works with wallets that support Monad. Send Agora dollars (AUSD) on Monad.</Text>
            <Pressable onPress={() => void Clipboard.setStringAsync(profile.address).then(() => setCopied(true))} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
              <Text style={{ color: t.brand, fontWeight: "600" }}>{copied ? "Copied ✓" : "Copy wallet address"}</Text>
            </Pressable>
          </>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="tablist">
        {MODES.map(([v, label]) => (
          <Pressable key={v} onPress={() => setMode(v)} accessibilityRole="tab" accessibilityState={{ selected: mode === v }}
            style={{ height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center", backgroundColor: mode === v ? t.ink : t.surface2 }}>
            <Text style={{ fontWeight: "600", color: mode === v ? t.bg : t.muted }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Label>Ask for an amount (optional)</Label>
      <View style={{ justifyContent: "center" }}>
        <Text style={{ position: "absolute", left: 16, color: t.muted, fontSize: 17, fontWeight: "600" }}>{currencySymbol()}</Text>
        <TextInput style={[input, { paddingLeft: 40 }]} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={t.muted}
          value={amount} onChangeText={(v) => /^\d{0,9}(\.\d{0,2})?$/.test(v) && (setAmount(v), setLinkCopied(false))} />
      </View>
      {mode === "kin" && (
        <View style={{ marginTop: "auto" }}>
          <Button title="Share my QR" onPress={() => void doShare()} disabled={!url} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Button variant="soft" title="WhatsApp" onPress={whatsApp} disabled={!url} /></View>
            <View style={{ flex: 1 }}><Button variant="soft" title={linkCopied ? "Copied ✓" : "Copy link"} onPress={() => void copyLink()} disabled={!url} /></View>
          </View>
        </View>
      )}
    </Screen>
  );
}
