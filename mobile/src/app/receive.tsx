import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { type Ref, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, Share, ToastAndroid, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { KinkoArt } from "@/components/Kinko";
import { Button, Label, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { shortAddr, useAvatarLook } from "@/lib/names";
import { currencySymbol, formatMoney, fromLocal } from "@/lib/money";
import { payLink, walletUri } from "@/lib/payLink";
import { QR_BG, QR_INK, QUIET, qrArt } from "@/lib/qrArt";
import { useTheme } from "@/theme";

/** Kin's one payment QR: round dots, rounded eyes, my Kinko in the middle. Always dark-on-light so every camera reads it. */
export function PayQr({ text, label, svgRef }: { text: string; label: string; svgRef?: Ref<Svg> }) {
  const { profile } = useAccount();
  const look = useAvatarLook(profile?.name);
  const { size, dots, eyes, c, logo } = useMemo(() => qrArt(text), [text]);
  const k = logo * 0.96;
  const box = size + 2 * QUIET;
  return (
    <Svg ref={svgRef} viewBox={`${-QUIET} ${-QUIET} ${box} ${box}`} width="100%" style={{ aspectRatio: 1 }} accessibilityLabel={label}>
      <Defs><ClipPath id="kin-qr-badge"><Circle cx={c} cy={c} r={logo / 2} /></ClipPath></Defs>
      <Rect x={-QUIET} y={-QUIET} width={box} height={box} fill={QR_BG} />
      <Path d={dots} fill={QR_INK} />
      {eyes.map(([x, y]) => (
        <G key={`${x}-${y}`}>
          <Rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.8} fill="none" stroke={QR_INK} strokeWidth={1} />
          <Rect x={x + 2} y={y + 2} width={3} height={3} rx={1} fill={QR_INK} />
        </G>
      ))}
      <Circle cx={c} cy={c} r={logo / 2} fill={QR_BG} />
      <G clipPath="url(#kin-qr-badge)">
        <G transform={`translate(${c - k / 2} ${c - k / 2}) scale(${k / 160}) translate(-20 16)`}>
          <KinkoArt look={look} />
        </G>
      </G>
    </Svg>
  );
}

const SCAN_LINE = "Scan with Kin or any wallet app";

export default function Receive() {
  const t = useTheme();
  const input = useInputStyle();
  const { profile } = useAccount();
  const handle = profile?.name ?? "";
  const [amount, setAmount] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  // Amount is optional: with it, the payer's screen opens pre-filled with this exact amount.
  const units = /^\d{1,9}(\.\d{0,2})?$/.test(amount) && Number(amount) > 0 ? fromLocal(amount) : 0n;
  const url = handle ? payLink(handle, units) : "";
  // The link reaches people without an app; the QR is the standard payment code Kin and other apps both read.
  const qr = profile ? walletUri(profile.address, units) : "";

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
        <Serif size={36}>@{handle}</Serif>
        <Text style={{ color: t.muted, textAlign: "center" }}>{units ? `Pay ${formatMoney(units)}` : "Pay me"}</Text>
        <View style={{ width: "100%", maxWidth: 288, marginTop: 16, borderRadius: 24, overflow: "hidden" }}>
          {url && qr ? <PayQr svgRef={qrRef} text={qr} label={`QR code to pay @${handle}`} /> : null}
        </View>
        <Text style={{ color: t.muted, textAlign: "center", marginTop: 8 }}>{SCAN_LINE}</Text>
        {/* Some wallets show the scanned address instead of a pay screen: let people copy it to compare or paste. */}
        {profile && (
          <Pressable accessibilityRole="button" style={{ minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}
            onPress={() => void Clipboard.setStringAsync(profile.address).then(() => {
              if (Platform.OS === "android") ToastAndroid.show("Copied", ToastAndroid.SHORT);
              setAddrCopied(true);
            })}>
            <Text style={{ color: t.brand, fontWeight: "600" }}>{addrCopied ? "Copied ✓" : "Copy wallet address"}</Text>
            <Text style={{ color: t.muted, fontSize: 12, fontFamily: "monospace" }}>{shortAddr(profile.address)}</Text>
          </Pressable>
        )}
      </View>
      <Label>Ask for an amount (optional)</Label>
      <View style={{ justifyContent: "center" }}>
        <Text style={{ position: "absolute", left: 16, color: t.muted, fontSize: 17, fontWeight: "600" }}>{currencySymbol()}</Text>
        <TextInput style={[input, { paddingLeft: 40 }]} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={t.muted}
          value={amount} onChangeText={(v) => /^\d{0,9}(\.\d{0,2})?$/.test(v) && (setAmount(v), setLinkCopied(false))} />
      </View>
      <View style={{ marginTop: "auto" }}>
        <Button title="Share my QR" onPress={() => void doShare()} disabled={!url} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Button variant="soft" title="WhatsApp" onPress={whatsApp} disabled={!url} /></View>
          <View style={{ flex: 1 }}><Button variant="soft" title={linkCopied ? "Copied ✓" : "Copy link"} onPress={() => void copyLink()} disabled={!url} /></View>
        </View>
      </View>
    </Screen>
  );
}
