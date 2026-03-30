
import React, { useState } from "react";
import { View, TextInput, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING } from "../../constants";

export default function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  leftIcon,
  rightIcon,
  error,
  multiline,
  editable = true,
  style,
  inputRef,
  ...textInputProps
}) {
  const [secure, setSecure] = useState(secureTextEntry || false);
  const [focused, setFocused] = useState(false);

  const mergedInputProps = {
    autoCorrect: false,
    autoCapitalize: "none",
    selectionColor: COLORS.primary,
    cursorColor: COLORS.primary,
    underlineColorAndroid: "transparent",
    androidDisableFullscreenInput: true,
    importantForAutofill: "yes",
    ...textInputProps,
  };

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrap, focused && styles.focused, error && styles.errorBorder, !editable && styles.disabled]}>
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          ref={inputRef}
          style={[styles.input, leftIcon && styles.inputWithLeft, (secureTextEntry || rightIcon) && styles.inputWithRight, multiline && styles.multiline]}
          placeholder={placeholder}
          placeholderTextColor={COLORS.gray}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secure}
          keyboardType={keyboardType || "default"}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          editable={editable}
          {...mergedInputProps}
        />
        {secureTextEntry && (
          <TouchableOpacity onPress={() => setSecure(!secure)} style={styles.rightIcon}>
            <Ionicons name={secure ? "eye-off" : "eye"} size={20} color={COLORS.gray} />
          </TouchableOpacity>
        )}
        {!secureTextEntry && rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: SPACING.md },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.text, marginBottom: 6, letterSpacing: 0.3 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: "transparent" },
  focused: { borderColor: COLORS.primary, backgroundColor: COLORS.white, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
  errorBorder: { borderColor: COLORS.error },
  disabled: { opacity: 0.6 },
  input: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, fontSize: 15, color: COLORS.text },
  inputWithLeft: { paddingLeft: 8 },
  inputWithRight: { paddingRight: 8 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  leftIcon: { paddingLeft: 14 },
  rightIcon: { paddingRight: 14 },
  error: { fontSize: 12, color: COLORS.error, marginTop: 4, marginLeft: 4 },
});
