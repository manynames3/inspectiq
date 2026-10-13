import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

export function BrandWordmark() {
  return <View style={styles.row} accessibilityLabel="InspectIQ by Supreme AI Ventures">
    <Svg width={25} height={29} viewBox="0 0 32 36"><Path d="M16 2 30 26 16 20 2 26 16 2Z" fill={colors.blue} /><Path d="m2 31 14-6 14 6-14 4-14-4Z" fill={colors.blue} opacity={.5} /></Svg>
    <View><Text style={styles.name}>InspectIQ</Text><Text style={styles.byline}>SUPREME AI VENTURES</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  name: { color: colors.ink, fontSize: 20, fontWeight: "700", letterSpacing: -.6 },
  byline: { color: colors.muted, fontSize: 8, letterSpacing: .8, marginTop: 2 }
});
