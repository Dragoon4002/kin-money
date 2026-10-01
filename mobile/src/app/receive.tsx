import QRCode from "qrcode";
import { useMemo, useState } from "react";
import { Share, Text, TextInput, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Button, Label, Screen, Serif, useInputStyle } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { currencySymbol, formatMoney, fromLocal } from "@/lib/money";
import { payLink } from "@/lib/payLink";
import { useTheme } from "@/theme";

/** QR as one SVG path; always dark-on-light so every camera reads it. */
function PayQr({ text, label }: { text: string; label: string }) {
  const t = useTheme();
  const { size, d } = useMemo(() => {
    const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
    let d = "";
    for (let i = 0; i < data.length; i++) if (data[i]) d += `M${i % size} ${Math.floor(i / size)}h1v1h-1z`;
    return { size, d };
  }, [text]);
  return (
    <Svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} width="100%" style={{ aspectRatio: 1 }} accessibilityLabel={label}>
      <Rect x={-2} y={-2} width={size + 4} height={size + 4} fill={t.qrBg} />
      <Path d={d} fill={t.qrInk} />
    </Svg>
  );
}

export default function Receive() {
  const t = useTheme();
  const input = useInputStyle();
  const { profile } = useAccount();
  const handle = profile?.name ?? "";
  const [amount, setAmount] = useState("");
  // Amount is optional: with it, the payer's screen opens pre-filled with this exact amount.
  const units = /^\d{1,9}(\.\d{0,2})?$/.test(amount) && Number(amount) > 0 ? fromLocal(amount) : 0n;
  const url = handle ? payLink(handle, units) : "";

  function doShare() {
    const text = units ? `Pay me ${formatMoney(units)} on Kin: @${handle}` : `Pay me on Kin: @${handle}`;
    void Share.share({ message: `${text} ${url}` });
  }

  return (
    <Screen title="My QR" back scroll>
      <View style={{ alignItems: "center", borderRadius: 32, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 24, gap: 6 }}>
        <Serif size={36}>@{handle}</Serif>
        <Text style={{ color: t.muted }}>{units ? `Scan to pay ${formatMoney(units)}` : "Scan with any phone camera to pay me"}</Text>
        <View style={{ width: "100%", maxWidth: 288, marginTop: 16, borderRadius: 24, overflow: "hidden" }}>
          {url ? <PayQr text={url} label={`QR code to pay @${handle}`} /> : null}
        </View>
      </View>
      <Label>Ask for an amount (optional)</Label>
      <View style={{ justifyContent: "center" }}>
        <Text style={{ position: "absolute", left: 16, color: t.muted, fontSize: 17, fontWeight: "600" }}>{currencySymbol()}</Text>
        <TextInput style={[input, { paddingLeft: 40 }]} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={t.muted}
          value={amount} onChangeText={(v) => /^\d{0,9}(\.\d{0,2})?$/.test(v) && setAmount(v)} />
      </View>
      <View style={{ marginTop: "auto" }}>
        <Button title="Share my pay link" onPress={doShare} disabled={!url} />
      </View>
    </Screen>
  );
}
