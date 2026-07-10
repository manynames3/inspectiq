import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from "react-native";
import { colors } from "../theme";

export function Field({ label, error, keyboardType, ...props }: TextInputProps & {
  label: string;
  error?: string | null;
  keyboardType?: KeyboardTypeOptions;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        placeholderTextColor="#8796AC"
        style={[styles.input, props.multiline && styles.multiline, error && styles.inputError, props.style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface, color: colors.ink, fontSize: 15, paddingHorizontal: 12 },
  multiline: { minHeight: 130, paddingTop: 12, textAlignVertical: "top" },
  inputError: { borderColor: colors.red },
  error: { color: colors.red, fontSize: 12 }
});
